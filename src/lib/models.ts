export type ProviderId = "openrouter" | "nvidia" | "zen" | "local";

export interface ModelInfo {
  provider: ProviderId;
  id: string;
  label: string;
  note?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  blurb: string;
  keyEnv: string;
  signupUrl: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "zen",
    label: "OpenCode Zen",
    blurb: "Curated models including several 100% free tiers",
    keyEnv: "OPENCODE_ZEN_API_KEY",
    signupUrl: "https://opencode.ai/zen",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    blurb: "Huge catalog of community favorites with free tiers",
    keyEnv: "OPENROUTER_API_KEY",
    signupUrl: "https://openrouter.ai/keys",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    blurb: "Fast NVIDIA-hosted open models, free developer credits",
    keyEnv: "NVIDIA_API_KEY",
    signupUrl: "https://build.nvidia.com",
  },
  {
    id: "local",
    label: "Local Models",
    blurb: "GGUF models downloaded from Hugging Face, run on-device via llama.cpp",
    keyEnv: "",
    signupUrl: "",
  },
];

/** Curated free / freemium models per provider. Any OpenAI-compatible model
 *  id can also be added manually via the picker's "Custom model id…" entry. */
export const MODELS: ModelInfo[] = [
  // OpenCode Zen (100% free tiers)
  { provider: "zen", id: "big-pickle", label: "Big Pickle", note: "100% free" },
  { provider: "zen", id: "x-preview-f-free", label: "Ox Alpha Free", note: "100% free · zero-retention" },
  { provider: "zen", id: "mimo-v2.5-free", label: "MiMo V2.5 Free", note: "100% free" },
  { provider: "zen", id: "nemotron-3-ultra-free", label: "Nemotron 3 Ultra Free", note: "100% free" },
  { provider: "zen", id: "nemotron-3.5-lightning-free", label: "Nemotron 3.5 Lightning Free", note: "100% free · fast" },

  // Local models — populated at runtime by querying
  // GET http://127.0.0.1:18927/v1/models (see hooks/use-local-models.ts).
  // The placeholder below is what the picker shows when no local model is
  // installed yet.
  { provider: "local", id: "local:none", label: "No local model loaded", note: "Settings → Local Models" },

  // OpenRouter free tiers — only the 3 currently working are
  // listed here. The other `:free` models that previously showed up
  // have been removed by upstream; the model-health refresh will mark
  // any other curated id as "removed" automatically. To browse the
  // full live catalog, the picker's search bar accepts any
  // OpenRouter model id.
  { provider: "openrouter", id: "deepseek/deepseek-v4-flash-free", label: "DeepSeek V4 Flash Free", note: "free · per request" },
  { provider: "openrouter", id: "qwen/qwen3.8-27b-free", label: "Qwen 3.8 27B Free", note: "free · 65k ctx" },
  { provider: "openrouter", id: "tencent/hy3-free", label: "Tencent HY3 Free", note: "free" },

  // NVIDIA NIM (free developer credits)
  { provider: "nvidia", id: "tencent/hunyuan-a13b-instruct", label: "Hunyuan A13B", note: "Tencent · NIM credits" },
  { provider: "nvidia", id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B", note: "NIM credits" },
  { provider: "nvidia", id: "nvidia/llama-3.3-nemotron-super-49b-v1", label: "Nemotron Super 49B", note: "NIM credits" },
  { provider: "nvidia", id: "deepseek-ai/deepseek-r1", label: "DeepSeek R1", note: "reasoning · NIM credits" },
  { provider: "nvidia", id: "qwen/qwen2.5-coder-32b-instruct", label: "Qwen2.5 Coder 32B", note: "NIM credits" },

  // ── Auto-rotated free pool (model-health.ts keeps this honest) ──
  // OpenRouter sentinel: the router picks a working free model
  // automatically. We list the 3 currently-confirmed free ids below
  // so the picker shows them by default; the auto-rotation
  // will surface new ones as they appear upstream and quietly retire
  // any that go away. The picker's search bar still accepts any
  // OpenRouter model id for power users.
  { provider: "openrouter", id: "openrouter/free", label: "OpenRouter Free (auto)", note: "rotating free pool" },
  { provider: "openrouter", id: "deepseek/deepseek-v4-flash-free", label: "DeepSeek V4 Flash Free", note: "free · per request" },
  { provider: "openrouter", id: "qwen/qwen3.8-27b-free", label: "Qwen 3.8 27B Free", note: "free · 65k ctx" },
  { provider: "openrouter", id: "tencent/hy3-free", label: "Tencent HY3 Free", note: "free" },
];

export function providerLabel(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

export function envKeyFor(provider: string): string {
  return PROVIDERS.find((p) => p.id === provider)?.keyEnv ?? "";
}

export const DEFAULT_PROVIDER: ProviderId = "openrouter";
/**
 * Default chat model — `openrouter/free` is OpenRouter's auto-rotating free
 * pool. It always points at a working free model, so the user gets a
 * real reply on first chat without picking anything.
 */
export const DEFAULT_MODEL = "openrouter/free";
