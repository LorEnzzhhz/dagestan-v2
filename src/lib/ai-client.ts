// ---------------------------------------------------------------------------
// ai-client.ts — Direct browser-side streaming to AI providers.
// No server proxy, no Convex. User provides their own API keys.
// ---------------------------------------------------------------------------

import type { ProviderId } from "./models";
import { getApiKeys } from "./store";
import { reportSuccess, reportError } from "./api-key-pool";
import { recordModelSuccess, recordModelFailure } from "./model-health";


/** Cached port of the local-models server. Defaults to the preferred
 *  port; updated when /v1/port returns a shifted value. */
let _localModelPort: number = 18927;
let _localModelPortLastCheck = 0;

/** Read the resolved port from /v1/port. Throttled to once per 30s. */
export async function refreshLocalModelPort(): Promise<number> {
  const now = Date.now();
  if (now - _localModelPortLastCheck < 30_000 && _localModelPortLastCheck > 0) {
    return _localModelPort;
  }
  _localModelPortLastCheck = now;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1000);
    const r = await fetch(`http://127.0.0.1:${_localModelPort}/v1/port`, { signal: c.signal });
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      if (typeof j?.port === "number") _localModelPort = j.port;
    }
  } catch { /* ignore — keep cached value */ }
  return _localModelPort;
}

export function getLocalModelPort(): number {
  return _localModelPort;
}

/** Cached last-known reachability of the local-models server.
 *  Updated by `refreshLocalServerReachable()`; consulted by the sync
 *  `hasApiKey("local")` so the model-router can filter without
 *  awaiting a network probe on every check. */
let _localServerReachable: boolean | null = null;
let _localServerLastCheck = 0;

export interface ApiMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Stream from the local-models server. Mirrors the OpenAI-compatible
 *  SSE format used by llama.cpp / OpenCodex / Ollama. */
async function* streamLocal(opts: {
  model: string;
  messages: ApiMessage[];
  temperature?: number;
  signal?: AbortSignal;
  thinking?: boolean;
}): AsyncGenerator<string> {
  // Ensure the requested model is loaded into memory before streaming.
  // This is a no-op if the same model is already loaded; otherwise it
  // swaps the active model. Failures here fall through to the chat
  // request so the user gets a real error message from the server
  // (e.g. "model not installed") instead of a silent 500.
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 30_000);
    // opts.model is "owner/repo/filename.gguf" — split it into the
    // {repo, filename} shape the local-models server expects.
    const lastSlash = opts.model.lastIndexOf("/");
    const filename = lastSlash >= 0 ? opts.model.slice(lastSlash + 1) : opts.model;
    const repo = lastSlash >= 0 ? opts.model.slice(0, lastSlash) : "";
    const loadRes = await fetch(`http://127.0.0.1:${getLocalModelPort()}/v1/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo, filename }),
      signal: c.signal,
    });
    clearTimeout(t);
    if (!loadRes.ok) {
      const j = await loadRes.json().catch(() => null);
      const msg = (j && (j.error || j.message)) || `load failed (HTTP ${loadRes.status})`;
      throw new Error(`Local model load failed: ${msg}`);
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    throw err;
  }

  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${getLocalModelPort()}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: true,
        temperature: opts.temperature ?? 0.7,
      }),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    throw new Error(
      "Local models server unreachable. Start it with `npm run local-models` " +
        "or open Settings → Local Models to manage downloads.",
    );
  }

  if (!res.ok || !res.body) {
    let msg = `Local model request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = typeof j.error === "string" ? j.error : (j.error.message ?? msg);
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const chunk = JSON.parse(data);
          const text = chunk?.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch { /* ignore */ }
      }
    }
  }
}

type ProviderSpec = {
  url: string;
  keyField: keyof ReturnType<typeof getApiKeys> | null;
  extraHeaders?: Record<string, string>;
};
const PROVIDERS: Record<string, ProviderSpec> = {
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    keyField: "openrouter",
    extraHeaders: {
      "HTTP-Referer": "https://dagestan.app",
      "X-Title": "Dagestan",
    },
  },
  nvidia: {
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    keyField: "nvidia",
  },
  zen: {
    url: "https://opencode.ai/zen/v1/chat/completions",
    keyField: "zen",
  },
  // Local models: stream to the on-device llama.cpp / OpenCodex-style server
  // exposed by scripts/local-models/local-models-server.mjs (Android: managed
  // by LlamaServerManager once that exists; web: started via npm script).
  // No API key required — auth is the user's own filesystem.
  local: {
    url: `http://127.0.0.1:${getLocalModelPort()}/v1/chat/completions`,
    keyField: null, // sentinel: local provider needs no API key
    extraHeaders: {},
  },
};

/** Check if an API key is configured for the given provider. */
export function hasApiKey(provider: string): boolean {
  const p = PROVIDERS[provider];
  if (!p) return false;
  if (p.keyField === null) {
    // Local provider: rely on cached reachability; assume available on
    // first probe so the user can select the model and trigger a real
    // probe via the Local Models settings tab.
    return _localServerReachable !== false;
  }
  const keys = getApiKeys();
  const field = p.keyField as keyof ReturnType<typeof getApiKeys>;
  return Boolean(keys[field]);
}

/** Probe the local-models server (best-effort, 1s timeout) and
 *  update the cached state consulted by the sync `hasApiKey("local")`. */
export async function isLocalModelServerReachable(): Promise<boolean> {
  const reachable = await probeLocalServerOnce();
  _localServerReachable = reachable;
  _localServerLastCheck = Date.now();
  return reachable;
}

/** Fire-and-forget probe: keeps the cache warm so `hasApiKey("local")`
 *  returns the right answer without making the caller async. Throttled
 *  to once every 10s to avoid hammering the server. */
export function refreshLocalServerReachable(): void {
  const now = Date.now();
  if (now - _localServerLastCheck < 10_000) return;
  void isLocalModelServerReachable();
}

async function probeLocalServerOnce(): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1000);
    const r = await fetch(`http://127.0.0.1:${getLocalModelPort()}/healthz`, { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

/** Stream a chat completion directly from the provider. Yields text deltas. */
export async function* streamChat(opts: {
  provider: ProviderId | string;
  model: string;
  messages: ApiMessage[];
  temperature?: number;
  signal?: AbortSignal;
  thinking?: boolean;
}): AsyncGenerator<string> {
  const provider = PROVIDERS[opts.provider];
  if (!provider) throw new Error(`Unknown provider: ${opts.provider}`);

  // Local provider: no API key, route to on-device server
  if (opts.provider === "local") {
    return yield* streamLocal(opts);
  }

  const keys = getApiKeys();
  // Local provider is handled above and returns early; here keyField is
  // guaranteed to be a real key of ApiKeys.
  const field = provider.keyField as Exclude<typeof provider.keyField, null>;
  const apiKey = keys[field];
  if (!apiKey) {
    throw new Error(
      `No API key for ${opts.provider}. Go to Settings → Providers to add one, or use a free model.`,
    );
  }

  let res: Response;
  try {
    res = await fetch(provider.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(provider.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: true,
        temperature: opts.temperature ?? 0.7,
        ...(opts.thinking ? { reasoning_effort: "high" } : {}),
      }),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    throw new Error("Network error reaching the AI provider.");
  }

  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = typeof j.error === "string" ? j.error : j.error.message || msg;
    } catch {
      /* ignore */
    }
    // Report error to pool for smart key rotation + mark model unhealthy
    reportError(apiKey, res.status);
    recordModelFailure(opts.provider, opts.model, res.status, msg);
    throw new Error(msg);
  }

  // Request succeeded — report to pool + model-health
  reportSuccess(apiKey);
  recordModelSuccess(opts.provider, opts.model);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta: string | undefined =
            json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          /* partial json — ignore */
        }
      }
    }
  }
}
