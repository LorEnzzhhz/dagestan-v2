#!/usr/bin/env node
// ----------------------------------------------------------------------------
// local-models-server.mjs — Download GGUF models from Hugging Face Hub and
// expose them via an OpenAI-compatible /v1/chat/completions endpoint.
//
// Endpoints:
//   GET    /v1/models                       — list installed models
//   GET    /v1/models/resolve?repo=…        — list files in a HF repo
//   POST   /v1/models/download              — stream-download a .gguf (SSE progress)
//   DELETE /v1/models/:org/:repo/:file      — remove an installed file
//   GET    /v1/load                         — currently loaded model
//   POST   /v1/load                         — load a model into memory
//   DELETE /v1/load                         — unload
//   POST   /v1/chat/completions             — OpenAI-compatible chat (streams)
//
// Storage layout (mirrors HF Hub cache):
//   <modelsRoot>/<org>/<repo>/<file>.gguf   — model files
//   <modelsRoot>/_index.json                — installed-model registry
//
// Engine: when the optional `llama-cpp-node` package is installed, real
// inference is wired through it. Without it, the chat endpoint streams a
// deterministic stub so the rest of the app can be exercised end-to-end.
// ----------------------------------------------------------------------------

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { URL as NodeURL } from "node:url";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

const PREFERRED_PORT = parseInt(process.env.LOCAL_MODELS_PORT || "18927", 10);
// Bind to localhost by default. Set LOCAL_MODELS_HOST=0.0.0.0 + LOCAL_MODELS_LAN=1
// to expose on the LAN (you should also set LOCAL_MODELS_TOKEN for auth).
const HOST = (() => {
  if (process.env.LOCAL_MODELS_HOST) return process.env.LOCAL_MODELS_HOST;
  if (process.env.LOCAL_MODELS_LAN === "1") return "0.0.0.0";
  return "127.0.0.1";
})();
const MODELS_ROOT = process.env.LOCAL_MODELS_ROOT || path.join(os.homedir(), ".dagestan", "models");
const DEFAULT_CTX = parseInt(process.env.LOCAL_MODELS_CTX || "4096", 10);

// ── Auth ─────────────────────────────────────────────────────────────
// When bound to anything other than loopback, a bearer token is required.
// Tokens are accepted from either the Authorization header or the
// X-Dagestan-Token header (the latter exists because EventSource in
// browsers cannot send Authorization headers). In loopback mode the token
// is still issued and printed so devs can curl from other machines.
const TOKEN_FILE = path.join(MODELS_ROOT, "..", "auth.token");
function loadOrCreateToken() {
  if (process.env.LOCAL_MODELS_TOKEN) return process.env.LOCAL_MODELS_TOKEN;
  try {
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    const t = "dge_" + crypto.randomBytes(24).toString("hex");
    try {
      fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
      fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 });
    } catch { /* readonly fs — caller will see the env-var hint */ }
    return t;
  }
}
const AUTH_TOKEN = loadOrCreateToken();
const REQUIRES_AUTH = HOST !== "127.0.0.1" && HOST !== "localhost" && HOST !== "::1";
const OPEN_ROUTES = new Set(["/healthz", "/v1/port", "/v1/auth/check"]);

function checkAuth(req) {
  if (!REQUIRES_AUTH) return true;
  if (OPEN_ROUTES.has(new NodeURL(req.url, `http://${req.headers.host}`).pathname)) return true;
  const hdr = req.headers["authorization"] || "";
  const bearer = hdr.startsWith("Bearer ") ? hdr.slice(7).trim() : null;
  const xtoken = req.headers["x-dagestan-token"] || null;
  const provided = bearer || xtoken;
  if (!provided || provided !== AUTH_TOKEN) return false;
  return true;
}

// Port auto-shift: try the preferred port, then +1..+N. If every port is
// taken we give up cleanly instead of crashing. The resolved port is
// written to a sidecar file so the frontend and Android CodexServerManager
// can discover which port the server actually bound to.
const PORT_PROBE_MAX = parseInt(process.env.LOCAL_MODELS_PORT_PROBES || "5", 10);
const PORT_SIDECAR = path.join(MODELS_ROOT, "_port.json");
let RESOLVED_PORT = PREFERRED_PORT;

fs.mkdirSync(MODELS_ROOT, { recursive: true });

const INDEX_FILE = path.join(MODELS_ROOT, "_index.json");

// ── Sync store ───────────────────────────────────────────────────────
const SYNC_DIR = path.join(MODELS_ROOT, "..", "sync");
const SYNC_FILE = path.join(SYNC_DIR, "store.json");
fs.mkdirSync(SYNC_DIR, { recursive: true });
const syncStore = (() => {
  const state = {
    manifest: null,
    chats: {},
  };
  try {
    const raw = fs.readFileSync(SYNC_FILE, "utf8");
    const parsed = JSON.parse(raw);
    state.manifest = parsed.manifest ?? null;
    state.chats = parsed.chats ?? {};
  } catch {
    /* fresh store */
  }
  function save() {
    try {
      fs.writeFileSync(SYNC_FILE, JSON.stringify({ manifest: state.manifest, chats: state.chats }, null, 2));
    } catch (e) {
      console.error("[sync] save failed:", e.message);
    }
  }
  return Object.assign(state, { save });
})();

// ── Job manager ─────────────────────────────────────────────────────
const jobs = (() => {
  const all = new Map();
  const subscribers = new Map(); // jobId → Set<res>

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function emit(job, event, data) {
    const subs = subscribers.get(job.id);
    if (!subs) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of subs) {
      try { res.write(payload); } catch { /* gone */ }
    }
  }

  function create(kind, payload) {
    const id = uid();
    const job = {
      id,
      kind,
      payload,
      state: "queued",
      createdAt: Date.now(),
      result: undefined,
      error: undefined,
    };
    all.set(id, job);
    // Run async so the POST returns immediately
    setImmediate(() => runJob(job));
    return job;
  }

  function get(id) {
    return all.get(id) ?? null;
  }

  function list() {
    return Array.from(all.values()).filter((j) => j.state !== "done" && j.state !== "failed" && j.state !== "cancelled");
  }

  function cancel(id) {
    const job = all.get(id);
    if (!job) return false;
    if (job.state === "done" || job.state === "failed") return false;
    job.state = "cancelled";
    emit(job, "cancelled", { id, state: job.state });
    return true;
  }

  function subscribe(req, res, job) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    // Replay current state
    emit({ id: job.id }, "snapshot", { id: job.id, state: job.state, payload: job.payload, result: job.result, error: job.error });
    let set = subscribers.get(job.id);
    if (!set) { set = new Set(); subscribers.set(job.id, set); }
    set.add(res);
    req.on("close", () => {
      set.delete(res);
      if (set.size === 0) subscribers.delete(job.id);
    });
    // Heartbeat to keep the connection alive
    const hb = setInterval(() => {
      try { res.write(": ping\n\n"); } catch { /* gone */ }
    }, 15_000);
    req.on("close", () => clearInterval(hb));
  }

  async function runJob(job) {
    job.state = "running";
    job.startedAt = Date.now();
    emit(job, "started", { id: job.id, state: job.state });
    try {
      const handler = handlers[job.kind];
      if (!handler) throw new Error(`unknown job kind: ${job.kind}`);
      const result = await handler(job, (progress) => {
        emit(job, "progress", { id: job.id, ...progress });
      });
      job.result = result;
      job.state = "done";
      job.finishedAt = Date.now();
      emit(job, "done", { id: job.id, state: job.state, result });
    } catch (e) {
      job.error = e.message ?? String(e);
      job.state = "failed";
      job.finishedAt = Date.now();
      emit(job, "failed", { id: job.id, state: job.state, error: job.error });
    }
  }

  // Handlers — wire up to existing functions. New kinds can be added
  // here without changing the public API.
  const handlers = {
    async "model-download"(job, onProgress) {
      const { repo, filename } = job.payload;
      if (!repo || !filename) throw new Error("repo and filename required");
      onProgress({ phase: "starting", downloaded: 0, total: 0 });
      const result = await downloadFile({ repo, filename, onProgress });
      const entry = recordInstall({ repo, filename, ...result });
      return entry;
    },
    async "health-check"(job, onProgress) {
      // Generic provider health check stub — real impl would call model-health
      onProgress({ phase: "running" });
      await new Promise((r) => setTimeout(r, 100));
      return { ok: true };
    },
  };

  return { create, get, list, cancel, subscribe };
})();

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  } catch {
    return { models: [] };
  }
}
function writeIndex(idx) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2));
}

// Optional real engine. We don't crash if it's missing — the stub mode
// still serves /v1/chat/completions with a deterministic response so the
// frontend can be exercised without paying the native compile cost.
//
// We use `node-llama-cpp` (v3 API) which ships a prebuilt native binary for
// arm64 linux via the @node-llama-cpp/linux-arm64 optional dep.
let engine = false;
let loadedModel = null;
let llamaMod = null;
let llamaHandle = null;
let llamaModel = null;
let llamaCtx = null;
let llamaSess = null;
try {
  llamaMod = await import("node-llama-cpp");
  llamaHandle = await llamaMod.getLlama();
  engine = true;
  console.log("[llm] node-llama-cpp loaded — real inference enabled");
} catch (e) {
  console.log("[llm] node-llama-cpp unavailable — running in stub mode:", e.message);
}

async function disposeLoadedModel() {
  try { llamaSess = null; } catch {}
  try { await llamaCtx?.dispose(); } catch {}
  try { await llamaModel?.dispose(); } catch {}
  llamaSess = null; llamaCtx = null; llamaModel = null;
}

async function loadRealModel(repo, filename, contextSize) {
  await disposeLoadedModel();
  const modelPath = path.join(MODELS_ROOT, repo, filename);
  if (!fs.existsSync(modelPath)) {
    throw new Error(`model file missing: ${modelPath}`);
  }
  console.log(`[llm] loading ${modelPath} (ctx=${contextSize})`);
  llamaModel = await llamaHandle.loadModel({ modelPath });
  llamaCtx = await llamaModel.createContext({ contextSize });
  llamaSess = new llamaMod.LlamaChatSession({ contextSequence: llamaCtx.getSequence() });
  console.log(`[llm] loaded ${repo}/${filename} — ready for inference`);
}

// ── HF Hub helpers ──────────────────────────────────────────────────────

const HF_BASE = "https://huggingface.co";

/** List files in a HF repo. Returns [{ filename, size, sha256 }]. */
async function resolveRepo(repo) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new Error(`Invalid repo id: ${repo}`);
  }
  const url = `${HF_BASE}/api/models/${repo}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HF API ${res.status} for ${repo}`);
  const meta = await res.json();
  const siblings = (meta.siblings || []).filter((s) => s.rfilename);

  // Try to enrich with sizes from the tree endpoint
  const treeRes = await fetch(`${HF_BASE}/api/models/${repo}/tree/main`, {
    headers: { Accept: "application/json" },
  });
  let tree = [];
  if (treeRes.ok) tree = await treeRes.json();
  const sizeMap = new Map();
  for (const entry of tree) {
    if (entry && typeof entry.size === "number") sizeMap.set(entry.path, entry.size);
  }
  return siblings.map((s) => ({
    filename: s.rfilename,
    size: sizeMap.get(s.rfilename) ?? null,
    sha256: null,
  }));
}

/** Download a single file from a HF repo with streaming + progress. */
async function downloadFile({ repo, filename, onProgress, signal }) {
  if (!repo || !filename) throw new Error("repo and filename are required");
  const url = `${HF_BASE}/${repo}/resolve/main/${filename}`;
  const outPath = path.join(MODELS_ROOT, repo, filename);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  // Resume support
  const existing = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
  const headers = { "User-Agent": "dagestan-local-models/1.0" };
  if (existing > 0) headers["Range"] = `bytes=${existing}-`;

  const res = await fetch(url, { headers, signal });
  if (!res.ok && res.status !== 206) {
    throw new Error(`HTTP ${res.status} downloading ${url}`);
  }
  const total = Number(res.headers.get("content-length")) + existing;
  const append = res.status === 206 || (existing > 0 && res.status === 200);

  const hasher = crypto.createHash("sha256");
  if (existing > 0) {
    // Hash the existing bytes first
    await new Promise((resolve, reject) => {
      const s = fs.createReadStream(outPath);
      s.on("data", (c) => hasher.update(c));
      s.on("end", resolve);
      s.on("error", reject);
    });
  }

  let downloaded = existing;
  let lastEmit = 0;
  const startTime = Date.now();
  const tracker = new Transform({
    transform(chunk, _enc, cb) {
      hasher.update(chunk);
      downloaded += chunk.length;
      const now = Date.now();
      if (now - lastEmit > 250) {
        lastEmit = now;
        const elapsed = (now - startTime) / 1000;
        const speed = elapsed > 0 ? (downloaded - existing) / elapsed : 0;
        const remaining = total > 0 ? Math.max(0, total - downloaded) : 0;
        const eta = speed > 0 ? remaining / speed : null;
        onProgress?.({
          phase: "downloading",
          downloaded,
          total,
          speed_bps: speed,
          eta_seconds: eta,
        });
      }
      cb(null, chunk);
    },
  });

  await pipeline(
    res.body,
    tracker,
    fs.createWriteStream(outPath, { flags: append ? "a" : "w" }),
  );

  onProgress?.({ phase: "verifying", downloaded, total });
  const sha256 = hasher.digest("hex");
  const size = fs.statSync(outPath).size;
  return { path: outPath, size_bytes: size, sha256 };
}

// ── Model registry ──────────────────────────────────────────────────────

function listInstalled() {
  const idx = readIndex();
  // Cross-check against filesystem; drop entries whose file is gone.
  const live = idx.models.filter((m) => fs.existsSync(m.path));
  if (live.length !== idx.models.length) writeIndex({ models: live });
  return live;
}

function recordInstall({ repo, filename, path: outPath, size_bytes, sha256 }) {
  const idx = readIndex();
  const id = `${repo}/${filename}`;
  const existing = idx.models.findIndex((m) => m.id === id);
  const entry = {
    id,
    repo,
    filename,
    path: outPath,
    size_bytes,
    sha256,
    downloaded_at: new Date().toISOString(),
  };
  if (existing >= 0) idx.models[existing] = entry;
  else idx.models.push(entry);
  writeIndex(idx);
  return entry;
}

function removeInstalled(repo, filename) {
  const idx = readIndex();
  const id = `${repo}/${filename}`;
  const before = idx.models.length;
  idx.models = idx.models.filter((m) => m.id !== id);
  writeIndex(idx);
  const entry = before === idx.models.length ? null : { id };
  // Remove the file (best effort)
  const p = path.join(MODELS_ROOT, repo, filename);
  try { fs.unlinkSync(p); } catch {}
  return entry;
}

// ── HTTP server ─────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new NodeURL(req.url, `http://${req.headers.host}`);
  const route = url.pathname;

  // ── Security headers (every response) ────────────────────────────
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  // No CORS by default. When bound to loopback (the default for the dev
  // stack) we auto-allow the well-known Dagestan dev origins so the
  // dashboard, chat, and models pages can reach the server without
  // needing a proxy. For LAN/non-loopback binds, CORS stays opt-in via
  // LOCAL_MODELS_CORS=1 — exposes /v1/models to other devices only when
  // the operator explicitly allows it.
  const reqOrigin = req.headers.origin;
  const corsOrigin =
    process.env.LOCAL_MODELS_CORS === "1"
      ? process.env.LOCAL_MODELS_CORS_ORIGIN || "*"
      : HOST === "127.0.0.1" || HOST === "localhost"
        ? reqOrigin && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(reqOrigin)
          ? reqOrigin
          : null
        : null;
  if (corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Dagestan-Token");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Auth gate ───────────────────────────────────────────────────
  if (!checkAuth(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Bearer realm="dagestan"' });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  // ── Token self-check (open route) ───────────────────────────────
  if (req.method === "GET" && route === "/v1/auth/check") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      requiresAuth: REQUIRES_AUTH,
      tokenHint: AUTH_TOKEN.slice(0, 4) + "…",
    }));
    return;
  }

  // ── Rate limit (per IP) ─────────────────────────────────────────
  const ip = (req.socket.remoteAddress || "0.0.0.0").replace(/^::ffff:/, "");
  if (!rateCheck(ip)) {
    res.writeHead(429, { "Retry-After": "30" });
    res.end(JSON.stringify({ error: "rate_limited" }));
    return;
  }

  try {
    // ── List installed models ────────────────────────────────────────
    if (req.method === "GET" && route === "/v1/models") {
      const models = listInstalled();
      json(res, 200, {
        object: "list",
        data: models.map((m) => ({
          id: m.id,
          object: "model",
          owned_by: "local",
          created: Math.floor(new Date(m.downloaded_at).getTime() / 1000),
          dagestan: {
            repo: m.repo,
            filename: m.filename,
            size_bytes: m.size_bytes,
            sha256: m.sha256,
          },
        })),
      });
      return;
    }

    // ── Health probe (used by ai-client.ts and Android) ─────────────
    if (req.method === "GET" && route === "/healthz") {
      json(res, 200, { ok: true, port: RESOLVED_PORT, host: HOST });
      return;
    }

    // ── Port discovery — returns the actually-bound port so clients
    //    that assumed the preferred port (18927) can follow shifts. ──
    if (req.method === "GET" && route === "/v1/port") {
      json(res, 200, {
        host: HOST,
        port: RESOLVED_PORT,
        preferred: PREFERRED_PORT,
        shifted: RESOLVED_PORT !== PREFERRED_PORT,
      });
      return;
    }

    // ── Resolve a HF repo (list files) ───────────────────────────────
    if (req.method === "GET" && route === "/v1/models/resolve") {
      const repo = url.searchParams.get("repo");
      if (!repo) return json(res, 400, { error: "repo query param required" });
      if (!safeRelative(repo)) return json(res, 400, { error: "invalid_repo" });
      const files = await resolveRepo(repo);
      json(res, 200, { object: "list", data: files });
      return;
    }

    // ── Download a model (SSE progress) ──────────────────────────────
    if (req.method === "POST" && route === "/v1/models/download") {
      const [body, err] = await readJson(req);
      if (err) return json(res, 400, { error: "invalid_json", message: err.message.split('\n')[0] });
      const { repo, filename } = body;
      if (!repo || !filename) {
        return json(res, 400, { error: "repo and filename required" });
      }
      if (!safeRelative(repo, filename)) return json(res, 400, { error: "invalid_path" });
      // Stream SSE: {event:"progress", data:{...}} then {event:"done", data:{...}}
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      });
      const emit = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      try {
        emit("progress", { phase: "starting", downloaded: 0, total: 0 });
        const result = await downloadFile({
          repo,
          filename,
          onProgress: (p) => emit("progress", p),
        });
        const entry = recordInstall({ repo, filename, ...result });
        emit("done", { ok: true, ...entry });
        res.end();
      } catch (e) {
        emit("error", { ok: false, error: e.message });
        res.end();
      }
      return;
    }

    // ── Delete a model ───────────────────────────────────────────────
    const delMatch = route.match(/^\/v1\/models\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (req.method === "DELETE" && delMatch) {
      const [, org, repo, ...rest] = delMatch;
      const filename = rest.join("/");
      if (!safeRelative(`${org}/${repo}`, filename)) return json(res, 400, { error: "invalid_path" });
      const entry = removeInstalled(`${org}/${repo}`, filename);
      if (!entry) return json(res, 404, { error: "not installed" });
      json(res, 200, { ok: true, deleted: entry.id });
      return;
    }

    // ── Load / unload ─────────────────────────────────────────────────
    if (req.method === "GET" && route === "/v1/load") {
      json(res, 200, { loaded: loadedModel });
      return;
    }
    if (req.method === "DELETE" && route === "/v1/load") {
      await disposeLoadedModel();
      loadedModel = null;
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && route === "/v1/load") {
      const [body, err] = await readJson(req);
      if (err) return json(res, 400, { error: "invalid_json", message: err.message.split('\n')[0] });
      const { repo, filename, context_size } = body;
      if (!safeRelative(repo, filename)) return json(res, 400, { error: "invalid_path" });
      const id = `${repo}/${filename}`;
      const idx = readIndex().models.find((m) => m.id === id);
      if (!idx) return json(res, 404, { error: "model not installed" });
      const ctx = Math.min(parseInt(context_size || DEFAULT_CTX, 10), 8192);
      try {
        if (engine) {
          await loadRealModel(repo, filename, ctx);
        }
        loadedModel = {
          repo,
          filename,
          size_bytes: idx.size_bytes,
          context_size: ctx,
          engine: engine ? "node-llama-cpp" : "stub",
          loaded_at: new Date().toISOString(),
        };
        json(res, 200, { ok: true, model: loadedModel });
      } catch (e) {
        console.error("[llm] load failed:", e.message);
        json(res, 500, { error: "load_failed", message: e.message });
      }
      return;
    }

    // ── OpenAI-compatible chat ───────────────────────────────────────
    if (req.method === "POST" && route === "/v1/chat/completions") {
      const [body, err] = await readJson(req);
      if (err) return json(res, 400, { error: "invalid_json", message: err.message.split('\n')[0] });
      const payload = body;
      const stream = payload.stream === true;
      if (stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        await streamChat(payload, res);
        res.end();
      } else {
        const text = await completeOnce(payload);
        json(res, 200, {
          id: `cmpl-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: payload.model,
          choices: [{
            index: 0,
            message: { role: "assistant", content: text },
            finish_reason: "stop",
          }],
          usage: { prompt_tokens: 0, completion_tokens: text.split(/\s+/).length, total_tokens: text.split(/\s+/).length },
        });
      }
      return;
    }

    // ── Lifecycle control ────────────────────────────────────────────
    if (req.method === "POST" && route === "/v1/control/restart") {
      json(res, 202, { ok: true, action: "restart" });
      // Defer exit so the JSON response can flush.
      setTimeout(() => {
        console.log("[control] restart requested — exiting (process manager should respawn)");
        process.exit(0);
      }, 100);
      return;
    }
    if (req.method === "POST" && route === "/v1/control/shutdown") {
      json(res, 202, { ok: true, action: "shutdown" });
      setTimeout(async () => {
        console.log("[control] shutdown requested — exiting");
        try { await disposeLoadedModel(); } catch {}
        process.exit(0);
      }, 100);
      return;
    }

    // ── TTS ─────────────────────────────────────────────────────────
    // Stub endpoint: when no TTS engine is installed we return 501 so the
    // client cascades to Web Speech API. When a real engine is wired in
    // (piper-cpp, Nemotron audio, etc.) it should return audio/mpeg bytes
    // and Content-Length matching the buffer.
    if (req.method === "GET" && route === "/v1/tts/voices") {
      json(res, 200, {
        voices: engine ? [
          { id: "default", name: "Default", language: "en-US", gender: "neutral" },
        ] : [],
        engine: engine ? "stub" : "none",
      });
      return;
    }
    if (req.method === "POST" && route === "/v1/tts") {
      // No engine installed — respond 501 so client falls back to Web Speech.
      json(res, 501, {
        error: "no_tts_engine",
        message: "Install a TTS engine (piper-cpp, etc.) on the local-models server to enable server-side speech.",
      });
      return;
    }

    // ── Cross-device sync (server stores only ciphertext blobs) ────
    if (req.method === "POST" && route === "/v1/sync/init") {
      const [body, err] = await readJson(req);
      if (err) return json(res, 400, { error: "invalid_json", message: err.message.split('\n')[0] });
      const { salt } = body;
      if (!salt) return json(res, 400, { error: "salt required" });
      if (typeof salt !== "string" || salt.length === 0 || salt.length > 1024) {
        return json(res, 400, { error: "salt_length_invalid" });
      }
      syncStore.manifest = { salt, updatedAt: Date.now() };
      syncStore.chats = {};
      syncStore.save();
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && route === "/v1/sync/chats") {
      const [body, err] = await readJson(req);
      if (err) return json(res, 400, { error: "invalid_json", message: err.message.split('\n')[0] });
      const blob = body;
      if (!blob.id || !blob.iv || !blob.ciphertext) {
        return json(res, 400, { error: "id, iv, ciphertext required" });
      }
      if (typeof blob.id !== "string" || blob.id.length === 0 || blob.id.length > 256) {
        return json(res, 400, { error: "id_length_invalid" });
      }
      if (typeof blob.iv !== "string" || blob.iv.length > 1024) {
        return json(res, 400, { error: "iv_length_invalid" });
      }
      if (typeof blob.ciphertext !== "string" || blob.ciphertext.length > 8 * 1024 * 1024) {
        return json(res, 400, { error: "ciphertext_too_large" });
      }
      syncStore.chats[blob.id] = {
        id: blob.id,
        iv: blob.iv,
        ciphertext: blob.ciphertext,
        updatedAt: blob.updatedAt ?? Date.now(),
      };
      syncStore.manifest.updatedAt = Date.now();
      syncStore.save();
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && route === "/v1/sync/chats") {
      const since = parseInt(url.searchParams.get("since") ?? "0", 10);
      const list = Object.values(syncStore.chats).filter((c) => c.updatedAt > since);
      json(res, 200, { chats: list, manifest: syncStore.manifest });
      return;
    }
    if (req.method === "DELETE" && route === "/v1/sync/wipe") {
      syncStore.manifest = null;
      syncStore.chats = {};
      syncStore.save();
      json(res, 200, { ok: true });
      return;
    }

    // ── Background jobs ──────────────────────────────────────────────
    // POST /v1/jobs              — create a job (kind + payload)
    // GET  /v1/jobs              — list active jobs
    // GET  /v1/jobs/:id          — current job state (one-shot poll)
    // GET  /v1/jobs/:id/events   — SSE stream of progress + completion
    // DELETE /v1/jobs/:id        — cancel
    if (req.method === "POST" && route === "/v1/jobs") {
      const [body, err] = await readJson(req);
      if (err) return json(res, 400, { error: "invalid_json", message: err.message.split('\n')[0] });
      const { kind, payload } = body;
      const job = jobs.create(kind, payload ?? {});
      json(res, 201, { id: job.id, state: job.state });
      return;
    }
    if (req.method === "GET" && route === "/v1/jobs") {
      json(res, 200, { jobs: jobs.list() });
      return;
    }
    const jobMatch = route.match(/^\/v1\/jobs\/([^\/]+)(\/events)?$/);
    if (jobMatch && req.method === "GET" && jobMatch[2] === "/events") {
      const job = jobs.get(jobMatch[1]);
      if (!job) return json(res, 404, { error: "not found" });
      jobs.subscribe(req, res, job);
      return;
    }
    if (jobMatch && req.method === "GET") {
      const job = jobs.get(jobMatch[1]);
      if (!job) return json(res, 404, { error: "not found" });
      json(res, 200, job);
      return;
    }
    if (jobMatch && req.method === "DELETE") {
      const ok = jobs.cancel(jobMatch[1]);
      json(res, ok ? 200 : 404, ok ? { ok: true } : { error: "not found" });
      return;
    }

    // ── Health ───────────────────────────────────────────────────────
    if (req.method === "GET" && route === "/healthz") {
      json(res, 200, {
        ok: true,
        models_root: MODELS_ROOT,
        engine: engine ? "node-llama-cpp" : "stub",
        loaded: loadedModel,
      });
      return;
    }

    json(res, 404, { error: "not found", route });
  } catch (e) {
    console.error("[err]", e);
    if (!res.headersSent) json(res, 500, { error: e.message });
    else res.end();
  }
});

// ── Inference ───────────────────────────────────────────────────────────

async function completeOnce(payload) {
  if (engine && loadedModel && llamaSess) {
    try {
      const reply = await llamaSess.prompt(llamaMessages(payload), {
        temperature: payload.temperature ?? 0.7,
        maxTokens: payload.max_tokens ?? 512,
        topP: payload.top_p ?? 0.95,
      });
      return typeof reply === "string" ? reply : String(reply);
    } catch (e) {
      console.error("[llm] inference error:", e.message);
      return stubReply(payload, e.message);
    }
  }
  return stubReply(payload);
}

/** Map OpenAI-style messages to node-llama-cpp v3 ChatHistoryItem[]. */
function llamaMessages(payload) {
  const msgs = Array.isArray(payload.messages) ? payload.messages : [];
  return msgs.map((m) => ({
    type: "message",
    role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
    text: String(m.content ?? ""),
  }));
}

async function streamChat(payload, res) {
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = payload.model;

  // Open a SSE chunk immediately so the client sees progress even on slow loads.
  res.write(`data: ${JSON.stringify({
    id, object: "chat.completion.chunk", created, model,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  })}\n\n`);

  try {
    if (engine && loadedModel && llamaSess) {
      // Real streaming inference via node-llama-cpp v3.
      await llamaSess.prompt(llamaMessages(payload), {
        temperature: payload.temperature ?? 0.7,
        maxTokens: payload.max_tokens ?? 512,
        topP: payload.top_p ?? 0.95,
        onTextChunk: (chunk) => {
          const text = typeof chunk === "string" ? chunk : String(chunk);
          res.write(`data: ${JSON.stringify({
            id, object: "chat.completion.chunk", created, model,
            choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
          })}\n\n`);
        },
      });
    } else {
      // Stub mode: stream the deterministic placeholder with a tiny delay.
      const reply = stubReply(payload);
      const words = reply.split(/(\s+)/);
      for (const w of words) {
        res.write(`data: ${JSON.stringify({
          id, object: "chat.completion.chunk", created, model,
          choices: [{ index: 0, delta: { content: w }, finish_reason: null }],
        })}\n\n`);
        await new Promise((r) => setTimeout(r, 12));
      }
    }
  } catch (e) {
    console.error("[llm] stream error:", e.message);
    res.write(`data: ${JSON.stringify({
      id, object: "chat.completion.chunk", created, model,
      choices: [{ index: 0, delta: { content: `\n[error: ${e.message}]` }, finish_reason: null }],
    })}\n\n`);
  }

  // Final chunk + done sentinel.
  res.write(`data: ${JSON.stringify({
    id, object: "chat.completion.chunk", created, model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  })}\n\n`);
  res.write("data: [DONE]\n\n");
}

function stubReply(payload, errNote) {
  const last = (payload.messages || []).filter((m) => m.role === "user").slice(-1)[0];
  const userText = (last?.content || "").slice(0, 200);
  const model = payload.model || "local";
  const head = errNote
    ? `[Local model stub — engine error: ${errNote}]\n\n`
    : `[Local model stub — no llama-cpp-node installed, so this is a deterministic placeholder. Install llama-cpp-node and restart to get real inference.]\n\n`;
  return `${head}Model: \`${model}\`\nYou said: ${userText}\n\nReply would stream here once a real engine is wired in.`;
}

// ── Utility ─────────────────────────────────────────────────────────────

function json(res, code, payload) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Safe JSON parse: returns [value, null] on success or [null, err] on
// failure. Callers can do `const [body, err] = readJson(req); if (err) ...`
// and avoid leaking stack traces.
async function readJson(req, maxBytes) {
  try {
    const raw = await readBody(req, maxBytes);
    if (!raw || !raw.trim()) return [{}, null];
    return [JSON.parse(raw), null];
  } catch (e) {
    return [null, e];
  }
}

// ── Path sanitizer ──────────────────────────────────────────────────
// Validates that a user-supplied repo/filename resolves inside
// MODELS_ROOT. Returns the safe relative path on success, or null on
// any rejection (absolute path, traversal, NUL byte, control chars).
function safeRelative(...parts) {
  for (const p of parts) {
    if (typeof p !== "string") return null;
    if (p.length === 0 || p.length > 512) return null;
    if (p.includes("\0") || /[\x00-\x1f]/.test(p)) return null;
    if (p.startsWith("/") || p.startsWith("\\")) return null;
    if (p.includes("..")) return null;
  }
  const joined = path.join(...parts);
  const resolved = path.resolve(MODELS_ROOT, joined);
  if (!resolved.startsWith(path.resolve(MODELS_ROOT) + path.sep) && resolved !== path.resolve(MODELS_ROOT)) {
    return null;
  }
  return joined;
}

// ── Rate limiter ────────────────────────────────────────────────────
// In-memory token bucket per IP. Buckets auto-evict after 10 min idle.
// Buckets are minimal: { tokens, lastRefill }. 30 req/min/IP is plenty
// for an interactive UI; bulk downloads use the SSE channel.
const RATE_BUCKETS = new Map();
const RATE_LIMIT = parseInt(process.env.LOCAL_MODELS_RATE_LIMIT || "30", 10);   // tokens
const RATE_WINDOW = parseInt(process.env.LOCAL_MODELS_RATE_WINDOW || "60000", 10); // ms
function rateCheck(ip) {
  if (!REQUIRES_AUTH) return true; // skip on loopback
  const now = Date.now();
  let b = RATE_BUCKETS.get(ip);
  if (!b) { b = { tokens: RATE_LIMIT, last: now }; RATE_BUCKETS.set(ip, b); }
  const elapsed = now - b.last;
  if (elapsed >= RATE_WINDOW) {
    b.tokens = RATE_LIMIT;
    b.last = now;
  } else {
    b.tokens = Math.min(RATE_LIMIT, b.tokens + (elapsed / RATE_WINDOW) * RATE_LIMIT);
    b.last = now;
  }
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
// Evict idle buckets periodically.
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [ip, b] of RATE_BUCKETS) {
    if (b.last < cutoff) RATE_BUCKETS.delete(ip);
  }
}, 60_000).unref();


function writePortSidecar(port) {
  try {
    fs.mkdirSync(MODELS_ROOT, { recursive: true });
    fs.writeFileSync(
      PORT_SIDECAR,
      JSON.stringify(
        { host: HOST, port, preferred: PREFERRED_PORT, pid: process.pid, ts: Date.now() },
        null,
        2,
      ),
    );
  } catch (err) {
    console.warn("[local-models] could not write port sidecar:", err?.message);
  }
}

function tryListen(port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, HOST);
  });
}

async function listenWithShift() {
  const attempts = [PREFERRED_PORT];
  for (let i = 1; i <= PORT_PROBE_MAX; i++) attempts.push(PREFERRED_PORT + i);

  let lastErr;
  for (const port of attempts) {
    try {
      await tryListen(port);
      RESOLVED_PORT = port;
      const shifted = port !== PREFERRED_PORT;
      console.log(
        `[local-models] listening on http://${HOST}:${port}` +
          (shifted ? ` (shifted from preferred ${PREFERRED_PORT})` : ""),
      );
      console.log(`[local-models] models root: ${MODELS_ROOT}`);
      console.log(`[local-models] HF base:     ${HF_BASE}`);
      console.log(`[local-models] engine:       ${engine ? "node-llama-cpp" : "stub"}`);
      if (shifted) {
        // Hint to the frontend so the next probe reads the right port
        process.env.LOCAL_MODELS_PORT = String(port);
      }
      writePortSidecar(port);
      return;
    } catch (err) {
      lastErr = err;
      if (err && err.code === "EADDRINUSE") {
        console.warn(`[local-models] port ${port} in use, trying next…`);
        continue;
      }
      throw err;
    }
  }

  console.error(
    `[local-models] could not bind any port from ${PREFERRED_PORT}..${PREFERRED_PORT + PORT_PROBE_MAX}`,
  );
  console.error(`[local-models] last error:`, lastErr);
  process.exit(1);
}

await listenWithShift();
