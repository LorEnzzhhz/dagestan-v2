// ---------------------------------------------------------------------------
// model-health.ts — Track per-(provider,model) health, with periodic refresh.
//
// When a free model 404s, is rate-limited, or stops appearing in the
// provider's /v1/models listing, we mark it as `unhealthy` so the router
// can skip it without round-tripping the provider on every request. The
// list is re-validated against upstream periodically and on demand.
//
// State is persisted to localStorage so users keep their "removed"
// preferences across reloads; clearable via `clearModelHealth()`.
// ---------------------------------------------------------------------------

import type { ProviderId } from "./models";

export type HealthStatus = "healthy" | "rate-limited" | "removed" | "unknown";

export interface ModelHealth {
  provider: ProviderId | string;
  model: string;
  status: HealthStatus;
  /** When this status was last observed. */
  lastSeen: number;
  /** Number of consecutive failures. */
  failures: number;
  /** Last error message (truncated). */
  lastError?: string;
  /** When the entry expires and should be re-probed. */
  expiresAt: number;
}

const KEY = "dagestan.modelHealth";
const RATE_LIMIT_TTL = 5 * 60 * 1000; // 5 min
const REMOVED_TTL = 24 * 60 * 60 * 1000; // 24 h
const FAIL_TTL = 60 * 1000; // 1 min

function load(): Record<string, ModelHealth> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function save(map: Record<string, ModelHealth>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function keyOf(provider: string, model: string): string {
  return `${provider}::${model}`;
}

/** Record a successful request — clears failure counters. */
export function recordModelSuccess(provider: string, model: string): void {
  const map = load();
  const k = keyOf(provider, model);
  const existing = map[k];
  if (existing) {
    existing.status = "healthy";
    existing.failures = 0;
    existing.lastSeen = Date.now();
    existing.expiresAt = 0; // healthy entries don't expire
    delete existing.lastError;
    save(map);
  }
}

/** Record a failure for a (provider, model) pair. Returns the new status.
 *
 *  Heuristic:
 *  - HTTP 404 / 410 / "model not found" → mark `removed`
 *  - HTTP 429 → mark `rate-limited` with a short cooldown
 *  - Everything else → bump `failures`, mark `rate-limited` if >= 3 */
export function recordModelFailure(
  provider: string,
  model: string,
  statusCode?: number,
  errorMsg?: string,
): HealthStatus {
  const map = load();
  const k = keyOf(provider, model);
  const existing: ModelHealth = map[k] ?? {
    provider,
    model,
    status: "unknown",
    lastSeen: Date.now(),
    failures: 0,
    expiresAt: 0,
  };
  const msg = (errorMsg ?? "").toLowerCase();
  const looksRemoved =
    statusCode === 404 ||
    statusCode === 410 ||
    msg.includes("not found") ||
    msg.includes("no longer") ||
    msg.includes("does not exist") ||
    msg.includes("model_not_found");

  existing.failures += 1;
  existing.lastSeen = Date.now();
  existing.lastError = (errorMsg ?? "").slice(0, 200);

  if (looksRemoved) {
    existing.status = "removed";
    existing.expiresAt = Date.now() + REMOVED_TTL;
  } else if (statusCode === 429 || msg.includes("rate")) {
    existing.status = "rate-limited";
    existing.expiresAt = Date.now() + RATE_LIMIT_TTL;
  } else if (existing.failures >= 3) {
    existing.status = "rate-limited";
    existing.expiresAt = Date.now() + RATE_LIMIT_TTL;
  } else {
    existing.status = "rate-limited";
    existing.expiresAt = Date.now() + FAIL_TTL;
  }
  map[k] = existing;
  save(map);
  return existing.status;
}

/** Get the current health entry for a (provider, model) pair. Returns
 *  `null` if there is no record (treat as healthy / unknown). */
export function getModelHealth(provider: string, model: string): ModelHealth | null {
  const map = load();
  const k = keyOf(provider, model);
  const e = map[k];
  if (!e) return null;
  // Expired entries are treated as unknown — they'll be re-probed.
  if (e.expiresAt > 0 && Date.now() > e.expiresAt) return null;
  return e;
}

/** True if the model is currently unusable (removed or rate-limited). */
export function isModelUnhealthy(provider: string, model: string): boolean {
  const h = getModelHealth(provider, model);
  return h?.status === "removed" || h?.status === "rate-limited";
}

/** Drop all entries — used by the manual "Reset model health" button. */
export function clearModelHealth(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Snapshot of all known health entries — used by Settings. */
export function listModelHealth(): ModelHealth[] {
  return Object.values(load()).filter(
    (e) => e.expiresAt === 0 || Date.now() <= e.expiresAt,
  );
}

/** ── Upstream `/v1/models` refresh ────────────────────────────────────
 *
 *  For providers that expose an OpenAI-compatible /v1/models endpoint
 *  (OpenRouter, NVIDIA, local-models-server), fetch the current catalog
 *  and reconcile against `curated`:
 *   - Curated models NOT in the upstream response → mark `removed`.
 *   - Upstream models NOT in `curated` → left alone (we don't auto-add).
 *
 *  Returns `{ provider, removed, ok, error }`. */
export async function refreshProviderModelHealth(
  provider: ProviderId | string,
  curated: string[],
  opts: {
    url?: string;
    apiKey?: string;
    signal?: AbortSignal;
  } = {},
): Promise<{
  provider: string;
  removed: string[];
  ok: boolean;
  error?: string;
}> {
  const url = opts.url ?? defaultModelListUrl(provider);
  if (!url) {
    return { provider, removed: [], ok: false, error: "no list endpoint" };
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: opts.signal });
  } catch (err) {
    return { provider, removed: [], ok: false, error: (err as Error).message };
  }
  if (!res.ok) {
    return { provider, removed: [], ok: false, error: `HTTP ${res.status}` };
  }
  let ids: string[] = [];
  try {
    const j = await res.json();
    if (Array.isArray(j?.data)) {
      ids = (j.data as Array<{ id?: unknown }>).map((m) => String(m?.id ?? "")).filter(Boolean);
    } else if (Array.isArray(j)) {
      ids = (j as Array<{ id?: unknown } | unknown>).map((m) =>
        String((typeof m === "object" && m && "id" in (m as object) ? (m as { id?: unknown }).id : m) ?? ""),
      ).filter(Boolean);
    }
  } catch {
    return { provider, removed: [], ok: false, error: "parse failed" };
  }
  if (ids.length === 0) {
    return { provider, removed: [], ok: true }; // nothing to compare
  }
  const upstreamSet = new Set(ids);
  const removed: string[] = [];
  for (const m of curated) {
    if (!upstreamSet.has(m)) {
      recordModelFailure(provider, m, 404, "not in upstream /v1/models");
      removed.push(m);
    } else {
      recordModelSuccess(provider, m);
    }
  }
  return { provider, removed, ok: true };
}

function defaultModelListUrl(provider: string): string | null {
  switch (provider) {
    case "openrouter":
      return "https://openrouter.ai/api/v1/models";
    case "nvidia":
      return "https://integrate.api.nvidia.com/v1/models";
    case "zen":
      return "https://opencode.ai/zen/v1/models";
    case "local":
      return `http://127.0.0.1:18927/v1/models`;
    default:
      return null;
  }
}


/* ── Change detection ─────────────────────────────────────────────────
 * The browser only needs to be told once when a model disappears from
 * upstream. We keep a small `previouslyKnown` set in localStorage so
 * the next `refreshProviderModelHealth` can fire a toast on the
 * transition `was-healthy → now-removed` and stay silent otherwise. */
const KNOWN_KEY = "dagestan.modelHealth.known";

function loadKnown(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch { return {}; /* noop */ }
}
function saveKnown(m: Record<string, string[]>) {
  try { localStorage.setItem(KNOWN_KEY, JSON.stringify(m)); } catch { /* noop */ }
}

/** Detect transitions and return newly-removed (provider, model) pairs.
 *  Updates the persisted "known" set so the next call won't re-fire. */
export function detectRemovals(
  provider: string,
  removed: string[],
): Array<{ provider: string; model: string }> {
  const known = loadKnown();
  const prev = new Set(known[provider] ?? []);
  const next = new Set(removed);
  const fresh: Array<{ provider: string; model: string }> = [];
  for (const m of removed) if (!prev.has(m)) fresh.push({ provider, model: m });
  // Anything in `prev` that is NOT in `removed` anymore means the model
  // came back — drop it from the known set so we re-fire if it disappears again.
  for (const m of prev) if (!next.has(m)) prev.delete(m);
  known[provider] = Array.from(new Set([...prev, ...next]));
  saveKnown(known);
  return fresh;
}
