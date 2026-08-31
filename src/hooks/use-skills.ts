import { useCallback, useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Globe,
  PenLine,
  Sigma,
  Code,
  FileSearch,
  Languages,
  ImageIcon,
  BarChart3,
  Terminal,
  Brain,
  Shield,
  Palette,
  Search,
  Layers,
} from "lucide-react";
import { migrateKey } from "@/lib/store";

export type SkillId =
  | "web"
  | "math"
  | "writer"
  | "coderunner"
  | "fileanalyzer"
  | "translator"
  | "imagedescriber"
  | "dataanalyst"
  | "shell"
  | "reasoning"
  | "safety"
  | "creative"
  | "research"
  | "localsearch";

export interface SkillDef {
  id: SkillId;
  name: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  category: "core" | "advanced" | "creative" | "system";
  systemPrompt?: string;
}

export const SKILLS: SkillDef[] = [
  // Core
  {
    id: "web",
    name: "Live web search",
    tagline: "Grounded answers with citations",
    description:
      "Before answering, runs a semantic search and feeds real, current web results into the model so answers cite live sources.",
    icon: Globe,
    accent: "text-cyan-500",
    category: "core",
  },
  {
    id: "math",
    name: "Math solver",
    tagline: "Step-by-step LaTeX solutions",
    description:
      "Switches the assistant into rigorous step-by-step mode and renders every equation beautifully with KaTeX.",
    icon: Sigma,
    accent: "text-violet-500",
    category: "core",
  },
  {
    id: "writer",
    name: "Writing partner",
    tagline: "Drafts, rewrites, polish",
    description:
      "Tunes tone, structure, and clarity — outlines first, tightens prose, and adapts to the voice you ask for.",
    icon: PenLine,
    accent: "text-amber-500",
    category: "core",
  },

  // Advanced
  {
    id: "coderunner",
    name: "Code runner",
    tagline: "Execute Python, JS, Bash inline",
    description:
      "Runs code snippets in a sandboxed environment and shows output directly in chat. Supports Python, JavaScript, and Bash.",
    icon: Code,
    accent: "text-emerald-500",
    category: "advanced",
  },
  {
    id: "fileanalyzer",
    name: "File analyzer",
    tagline: "Drop files, get insights",
    description:
      "Upload any file (PDF, image, code, data) and the AI reads, analyzes, and answers questions about it.",
    icon: FileSearch,
    accent: "text-sky-500",
    category: "advanced",
  },
  {
    id: "translator",
    name: "Universal translator",
    tagline: "100+ languages, context-aware",
    description:
      "Auto-detects source language and translates with full context preservation. Supports code comments, legal docs, and casual chat.",
    icon: Languages,
    accent: "text-rose-500",
    category: "advanced",
  },
  {
    id: "imagedescriber",
    name: "Image describer",
    tagline: "See and describe any image",
    description:
      "Upload an image and get detailed descriptions, OCR text extraction, visual Q&A, and accessibility alt-text generation.",
    icon: ImageIcon,
    accent: "text-pink-500",
    category: "advanced",
  },
  {
    id: "dataanalyst",
    name: "Data analyst",
    tagline: "Charts, stats, insights from data",
    description:
      "Paste CSV, JSON, or describe your dataset — get statistical summaries, trend analysis, and visualization suggestions.",
    icon: BarChart3,
    accent: "text-orange-500",
    category: "advanced",
  },
  {
    id: "shell",
    name: "Shell commands",
    tagline: "Linux terminal in chat",
    description:
      "Generates and explains shell commands for Linux, macOS, and Windows. Includes safety explanations for destructive commands.",
    icon: Terminal,
    accent: "text-lime-500",
    category: "advanced",
  },

  // Creative
  {
    id: "reasoning",
    name: "Deep reasoning",
    tagline: "Chain-of-thought problem solving",
    description:
      "Activates extended chain-of-thought reasoning for complex logic puzzles, multi-step problems, and analytical tasks.",
    icon: Brain,
    accent: "text-indigo-500",
    category: "creative",
  },
  {
    id: "creative",
    name: "Creative mode",
    tagline: "Stories, poetry, worldbuilding",
    description:
      "Unlocks creative writing, brainstorming, storytelling, and imaginative content generation with vivid, engaging prose.",
    icon: Palette,
    accent: "text-fuchsia-500",
    category: "creative",
  },

  // Research
  {
    id: "research",
    name: "Deep research",
    tagline: "Multi-source web research",
    description:
      "Chains multiple web searches, fetches and reads full page content, synthesizes findings across sources with citations.",
    icon: Layers,
    accent: "text-teal-500",
    category: "advanced",
  },
  {
    id: "localsearch",
    name: "Conversation search",
    tagline: "Search your chat history",
    description:
      "Searches all previous conversations to find relevant context from past discussions.",
    icon: Search,
    accent: "text-blue-500",
    category: "advanced",
  },

  // System
  {
    id: "safety",
    name: "Safety advisor",
    tagline: "Security & privacy guidance",
    description:
      "Provides security best practices, privacy advice, vulnerability analysis, and safe coding recommendations.",
    icon: Shield,
    accent: "text-red-500",
    category: "system",
  },
];

const STORAGE_KEY = migrateKey("prism.skills", "dagestan.skills");
const DEFAULT_SKILLS: SkillId[] = ["math"];

let current: SkillId[] = load();

function load(): SkillId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SKILLS;
    const parsed = JSON.parse(raw) as SkillId[];
    return parsed.filter((s) => SKILLS.some((d) => d.id === s));
  } catch {
    return DEFAULT_SKILLS;
  }
}

const listeners = new Set<() => void>();

function set(next: SkillId[]) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Shared, persisted skill toggles (localStorage-backed store). */
export function useSkills() {
  const enabled = useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_SKILLS,
  );

  const toggle = useCallback((id: SkillId) => {
    set(current.includes(id) ? current.filter((s) => s !== id) : [...current, id]);
  }, []);

  const isEnabled = useCallback((id: SkillId) => enabled.includes(id), [enabled]);

  return { enabled, toggle, isEnabled };
}

export function buildSystemPrompt(enabled: SkillId[]): string {
  const parts = [
    "You are Dagestan, a sharp, warm, no-fluff assistant. Format answers in Markdown. Use code blocks with language tags for code.",
  ];
  if (enabled.includes("math")) {
    parts.push(
      "MATH MODE: For any quantitative question, reason step by step, show your work, verify the result, and put ALL math in LaTeX — inline as $x^2$ and display as $$\\int_0^1 f(x)dx$$. Never leave math as plain text.",
    );
  }
  if (enabled.includes("writer")) {
    parts.push(
      "WRITING MODE: Act as an elite writing partner. Ask nothing unless truly blocked; prefer delivering a strong draft. Outline before long pieces, match the requested voice, cut filler, and offer one concrete alternative take at the end.",
    );
  }
  if (enabled.includes("coderunner")) {
    parts.push(
      "CODE RUNNER: When the user asks you to run code, provide the code in a fenced code block with the language tag. If they ask for output, simulate the execution and show expected results.",
    );
  }
  if (enabled.includes("fileanalyzer")) {
    parts.push(
      "FILE ANALYSIS: When a file is shared, analyze it thoroughly — identify structure, key data, issues, and provide actionable insights.",
    );
  }
  if (enabled.includes("translator")) {
    parts.push(
      "TRANSLATION: Auto-detect the source language. Translate with full context preservation. For ambiguous phrases, provide the most natural translation and note alternatives.",
    );
  }
  if (enabled.includes("imagedescriber")) {
    parts.push(
      "IMAGE ANALYSIS: When an image is shared, describe it in detail — objects, text, colors, composition. Answer questions about what you see.",
    );
  }
  if (enabled.includes("dataanalyst")) {
    parts.push(
      "DATA ANALYSIS: When data is provided, identify patterns, outliers, trends. Suggest visualizations. Calculate key statistics.",
    );
  }
  if (enabled.includes("shell")) {
    parts.push(
      "SHELL COMMANDS: When asked about terminal commands, provide the exact command with a brief explanation. Warn about destructive commands before showing them.",
    );
  }
  if (enabled.includes("reasoning")) {
    parts.push(
      "REASONING MODE: Think step by step. Show your reasoning chain. For complex problems, break them into subproblems and solve each one.",
    );
  }
  if (enabled.includes("creative")) {
    parts.push(
      "CREATIVE MODE: Unleash creativity. Use vivid imagery, metaphors, and engaging prose. For stories, build compelling characters and worlds.",
    );
  }
  if (enabled.includes("safety")) {
    parts.push(
      "SECURITY: Proactively identify security concerns in code and advice. Suggest best practices for privacy and safety.",
    );
  }
  if (enabled.includes("research")) {
    parts.push(
      "DEEP RESEARCH: When asked a complex research question, break it into 3-5 sub-queries. For each, search the web and read the full content. Synthesize findings across all sources. Cite every claim with [1], [2] etc. Structure the answer with clear sections, a summary, and a sources list at the end.",
    );
  }
  if (enabled.includes("localsearch")) {
    parts.push(
      "CONVERSATION MEMORY: You have access to the user's conversation history and extracted memories. Reference past conversations naturally when relevant — 'Last time you asked about...' or 'Based on your previous project...'. If the user asks to search their history, help them find past discussions.",
    );
  }
  return parts.join("\n\n");
}

/** Get skills grouped by category */
export function getSkillsByCategory() {
  const categories = ["core", "advanced", "creative", "system"] as const;
  return categories.map((cat) => ({
    category: cat,
    skills: SKILLS.filter((s) => s.category === cat),
  }));
}
