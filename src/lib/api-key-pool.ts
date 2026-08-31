/**
 * Smart API Key Pool v2 — shared key rotation for multi-user environments.
 *
 * Each device gets a unique fingerprint that biases key selection,
 * so 10 friends on 10 phones naturally spread across different keys.
 * Keys rotate with adaptive cooldowns; rate-limited keys auto-backoff.
 *
 * 15 keys per provider = supports 15+ concurrent users per provider.
 */

export type PoolProvider = "zen" | "openrouter" | "nvidia" | "exa";

interface PoolKey {
  provider: PoolProvider;
  key: string;
  label: string;
  cooldownMs?: number;
}

interface KeyStats {
  lastUsed: number;
  totalRequests: number;
  errors: number;
  rateLimited: number;
  lastError: number;
  lastRateLimit: number;
}

const BASE_COOLDOWN_MS = 20 * 60 * 1000; // 20 min (was 30)
const MAX_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000;

const USAGE_KEY = "dagestan.keyPool.stats";
const DEVICE_ID_KEY = "dagestan.deviceId";

// ── Device fingerprint — each phone gets a stable random offset ──────────────
// This biases key selection so different devices prefer different keys,
// spreading load across the pool without any server coordination.

function getDeviceId(): number {
  try {
    const id = localStorage.getItem(DEVICE_ID_KEY);
    if (id) return parseInt(id, 10);
    const newId = Math.floor(Math.random() * 100000);
    localStorage.setItem(DEVICE_ID_KEY, String(newId));
    return newId;
  } catch {
    return Math.floor(Math.random() * 100000);
  }
}

// ── KEY POOL — loaded from secrets.local.json (gitignored) ───────────
// Keys are kept out of the repo. To add your own keys, copy
// secrets.local.json.example → secrets.local.json and edit. The build
// expects this file at <repo-root>/secrets.local.json.

let _secretsCache: PoolKey[] | null = null;

async function loadSecrets(): Promise<PoolKey[]> {
  if (_secretsCache) return _secretsCache;
  try {
    // Vite serves files at the repo root via /<name>.json in dev.
    // In production builds, secrets.local.json is bundled if present
    // (see vite.config.ts → assetsInclude) and the import resolves.
    // We build the specifier from a variable so Rollup treats it as a
    // truly dynamic import and doesn't try to resolve it at build
    // time when the file isn't present (the typical CI case).
    const specifier = /* @vite-ignore */ "../../" + "secrets.local.json";
    const mod = await import(/* @vite-ignore */ specifier).catch(() => ({ default: {}, providers: {} }));
    const providers = (mod.default?.providers ?? mod.providers ?? {}) as Record<string, Array<{ key: string; label?: string }>>;
    const out: PoolKey[] = [];
    for (const [provider, keys] of Object.entries(providers)) {
      for (const k of keys) {
        out.push({
          provider: provider as PoolProvider,
          key: k.key,
          label: k.label ?? `${provider} key`,
        });
      }
    }
    _secretsCache = out;
    return out;
  } catch (e) {
    // The dynamic-import above already catches its own errors. This
    // block is here for the rare case where Object.entries / for-of
    // throws on a malformed file.
    console.warn("[api-key-pool] failed to load secrets.local.json:", e);
    return [];
  }
}

// Synchronous getter used by hasPoolKeys/getPoolStatus. Keys come from
// either the <script id="dagestan-keys"> tag injected by Vite (dev + prod)
// or the build-time define() in vite.config.ts (bundle-only fallback).
const POOL: PoolKey[] = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromDefine = (globalThis as any).__DAGESTAN_BUILD_KEYS__ as
      | Array<{ provider: string; key: string; label?: string }>
      | undefined;
    if (Array.isArray(fromDefine)) {
      return fromDefine.map((e) => ({
        provider: e.provider as PoolProvider,
        key: e.key,
        label: e.label ?? `${e.provider} key`,
      }));
    }
    return [];
  } catch {
    return [];
  }
})();

export async function reloadKeys(): Promise<number> {
  _secretsCache = null;
  const fresh = await loadSecrets();
  POOL.length = 0;
  POOL.push(...fresh);
  return fresh.length;
}

// ── Stats ────────────────────────────────────────────────────────────────────

function getAllStats(): Record<string, KeyStats> {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAllStats(stats: Record<string, KeyStats>): void {
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(stats)); }
  catch { /* private mode */ }
}

function getStats(key: string): KeyStats {
  const all = getAllStats();
  return all[key] || { lastUsed: 0, totalRequests: 0, errors: 0, rateLimited: 0, lastError: 0, lastRateLimit: 0 };
}

function updateStats(key: string, patch: Partial<KeyStats>): void {
  const all = getAllStats();
  const prev = all[key] || { lastUsed: 0, totalRequests: 0, errors: 0, rateLimited: 0, lastError: 0, lastRateLimit: 0 };
  all[key] = { ...prev, ...patch };
  saveAllStats(all);
}

// ── Adaptive cooldown ────────────────────────────────────────────────────────

function getEffectiveCooldown(key: string, baseCooldown: number): number {
  const s = getStats(key);
  const now = Date.now();
  if (s.lastRateLimit && now - s.lastRateLimit < 4 * 60 * 60 * 1000) {
    return Math.min(MAX_COOLDOWN_MS * 2, 8 * 60 * 60 * 1000);
  }
  if (s.lastError && now - s.lastError < 60 * 60 * 1000) {
    return baseCooldown * (1 + Math.min(s.errors, 10) * 0.5);
  }
  if (s.totalRequests > 5 && s.errors / s.totalRequests > 0.3) {
    return Math.min(MAX_COOLDOWN_MS, baseCooldown * 2);
  }
  return baseCooldown;
}

function isAvailable(key: string, baseCooldown: number): boolean {
  const s = getStats(key);
  if (!s.lastUsed) return true;
  return Date.now() - s.lastUsed > getEffectiveCooldown(key, baseCooldown);
}

// ── Device-aware scoring ─────────────────────────────────────────────────────

/**
 * Score a key. Device fingerprint biases selection so different phones
 * prefer different keys, spreading load without server coordination.
 */
function scoreKey(key: string, baseCooldown: number, keyIndex: number, deviceId: number): number {
  const s = getStats(key);
  let score = 100;

  // DEVICE BIAS: each device prefers keys at a different offset
  // Device 0 prefers key 0, device 1 prefers key 1, etc.
  // This spreads 10 users across 15 keys with minimal overlap.
  const biasOffset = ((keyIndex - deviceId) % 15 + 15) % 15;
  score += Math.max(0, 15 - biasOffset) * 2; // up to +30 for preferred key

  // Penalty for cooldown
  if (!isAvailable(key, baseCooldown)) {
    const remaining = getEffectiveCooldown(key, baseCooldown) - (Date.now() - s.lastUsed);
    score -= Math.min(80, (remaining / (baseCooldown * 2)) * 80);
  }

  // Penalty for errors
  if (s.totalRequests > 0) {
    score -= (s.errors / s.totalRequests) * 40;
  }

  // Penalty for recent rate limiting
  if (s.lastRateLimit && Date.now() - s.lastRateLimit < 60 * 60 * 1000) {
    score -= 50;
  }

  // Bonus for low usage (spread traffic)
  score -= Math.min(20, s.totalRequests * 0.3);

  // Bonus for never used
  if (s.totalRequests === 0) score += 10;

  // Small random jitter to break ties between devices
  score += (Math.random() - 0.5) * 4;

  return Math.max(0, score);
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

function cleanupOldStats(): void {
  const all = getAllStats();
  const cutoff = Date.now() - CLEANUP_AGE_MS;
  let changed = false;
  for (const [key, stats] of Object.entries(all)) {
    if (stats.lastUsed < cutoff && stats.lastUsed > 0) {
      all[key] = { lastUsed: 0, totalRequests: 0, errors: 0, rateLimited: 0, lastError: 0, lastRateLimit: 0 };
      changed = true;
    }
  }
  if (changed) saveAllStats(all);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the best key for a provider.
 * Device-aware: different phones naturally prefer different keys.
 */
export function getPoolKey(provider: PoolProvider): string | null {
  cleanupOldStats();
  const deviceId = getDeviceId();
  const candidates = POOL.filter((k) => k.provider === provider);
  if (candidates.length === 0) return null;

  // Score all and pick best (device bias + health + freshness)
  const scored = candidates.map((c, i) => ({
    key: c.key,
    score: scoreKey(c.key, c.cooldownMs || BASE_COOLDOWN_MS, i, deviceId),
  })).sort((a, b) => b.score - a.score);

  const chosen = scored[0];
  if (!chosen) return null;

  const stats = getStats(chosen.key);
  updateStats(chosen.key, {
    lastUsed: Date.now(),
    totalRequests: stats.totalRequests + 1,
  });

  return chosen.key;
}

export function reportSuccess(key: string): void {
  const s = getStats(key);
  if (s.errors > 0) {
    updateStats(key, { errors: Math.max(0, s.errors - 1) });
  }
}

export function reportError(key: string, statusCode?: number): void {
  const s = getStats(key);
  if (statusCode === 429) {
    updateStats(key, {
      lastRateLimit: Date.now(),
      rateLimited: s.rateLimited + 1,
      lastError: Date.now(),
      errors: s.errors + 1,
    });
  } else {
    updateStats(key, { lastError: Date.now(), errors: s.errors + 1 });
  }
}

export function getPoolStatus(): Array<{
  provider: PoolProvider;
  total: number;
  available: number;
  healthy: number;
  nextAvailableIn: number | null;
  avgScore: number;
}> {
  cleanupOldStats();
  const deviceId = getDeviceId();
  const providers: PoolProvider[] = ["zen", "openrouter", "nvidia", "exa"];

  return providers.map((provider) => {
    const keys = POOL.filter((k) => k.provider === provider);
    const available = keys.filter((k) => isAvailable(k.key, k.cooldownMs || BASE_COOLDOWN_MS));
    const healthy = keys.filter((k) => { const s = getStats(k.key); return s.errors < 3 && s.rateLimited === 0; });
    const scores = keys.map((k, i) => scoreKey(k.key, k.cooldownMs || BASE_COOLDOWN_MS, i, deviceId));
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    let nextAvailableIn: number | null = null;
    if (available.length === 0 && keys.length > 0) {
      const usage = getAllStats();
      let earliest = Infinity;
      for (const k of keys) {
        const s = usage[k.key];
        if (s?.lastUsed) {
          const expiresAt = s.lastUsed + getEffectiveCooldown(k.key, k.cooldownMs || BASE_COOLDOWN_MS);
          if (expiresAt < earliest) earliest = expiresAt;
        }
      }
      if (earliest < Infinity) nextAvailableIn = Math.max(0, earliest - Date.now());
    }

    return { provider, total: keys.length, available: available.length, healthy: healthy.length, nextAvailableIn, avgScore: Math.round(avgScore) };
  });
}

export function hasPoolKeys(provider: string): boolean {
  return POOL.some((k) => k.provider === provider);
}

export function resetPoolStats(): void {
  try { localStorage.removeItem(USAGE_KEY); } catch { /* ignore */ }
}
