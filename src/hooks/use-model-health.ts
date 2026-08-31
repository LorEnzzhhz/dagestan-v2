// ---------------------------------------------------------------------------
// use-model-health.ts — Background periodic refresh of upstream /v1/models
// catalogs. Reconciles the curated MODELS list against reality and marks
// missing models as "removed" via model-health.ts.
//
// Runs every `intervalMs` while the component using this hook is mounted.
// Safe to call from multiple places — the underlying refresh is throttled.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { toast } from "sonner";
import { MODELS } from "@/lib/models";
import { getApiKeys } from "@/lib/store";
import { refreshProviderModelHealth, detectRemovals } from "@/lib/model-health";

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MIN_REFRESH_GAP = 60 * 1000; // never probe more than once per minute
let lastRefreshAt = 0;
let inFlight = false;

async function runRefresh(): Promise<void> {
  const now = Date.now();
  if (inFlight || now - lastRefreshAt < MIN_REFRESH_GAP) return;
  inFlight = true;
  lastRefreshAt = now;
  try {
    const keys = getApiKeys();
    const providers = ["openrouter", "nvidia", "zen"] as const;
    for (const provider of providers) {
      const curated = MODELS.filter((m) => m.provider === provider).map((m) => m.id);
      if (curated.length === 0) continue;
      const apiKey = (keys as Record<string, string | undefined>)[provider];
      try {
        const result = await refreshProviderModelHealth(provider, curated, { apiKey });
        if (result.removed.length > 0) {
          console.info(
            `[model-health] ${provider}: removed ${result.removed.length} stale free models`,
            result.removed,
          );
          const fresh = detectRemovals(provider, result.removed);
          for (const r of fresh) {
            toast(`${r.model} was removed from ${provider}`, {
              description: "This free model is no longer available upstream. Pick another from the model picker.",
              duration: 8000,
            });
          }
        }
      } catch {
        /* ignore individual provider errors */
      }
    }
  } finally {
    inFlight = false;
  }
}

/** Mount this once at the top of the app to run a periodic refresh. */
export function useModelHealthRefresh(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  useEffect(() => {
    void runRefresh();
    const id = window.setInterval(() => void runRefresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

/** Force an immediate refresh — used by the manual "Refresh" button. */
export const forceModelHealthRefresh = runRefresh;
