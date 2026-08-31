/**
 * Smart Model Registry — auto-categorizes models by profession/use case
 * and detects provider changes (new free models, removed models).
 */

export type ModelCategory =
  | "coding"
  | "writing"
  | "analysis"
  | "math"
  | "creative"
  | "translation"
  | "reasoning"
  | "general"
  | "fast"
  | "multimodal";

export type ProviderId = "zen" | "openrouter" | "nvidia" | "local";

export interface SmartModel {
  id: string;
  label: string;
  provider: ProviderId;
  categories: ModelCategory[];
  speed: "fast" | "medium" | "slow";
  contextWindow: number; // in tokens
  isFree: boolean;
  lastSeen: number; // timestamp
  addedAt?: number; // when we first detected it
  removedAt?: number; // when it disappeared (null = still active)
  notes?: string;
}

export interface ProviderStatus {
  provider: ProviderId;
  label: string;
  totalModels: number;
  freeModels: number;
  lastChecked: number;
  status: "healthy" | "degraded" | "error";
  changes: ModelChange[];
}

export interface ModelChange {
  type: "added" | "removed" | "updated";
  modelId: string;
  modelLabel: string;
  timestamp: number;
  details?: string;
}

// ── Model Database ──────────────────────────────────────────────────────────

const MODEL_DATABASE: SmartModel[] = [
  // OpenCode Zen — 100% free tier
  {
    id: "big-pickle",
    label: "Big Pickle",
    provider: "zen",
    categories: ["general", "coding", "writing"],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Zen's flagship free model — great all-rounder",
  },
  {
    id: "x-preview-f-free",
    label: "Ox Alpha Free",
    provider: "zen",
    categories: ["reasoning", "math", "analysis"],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Zero-retention, strong reasoning",
  },
  {
    id: "mimo-v2.5-free",
    label: "MiMo V2.5 Free",
    provider: "zen",
    categories: ["coding", "analysis", "reasoning"],
    speed: "fast",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Fast, code-focused",
  },
  {
    id: "nemotron-3-ultra-free",
    label: "Nemotron 3 Ultra Free",
    provider: "zen",
    categories: ["general", "writing", "creative"],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Versatile, good for long-form",
  },
  {
    id: "nemotron-3.5-lightning-free",
    label: "Nemotron 3.5 Lightning Free",
    provider: "zen",
    categories: ["fast", "general", "coding"],
    speed: "fast",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Fastest free model on Zen",
  },

  // OpenRouter — free tiers
  {
    id: "meituan/longcat-flash-chat:free",
    label: "LongCat 2.0 Flash",
    provider: "openrouter",
    categories: ["fast", "general", "coding"],
    speed: "fast",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Meituan's fast free model",
  },
  {
    id: "deepseek/deepseek-chat-v3-0324:free",
    label: "DeepSeek V3",
    provider: "openrouter",
    categories: ["coding", "reasoning", "analysis", "math"],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Excellent for code and math",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B",
    provider: "openrouter",
    categories: ["general", "writing", "reasoning"],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Meta's open-source flagship",
  },
  {
    id: "google/gemma-3-27b-it:free",
    label: "Gemma 3 27B",
    provider: "openrouter",
    categories: ["general", "writing", "translation"],
    speed: "fast",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Google's lightweight, multilingual",
  },
  {
    id: "qwen/qwen3-coder:free",
    label: "Qwen3 Coder",
    provider: "openrouter",
    categories: ["coding", "analysis", "reasoning"],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Code-specialized from Alibaba",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    label: "Hermes 3 405B",
    provider: "openrouter",
    categories: ["general", "creative", "reasoning", "writing"],
    speed: "slow",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Massive 405B model, best quality",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-70b:free",
    label: "Hermes 3 70B",
    provider: "openrouter",
    categories: ["general", "creative", "writing"],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Good balance of speed and quality",
  },

  // NVIDIA NIM — free developer credits
  {
    id: "tencent/hunyuan-a13b-instruct",
    label: "Hunyuan A13B",
    provider: "nvidia",
    categories: ["general", "writing", "translation"],
    speed: "fast",
    contextWindow: 32000,
    isFree: false,
    lastSeen: Date.now(),
    notes: "Tencent's model via NIM credits",
  },
  {
    id: "meta/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    provider: "nvidia",
    categories: ["general", "writing", "reasoning"],
    speed: "medium",
    contextWindow: 128000,
    isFree: false,
    lastSeen: Date.now(),
    notes: "NVIDIA-hosted Llama",
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1",
    label: "Nemotron Super 49B",
    provider: "nvidia",
    categories: ["coding", "reasoning", "analysis"],
    speed: "fast",
    contextWindow: 128000,
    isFree: false,
    lastSeen: Date.now(),
    notes: "NVIDIA's optimized model",
  },
  {
    id: "deepseek-ai/deepseek-r1",
    label: "DeepSeek R1",
    provider: "nvidia",
    categories: ["reasoning", "math", "analysis"],
    speed: "slow",
    contextWindow: 128000,
    isFree: false,
    lastSeen: Date.now(),
    notes: "Reasoning-focused, chain-of-thought",
  },
  {
    id: "qwen/qwen2.5-coder-32b-instruct",
    label: "Qwen2.5 Coder 32B",
    provider: "nvidia",
    categories: ["coding", "analysis"],
    speed: "medium",
    contextWindow: 32000,
    isFree: false,
    lastSeen: Date.now(),
    notes: "Code-specialized via NIM",
  },

  // ── Newly curated free models ──────────────────────────────
  {
    id: "openrouter/free",
    label: "OpenRouter Free (auto)",
    provider: "openrouter",
    categories: ['general', 'fast'],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Router picks a free model automatically",
  },
  {
    id: "inclusionai/ling-3.0-flash-fin:free",
    label: "Ling 3.0 Flash Fin",
    provider: "openrouter",
    categories: ['fast', 'general'],
    speed: "fast",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "InclusionAI fast chat",
  },
  {
    id: "dots-studio/dots-3-note-preview:free",
    label: "Dots 3 Note Preview",
    provider: "openrouter",
    categories: ['writing', 'analysis'],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Dots Studio note-taking model",
  },
  {
    id: "liquid/lfm-2.5-2.6b:free",
    label: "Liquid LFM 2.5 2.6B",
    provider: "openrouter",
    categories: ['fast', 'general'],
    speed: "fast",
    contextWindow: 32000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Liquid AI compact model",
  },
  {
    id: "thinkingmachines/inkling-small:free",
    label: "Inkling Small",
    provider: "openrouter",
    categories: ['reasoning', 'general'],
    speed: "fast",
    contextWindow: 64000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Thinking Machines small",
  },
  {
    id: "thinkingmachines/inkling:free",
    label: "Inkling",
    provider: "openrouter",
    categories: ['reasoning', 'analysis'],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Thinking Machines flagship",
  },
  {
    id: "poolside/laguna-s-2.1:free",
    label: "Poolside Laguna S 2.1",
    provider: "openrouter",
    categories: ['coding', 'general'],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Poolside coding model",
  },
  {
    id: "poolside/laguna-xs-2.1:free",
    label: "Poolside Laguna XS 2.1",
    provider: "openrouter",
    categories: ['fast', 'coding'],
    speed: "fast",
    contextWindow: 64000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Poolside fast coding",
  },
  {
    id: "cohere/north-mini-code:free",
    label: "Cohere North Mini Code",
    provider: "openrouter",
    categories: ['coding'],
    speed: "fast",
    contextWindow: 32000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Cohere code-specialized",
  },
  {
    id: "z-ai/glm-5.2:free",
    label: "GLM 5.2",
    provider: "openrouter",
    categories: ['general', 'writing', 'reasoning'],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Z.AI multilingual",
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    label: "Nemotron 3.5 Lightning",
    provider: "nvidia",
    categories: ['fast', 'general'],
    speed: "fast",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "NVIDIA fast free tier",
  },
  {
    id: "nvidia/nemotron-3.5-content-safety:free",
    label: "Nemotron 3.5 Content Safety",
    provider: "nvidia",
    categories: ['analysis'],
    speed: "fast",
    contextWindow: 32000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "NVIDIA safety classifier",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    label: "Nemotron 3 Ultra 550B A55B",
    provider: "nvidia",
    categories: ['reasoning', 'analysis', 'general'],
    speed: "slow",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "NVIDIA ultra MoE",
  },
  {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    label: "Nemotron 3 Nano Omni 30B A3B Reasoning",
    provider: "nvidia",
    categories: ['reasoning', 'multimodal'],
    speed: "medium",
    contextWindow: 64000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "NVIDIA omni reasoning",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super 120B A12B",
    provider: "nvidia",
    categories: ['reasoning', 'general'],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "NVIDIA super MoE",
  },
  {
    id: "minimax/minimax-m3:free",
    label: "Minimax M3",
    provider: "openrouter",
    categories: ['general', 'writing'],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Minimax M3",
  },
  {
    id: "minimax/minimax-m2.7:free",
    label: "Minimax M2.7",
    provider: "openrouter",
    categories: ['general', 'writing', 'fast'],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Minimax M2.7",
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    label: "Gemma 4 26B A4B IT",
    provider: "openrouter",
    categories: ['general', 'writing', 'translation'],
    speed: "fast",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Google Gemma 4 IT",
  },
  {
    id: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B IT",
    provider: "openrouter",
    categories: ['general', 'writing', 'reasoning'],
    speed: "medium",
    contextWindow: 128000,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Google Gemma 4 31B IT",
  },

  // ── Free routes discovered via the upstream OpenRouter catalog ─────
  {
    id: "deepseek/deepseek-v4-flash-free",
    label: "DeepSeek V4 Flash Free",
    provider: "openrouter",
    categories: ["fast", "general", "coding"],
    speed: "fast",
    contextWindow: 1048576,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Free tier · per-request pricing",
  },
  {
    id: "qwen/qwen3.8-27b-free",
    label: "Qwen 3.8 27B Free",
    provider: "openrouter",
    categories: ["general", "reasoning", "writing"],
    speed: "medium",
    contextWindow: 65536,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Free tier · 65k ctx",
  },
  {
    id: "tencent/hy3-free",
    label: "Tencent HY3 Free",
    provider: "openrouter",
    categories: ["general", "writing"],
    speed: "medium",
    contextWindow: 262144,
    isFree: true,
    lastSeen: Date.now(),
    notes: "Free tier",
  },
];

// ── Category Labels ─────────────────────────────────────────────────────────

export const CATEGORY_INFO: Record<ModelCategory, { label: string; icon: string; description: string }> = {
  coding: { label: "Coding", icon: "💻", description: "Code generation, debugging, review" },
  writing: { label: "Writing", icon: "✍️", description: "Essays, docs, creative writing" },
  analysis: { label: "Analysis", icon: "📊", description: "Data analysis, insights, reports" },
  math: { label: "Math", icon: "🔢", description: "Equations, proofs, calculations" },
  creative: { label: "Creative", icon: "🎨", description: "Stories, poetry, brainstorming" },
  translation: { label: "Translation", icon: "🌍", description: "Multi-language translation" },
  reasoning: { label: "Reasoning", icon: "🧠", description: "Logic, chain-of-thought, puzzles" },
  general: { label: "General", icon: "💬", description: "Everyday questions and tasks" },
  fast: { label: "Fast", icon: "⚡", description: "Low latency, quick responses" },
  multimodal: { label: "Multimodal", icon: "👁", description: "Images, audio, video understanding" },
};

// ── Provider Info ───────────────────────────────────────────────────────────

export const PROVIDER_INFO: Record<ProviderId, {
  label: string;
  badge: string;
  badgeColor: string;
  description: string;
  freeTier: string;
  website: string;
}> = {
  zen: {
    label: "OpenCode Zen",
    badge: "100% FREE",
    badgeColor: "border-emerald-400/30 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300",
    description: "Curated free models with zero cost",
    freeTier: "All models 100% free, no credits needed",
    website: "https://opencode.ai/zen",
  },
  openrouter: {
    label: "OpenRouter",
    badge: "FREE TIERS",
    badgeColor: "border-sky-400/30 bg-sky-400/10 text-sky-600 dark:text-sky-300",
    description: "Huge catalog with free-tier models",
    freeTier: "Many :free models, rate-limited but free",
    website: "https://openrouter.ai",
  },
  nvidia: {
    label: "NVIDIA NIM",
    badge: "FREE CREDITS",
    badgeColor: "border-lime-400/30 bg-lime-400/10 text-lime-600 dark:text-lime-300",
    description: "Fast NVIDIA-hosted open models",
    freeTier: "Free developer credits on signup",
    website: "https://build.nvidia.com",
  },
  local: {
    label: "Local Models",
    badge: "ON-DEVICE",
    badgeColor: "border-amber-400/30 bg-amber-400/10 text-amber-600 dark:text-amber-300",
    description: "GGUF models from Hugging Face, run on-device via llama.cpp",
    freeTier: "No API key, no data leaves your phone",
    website: "https://huggingface.co",
  },
};

// ── Smart Functions ─────────────────────────────────────────────────────────

/** Get all models, optionally filtered by provider */
export function getSmartModels(provider?: ProviderId): SmartModel[] {
  if (provider) return MODEL_DATABASE.filter((m) => m.provider === provider);
  return [...MODEL_DATABASE];
}

/** Get models for a specific category */
export function getModelsByCategory(category: ModelCategory): SmartModel[] {
  return MODEL_DATABASE.filter((m) => m.categories.includes(category) && !m.removedAt);
}

/** Get free models only */
export function getFreeModels(provider?: ProviderId): SmartModel[] {
  return MODEL_DATABASE.filter((m) => m.isFree && !m.removedAt && (!provider || m.provider === provider));
}

/** Get models by speed */
export function getModelsBySpeed(speed: SmartModel["speed"]): SmartModel[] {
  return MODEL_DATABASE.filter((m) => m.speed === speed && !m.removedAt);
}

/** Recommend a model based on task type */
export function recommendModel(
  task: ModelCategory,
  preferFree: boolean = true,
  preferFast: boolean = false,
): SmartModel | null {
  let candidates = MODEL_DATABASE.filter(
    (m) => m.categories.includes(task) && !m.removedAt,
  );

  if (preferFree) candidates = candidates.filter((m) => m.isFree);
  if (preferFast) candidates.sort((a, b) => (a.speed === "fast" ? -1 : b.speed === "fast" ? 1 : 0));

  // Prefer Zen first, then OpenRouter, then NVIDIA
  const zenModel = candidates.find((m) => m.provider === "zen");
  if (zenModel) return zenModel;

  return candidates[0] || null;
}

/** Smart model picker — get best model for a prompt */
export function smartPick(prompt: string): SmartModel {
  const lower = prompt.toLowerCase();

  // Detect task type from prompt
  if (/\b(code|debug|function|class|api|script|bug|refactor|implement)\b/i.test(lower)) {
    return recommendModel("coding") || recommendModel("general")!;
  }
  if (/\b(math|equation|formula|calculate|proof|integral|derivative)\b/i.test(lower)) {
    return recommendModel("math") || recommendModel("reasoning")!;
  }
  if (/\b(write|essay|story|poem|blog|article|draft|prose)\b/i.test(lower)) {
    return recommendModel("writing") || recommendModel("creative")!;
  }
  if (/\b(analyze|data|chart|graph|statistics|trend|insight)\b/i.test(lower)) {
    return recommendModel("analysis") || recommendModel("general")!;
  }
  if (/\b(translate|translation|language|spanish|french|chinese)\b/i.test(lower)) {
    return recommendModel("translation") || recommendModel("general")!;
  }
  if (/\b(explain|reason|think|logic|puzzle|riddle)\b/i.test(lower)) {
    return recommendModel("reasoning") || recommendModel("general")!;
  }
  if (/\b(creative|imagine|story|poem|brainstorm|ideate)\b/i.test(lower)) {
    return recommendModel("creative") || recommendModel("writing")!;
  }

  return recommendModel("general")!;
}

/** Detect provider changes by comparing with stored snapshot */
export function detectProviderChanges(
  provider: ProviderId,
  currentModels: string[],
): ModelChange[] {
  const STORAGE_KEY = `dagestan.models.${provider}`;
  const changes: ModelChange[] = [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const previousModels: string[] = stored ? JSON.parse(stored) : [];

    // New models (in current but not in previous)
    for (const modelId of currentModels) {
      if (!previousModels.includes(modelId)) {
        const model = MODEL_DATABASE.find((m) => m.id === modelId);
        changes.push({
          type: "added",
          modelId,
          modelLabel: model?.label || modelId,
          timestamp: Date.now(),
          details: `New ${model?.isFree ? "free" : "paid"} model detected`,
        });
      }
    }

    // Removed models (in previous but not in current)
    for (const modelId of previousModels) {
      if (!currentModels.includes(modelId)) {
        const model = MODEL_DATABASE.find((m) => m.id === modelId);
        changes.push({
          type: "removed",
          modelId,
          modelLabel: model?.label || modelId,
          timestamp: Date.now(),
          details: `Model no longer available`,
        });
      }
    }

    // Save current snapshot
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentModels));
  } catch {
    // Private mode or storage full
  }

  return changes;
}

/** Get provider status summary */
export function getProviderStatus(provider: ProviderId): ProviderStatus {
  const models = getSmartModels(provider);
  const freeModels = models.filter((m) => m.isFree);
  const changes = detectProviderChanges(
    provider,
    models.map((m) => m.id),
  );

  return {
    provider,
    label: PROVIDER_INFO[provider].label,
    totalModels: models.length,
    freeModels: freeModels.length,
    lastChecked: Date.now(),
    status: "healthy",
    changes,
  };
}

/** Get all provider statuses */
export function getAllProviderStatuses(): ProviderStatus[] {
  return (["zen", "openrouter", "nvidia"] as ProviderId[]).map(getProviderStatus);
}

/** Format model for display */
export function formatModel(model: SmartModel): {
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
} {
  const categories = model.categories
    .filter((c) => c !== "general")
    .map((c) => CATEGORY_INFO[c].icon)
    .join(" ");

  return {
    title: model.label,
    subtitle: `${categories} · ${model.contextWindow.toLocaleString()} ctx · ${model.speed}`,
    badge: model.isFree ? "FREE" : "CREDITS",
    badgeColor: model.isFree
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300"
      : "border-amber-400/30 bg-amber-400/10 text-amber-600 dark:text-amber-300",
  };
}

/** Search models by text */
export function searchModels(query: string): SmartModel[] {
  const lower = query.toLowerCase();
  return MODEL_DATABASE.filter(
    (m) =>
      !m.removedAt &&
      (m.label.toLowerCase().includes(lower) ||
        m.id.toLowerCase().includes(lower) ||
        m.notes?.toLowerCase().includes(lower) ||
        m.categories.some((c) => c.includes(lower))),
  );
}
