// ---------------------------------------------------------------------------
// model-router.ts — Smart model routing with automatic fallback.
// If a provider fails, automatically try the next available provider.
// ---------------------------------------------------------------------------

import type { ProviderId } from "./models";
import { MODELS, type ModelInfo } from "./models";
import { streamChat, type ApiMessage, hasApiKey } from "./ai-client";
import { isModelUnhealthy } from "./model-health";
export type { ApiMessage } from "./ai-client";

/** Fallback order: when one provider fails, try the next. */
const FALLBACK_ORDER: ProviderId[] = ["zen", "openrouter", "nvidia"];

/** Check which providers have API keys configured. */
export function getAvailableProviders(): ProviderId[] {
  return FALLBACK_ORDER.filter((p) => hasApiKey(p));
}

/** Find a free model from any available provider. */
export function findFreeModel(): ModelInfo | null {
  for (const providerId of FALLBACK_ORDER) {
    if (!hasApiKey(providerId)) continue;
    const freeModel = MODELS.find(
      (m) => m.provider === providerId && m.note?.toLowerCase().includes("free")
    );
    if (freeModel) return freeModel;
  }
  return null;
}

/** Get models for a specific provider. */
export function getModelsForProvider(providerId: ProviderId): ModelInfo[] {
  return MODELS.filter((m) => m.provider === providerId);
}

/**
 * Stream chat with automatic fallback.
 * If the primary provider fails, tries the next available provider.
 */
export async function* streamChatWithFallback(opts: {
  provider: ProviderId | string;
  model: string;
  messages: ApiMessage[];
  temperature?: number;
  signal?: AbortSignal;
  thinking?: boolean;
}): AsyncGenerator<string> {
  const providers = [opts.provider as ProviderId, ...FALLBACK_ORDER.filter((p) => p !== opts.provider)];

  for (const provider of providers) {
    if (!hasApiKey(provider)) continue;

    // Find the model for this provider (use original model if same provider, otherwise find equivalent)
    let model = opts.model;
    if (provider !== opts.provider) {
      // Try to find a similar model from the fallback provider
      const fallbackModel = MODELS.find(
        (m) => m.provider === provider && m.note?.toLowerCase().includes("free")
      );
      if (fallbackModel) {
        model = fallbackModel.id;
      } else {
        continue; // No suitable model found for this provider
      }
    }

    // Skip if the (provider, model) pair is known-removed or rate-limited.
    if (isModelUnhealthy(provider, model)) {
      console.warn(`[ModelRouter] skipping unhealthy ${provider}/${model}`);
      continue;
    }

    try {

      let failed = false;
      const abortHandler = () => { failed = true; };
      opts.signal?.addEventListener("abort", abortHandler);

      try {
        yield* streamChat({
          provider,
          model,
          messages: opts.messages,
          temperature: opts.temperature,
          signal: opts.signal,
          thinking: opts.thinking,
        });

        // If we get here without error, the request succeeded
        if (!failed) return;
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        // Network or API error — try next provider
        console.warn(`[ModelRouter] ${provider} failed, trying next...`, (err as Error).message);
        continue;
      } finally {
        opts.signal?.removeEventListener("abort", abortHandler);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      continue;
    }
  }

  throw new Error("All providers failed. Check your API keys in Settings → Providers.");
}

/** Get provider status for display. */
export function getProviderStatus(): Array<{
  provider: ProviderId;
  label: string;
  available: boolean;
  modelCount: number;
}> {
  return FALLBACK_ORDER.map((id) => ({
    provider: id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    available: hasApiKey(id),
    modelCount: MODELS.filter((m) => m.provider === id).length,
  }));
}
