/**
 * Live Model Pool
 * ---------------
 * Polls the four Dagestan `/v1/models` endpoints (plus optional public
 * upstream catalogs) on a schedule, diffs the responses, and exposes a
 * reactive list of free models. When a model disappears from upstream it
 * is flagged with `removedAt` so the UI can swap it out immediately.
 *
 * This hook is the source of truth for the SmartModelPicker.
 */
import { useEffect, useState, useCallback, useRef } from "react";

export interface PoolModel {
  id: string;
  label: string;
  provider: string;
  free: boolean;
  context: number;
  firstSeen: number;
  lastSeen: number;
  removedAt: number | null;
  source: string;
}

interface State {
  models: PoolModel[];
  loading: boolean;
  lastPoll: number;
  lastError: string | null;
  added: PoolModel[];
  removed: PoolModel[];
}

const ENDPOINTS: { url: string; source: string }[] = [
  { url: "http://127.0.0.1:8788/v1/models",  source: "hermes"    },
  { url: "http://127.0.0.1:10101/v1/models", source: "opencodex" },
  { url: "http://127.0.0.1:18790/v1/models", source: "openclaw"  },
  { url: "http://127.0.0.1:18925/v1/models", source: "codex-web" },
  { url: "http://127.0.0.1:18927/v1/models", source: "local"     },
];

const POLL_MS = 30_000;

function loadPersisted(): Record<string, PoolModel> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem("dagestan.modelpool.v1");
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, PoolModel>;
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function persist(map: Record<string, PoolModel>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem("dagestan.modelpool.v1", JSON.stringify(map));
  } catch { /* ignore */ }
}

function labelOf(id: string): string {
  if (id === "local") return "Dagestan local stub";
  if (id === "openrouter/free") return "OpenRouter auto-rotate";
  return id.replace(/^.*\//, "").replace(/:free$/, "").replace(/[-_]/g, " ");
}

function providerOf(id: string): string {
  if (id === "local") return "local";
  if (id === "openrouter/free") return "openrouter";
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : "openrouter";
}

async function fetchOne(url: string): Promise<{ id: string; context_length?: number; owned_by?: string }[]> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j?.data) ? j.data : [];
  } catch {
    return [];
  }
}

export function useLiveModelPool(opts: { pollMs?: number } = {}): State & { refresh: () => void } {
  const pollMs = opts.pollMs ?? POLL_MS;
  const [state, setState] = useState<State>(() => {
    const persisted = loadPersisted();
    return {
      models: Object.values(persisted).filter((m) => !m.removedAt),
      loading: false,
      lastPoll: 0,
      lastError: null,
      added: [],
      removed: [],
    };
  });
  const mapRef = useRef<Record<string, PoolModel>>(loadPersisted());
  const inflight = useRef<boolean>(false);

  const poll = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setState((s) => ({ ...s, loading: true }));
    const now = Date.now();
    try {
      const all = await Promise.all(
        ENDPOINTS.map(async (e) => ({ source: e.source, items: await fetchOne(e.url) })),
      );
      const seenIds = new Set<string>();
      const added: PoolModel[] = [];
      const removed: PoolModel[] = [];
      for (const group of all) {
        for (const it of group.items) {
          if (!it || typeof it.id !== "string") continue;
          const id = it.id;
          seenIds.add(id);
          const prev = mapRef.current[id];
          if (prev) {
            prev.lastSeen = now;
            prev.context = it.context_length || prev.context;
            prev.provider = providerOf(id);
            if (prev.removedAt) {
              prev.removedAt = null; // re-appeared
              added.push(prev);
            }
          } else {
            const m: PoolModel = {
              id,
              label: labelOf(id),
              provider: providerOf(id),
              free: id.endsWith(":free") || id === "openrouter/free" || id === "local",
              context: it.context_length || 32768,
              firstSeen: now,
              lastSeen: now,
              removedAt: null,
              source: group.source,
            };
            mapRef.current[id] = m;
            added.push(m);
          }
        }
      }
      // mark unseen as removed
      for (const id of Object.keys(mapRef.current)) {
        if (seenIds.has(id)) continue;
        const m = mapRef.current[id];
        if (!m.removedAt) {
          m.removedAt = now;
          removed.push(m);
        }
      }
      persist(mapRef.current);
      setState({
        models: Object.values(mapRef.current)
          .filter((m) => !m.removedAt)
          .sort((a, b) => (a.provider === b.provider ? a.id.localeCompare(b.id) : a.provider.localeCompare(b.provider))),
        loading: false,
        lastPoll: now,
        lastError: null,
        added,
        removed,
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        lastPoll: now,
        lastError: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = window.setInterval(poll, pollMs);
    return () => window.clearInterval(id);
  }, [poll, pollMs]);

  return { ...state, refresh: () => void poll() };
}
