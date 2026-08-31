/**
 * Auto-Skill Generator — Task Observer pattern
 *
 * Watches user session patterns, detects repeated workflows,
 * and generates SKILL.md skill definitions automatically.
 *
 * Inspired by:
 * - rebelytics/one-skill-to-rule-them-all (meta-skill observation)
 * - SICA (self-improving coding agent)
 * - MIND-Skill (multi-agent quality-guaranteed generation)
 */

export interface SkillObservation {
  id: string;
  timestamp: number;
  pattern: string;
  frequency: number;
  examples: string[];
  suggestedSkill: string;
  status: "pending" | "approved" | "rejected" | "auto-created";
}

export interface GeneratedSkill {
  id: string;
  name: string;
  tagline: string;
  description: string;
  systemPrompt: string;
  category: "auto-core" | "auto-advanced" | "auto-creative" | "auto-system";
  icon: string;
  accent: string;
  source: "auto-generated" | "user-approved" | "self-improved";
  createdAt: number;
  executionCount: number;
  successRate: number;
  improvementLog: SkillImprovement[];
}

export interface SkillImprovement {
  timestamp: number;
  trigger: "execution-failure" | "user-correction" | "pattern-detected" | "self-review";
  before: string;
  after: string;
  reason: string;
}

export interface ExecutionLog {
  skillId: string;
  timestamp: number;
  input: string;
  output: string;
  success: boolean;
  duration: number;
  corrections: string[];
  userFeedback?: "positive" | "negative" | "neutral";
}

const STORAGE_KEY_OBS = "dagestan.skill-observations";
const STORAGE_KEY_GEN = "dagestan.generated-skills";
const STORAGE_KEY_LOGS = "dagestan.execution-logs";

// ─── Pattern Detection ────────────────────────────────────────────

const PATTERN_SIGNATURES: Record<string, string[]> = {
  "code-review": ["review", "check my code", "look at this", "code review", "audit"],
  "data-analysis": ["analyze data", "csv", "statistics", "chart", "trend", "dataset"],
  "email-draft": ["write email", "draft email", "compose email", "reply to"],
  "summarize": ["summarize", "summary", "tldr", "brief overview", "key points"],
  "translate": ["translate", "in spanish", "in french", "in german", "in chinese"],
  "debug": ["debug", "error", "fix this", "not working", "bug", "crash"],
  "explain": ["explain", "how does", "what is", "why does", "walk me through"],
  "convert": ["convert", "transform", "change to", "format as", "into json/csv"],
  "brainstorm": ["brainstorm", "ideas for", "suggest", "creative ideas", "what if"],
  "write-code": ["write code", "implement", "create function", "build a", "script for"],
};

export function detectPatterns(messages: { role: string; content: string }[]): SkillObservation[] {
  const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content.toLowerCase());
  const observations: SkillObservation[] = [];

  for (const [patternName, keywords] of Object.entries(PATTERN_SIGNATURES)) {
    const matches = userMessages.filter((msg) =>
      keywords.some((kw) => msg.includes(kw)),
    );

    if (matches.length >= 2) {
      observations.push({
        id: `obs-${patternName}-${Date.now()}`,
        timestamp: Date.now(),
        pattern: patternName,
        frequency: matches.length,
        examples: matches.slice(0, 3),
        suggestedSkill: patternName,
        status: matches.length >= 3 ? "pending" : "pending",
      });
    }
  }

  return observations;
}

// ─── Skill Generation ─────────────────────────────────────────────

const SKILL_TEMPLATES: Record<string, Partial<GeneratedSkill>> = {
  "code-review": {
    name: "Code Reviewer",
    tagline: "AI-powered code review with best practices",
    description: "Automatically reviews code for bugs, security issues, performance, and style. Provides actionable feedback with line-by-line suggestions.",
    systemPrompt: "CODE REVIEW MODE: When reviewing code, check for: 1) Bugs and logic errors, 2) Security vulnerabilities, 3) Performance issues, 4) Code style and readability, 5) Edge cases. Format as: ✅ Good | ⚠️ Warning | 🔴 Critical. Always suggest fixes.",
    category: "auto-advanced",
    icon: "SearchCode",
    accent: "text-emerald-500",
  },
  "data-analysis": {
    name: "Data Analyst Pro",
    tagline: "Deep data insights with visualizations",
    description: "Analyzes datasets, computes statistics, identifies trends and anomalies, and suggests the best chart types for visualization.",
    systemPrompt: "DATA ANALYSIS MODE: When analyzing data, always: 1) Describe the dataset structure, 2) Compute key statistics (mean, median, std dev), 3) Identify patterns and outliers, 4) Suggest visualizations, 5) Provide actionable insights. Use tables for structured output.",
    category: "auto-advanced",
    icon: "BarChart3",
    accent: "text-orange-500",
  },
  "email-draft": {
    name: "Email Composer",
    tagline: "Professional emails in any tone",
    description: "Drafts professional emails with appropriate tone, structure, and call-to-action. Adapts to formal, casual, or urgent contexts.",
    systemPrompt: "EMAIL MODE: Draft emails with: 1) Clear subject line, 2) Appropriate greeting, 3) Concise body with context, 4) Clear call-to-action, 5) Professional closing. Ask about tone (formal/casual) if not specified.",
    category: "auto-core",
    icon: "Mail",
    accent: "text-blue-500",
  },
  "summarize": {
    name: "Smart Summarizer",
    tagline: "Key points from any content",
    description: "Extracts key points from text, articles, documents, or conversations. Provides TL;DR, detailed summary, and action items.",
    systemPrompt: "SUMMARY MODE: When summarizing, provide: 1) TL;DR (1-2 sentences), 2) Key points as bullet list, 3) Important details, 4) Action items if applicable, 5) Source quality assessment. Preserve critical numbers and names.",
    category: "auto-core",
    icon: "FileText",
    accent: "text-violet-500",
  },
  debug: {
    name: "Debug Assistant",
    tagline: "Find and fix bugs fast",
    description: "Systematic debugging: reads error messages, traces execution flow, identifies root causes, and provides fixes with explanations.",
    systemPrompt: "DEBUG MODE: When debugging, follow: 1) Read the error message carefully, 2) Identify the error type and location, 3) Trace the execution flow, 4) Identify root cause, 5) Provide a fix with explanation, 6) Suggest tests to prevent recurrence. Always explain WHY the fix works.",
    category: "auto-advanced",
    icon: "Bug",
    accent: "text-red-500",
  },
  explain: {
    name: "Concept Explainer",
    tagline: "Complex topics made simple",
    description: "Explains complex concepts using analogies, examples, and progressive disclosure. Adapts depth to user expertise level.",
    systemPrompt: "EXPLANATION MODE: When explaining concepts: 1) Start with a simple analogy, 2) Build up to technical detail, 3) Use concrete examples, 4) Address common misconceptions, 5) Provide further reading. Adapt depth based on the user's apparent expertise.",
    category: "auto-core",
    icon: "Lightbulb",
    accent: "text-amber-500",
  },
  "write-code": {
    name: "Code Generator",
    tagline: "Production-ready code from descriptions",
    description: "Generates clean, documented, tested code from natural language descriptions. Includes error handling and edge cases.",
    systemPrompt: "CODE GENERATION: When writing code: 1) Use clean, idiomatic patterns, 2) Add brief comments for complex logic, 3) Include error handling, 4) Consider edge cases, 5) Follow language conventions. Ask about language/framework preference if ambiguous.",
    category: "auto-advanced",
    icon: "Code",
    accent: "text-cyan-500",
  },
  convert: {
    name: "Format Converter",
    tagline: "Transform between any formats",
    description: "Converts data between formats (JSON↔CSV, Markdown↔HTML, etc.) with validation and preview.",
    systemPrompt: "CONVERSION MODE: When converting formats: 1) Validate input structure, 2) Handle edge cases (missing fields, nulls), 3) Preserve data types, 4) Show preview of output, 5) Offer to save in a downloadable format.",
    category: "auto-core",
    icon: "RefreshCw",
    accent: "text-teal-500",
  },
  brainstorm: {
    name: "Idea Generator",
    tagline: "Structured creative brainstorming",
    description: "Generates ideas using SCAMPER, mind mapping, and lateral thinking techniques. Organizes by feasibility and impact.",
    systemPrompt: "BRAINSTORM MODE: Generate ideas using: 1) Divergent thinking (quantity over quality first), 2) SCAMPER technique (Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse), 3) Rate each idea on feasibility and impact, 4) Suggest next steps for top ideas.",
    category: "auto-creative",
    icon: "Sparkles",
    accent: "text-fuchsia-500",
  },
  translate: {
    name: "Context Translator",
    tagline: "Translation that preserves meaning",
    description: "Translates text preserving context, idiom, and cultural nuance. Supports 100+ languages with back-translation verification.",
    systemPrompt: "TRANSLATION MODE: When translating: 1) Detect source language, 2) Preserve context and tone, 3) Handle idioms naturally, 4) Note untranslatable concepts, 5) Provide back-translation for verification. Ask about formality level if needed.",
    category: "auto-advanced",
    icon: "Languages",
    accent: "text-rose-500",
  },
};

export function generateSkill(observation: SkillObservation): GeneratedSkill | null {
  const template = SKILL_TEMPLATES[observation.pattern];
  if (!template) return null;

  return {
    id: `gen-${observation.pattern}-${Date.now()}`,
    name: template.name!,
    tagline: template.tagline!,
    description: template.description!,
    systemPrompt: template.systemPrompt!,
    category: template.category as GeneratedSkill["category"],
    icon: template.icon!,
    accent: template.accent!,
    source: "auto-generated",
    createdAt: Date.now(),
    executionCount: 0,
    successRate: 100,
    improvementLog: [],
  };
}

// ─── Self-Improvement Engine ──────────────────────────────────────

export function analyzeExecution(
  log: ExecutionLog,
  skill: GeneratedSkill,
): SkillImprovement | null {
  if (log.success) return null;

  // Detect correction patterns
  const corrections = log.corrections;
  if (corrections.length === 0) return null;

  const improvement: SkillImprovement = {
    timestamp: Date.now(),
    trigger: log.userFeedback === "negative" ? "user-correction" : "execution-failure",
    before: skill.systemPrompt,
    after: skill.systemPrompt + `\n\nAVOID: ${corrections.join("; ")}`,
    reason: `Failed execution detected. User corrections: ${corrections.join(", ")}`,
  };

  return improvement;
}

export function applyImprovement(
  skill: GeneratedSkill,
  improvement: SkillImprovement,
): GeneratedSkill {
  return {
    ...skill,
    systemPrompt: improvement.after,
    improvementLog: [...skill.improvementLog, improvement],
  };
}

// ─── Storage ──────────────────────────────────────────────────────

export function loadObservations(): SkillObservation[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_OBS) || "[]");
  } catch {
    return [];
  }
}

export function saveObservations(obs: SkillObservation[]) {
  localStorage.setItem(STORAGE_KEY_OBS, JSON.stringify(obs));
}

export function loadGeneratedSkills(): GeneratedSkill[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_GEN) || "[]");
  } catch {
    return [];
  }
}

export function saveGeneratedSkills(skills: GeneratedSkill[]) {
  localStorage.setItem(STORAGE_KEY_GEN, JSON.stringify(skills));
}

export function loadExecutionLogs(): ExecutionLog[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_LOGS) || "[]");
  } catch {
    return [];
  }
}

export function saveExecutionLogs(logs: ExecutionLog[]) {
  // Keep last 200 logs
  const trimmed = logs.slice(-200);
  localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(trimmed));
}

export function logExecution(log: ExecutionLog) {
  const logs = loadExecutionLogs();
  logs.push(log);
  saveExecutionLogs(logs);
}
