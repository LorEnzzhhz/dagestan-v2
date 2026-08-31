// ---------------------------------------------------------------------------
// onboarding.ts — First-time user onboarding flow. Shows a guided setup
// on first visit, then never again.
// ---------------------------------------------------------------------------

import { migrateKey } from "./store";

const COMPLETED_KEY = migrateKey("prism.onboarded", "dagestan.onboarded");

/** Check if onboarding has been completed. */
export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(COMPLETED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Mark onboarding as complete. */
export function completeOnboarding(): void {
  try {
    localStorage.setItem(COMPLETED_KEY, "true");
  } catch {
    // ignore
  }
}

/** Reset onboarding (for testing). */
export function resetOnboarding(): void {
  try {
    localStorage.removeItem(COMPLETED_KEY);
  } catch {
    // ignore
  }
}

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to Dagestan",
    description: "Your personal AI assistant with free models, live web search, and a silent Linux agent on your device.",
    icon: "✦",
  },
  {
    id: "models",
    title: "Free AI Models",
    description: "Choose from dozens of free models across OpenCode Zen, OpenRouter, and NVIDIA NIM. No API key required for free tiers.",
    icon: "🧠",
  },
  {
    id: "search",
    title: "Live Web Search",
    description: "Enable the web search skill to get real-time answers with citations from across the internet.",
    icon: "🔍",
  },
  {
    id: "skills",
    title: "Powerful Skills",
    description: "Toggle skills on and off: math solver, writing partner, code runner, deep research, and more.",
    icon: "⚡",
  },
  {
    id: "device",
    title: "Device Agent",
    description: "Connect a Linux device to run commands silently — install packages, build apps, and deploy directly from chat.",
    icon: "💻",
  },
];
