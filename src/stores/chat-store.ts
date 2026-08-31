import { create } from "zustand";
import type { ProviderId } from "@/lib/models";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "@/lib/models";
import { migrateKey } from "@/lib/store";

export type Phase = "idle" | "searching" | "running" | "streaming";

export interface Selection {
  provider: ProviderId | string;
  model: string;
}

const SEL_KEY = migrateKey("prism.model", "dagestan.model");

function loadSelection(): Selection {
  try {
    const raw = localStorage.getItem(SEL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Selection;
      // Migrate any selection pointing at the local stub model — those only
      // produce placeholder replies. Fall back to a real free cloud model so
      // the user's next chat actually responds.
      if (parsed?.provider === "local" || parsed?.model === "local" || parsed?.model === "local:none") {
        return { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL };
      }
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL };
}

interface ChatState {
  // UI state
  phase: Phase;
  setPhase: (phase: Phase) => void;
  
  // Model selection
  selection: Selection;
  setSelection: (sel: Selection) => void;
  
  // Streaming
  streamText: string;
  setStreamText: (text: string) => void;
  
  // Thinking mode
  thinkingMode: boolean;
  setThinkingMode: (enabled: boolean) => void;
  
  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  
  // Error
  error: string | null;
  setError: (error: string | null) => void;
  
  // Sources
  sources: Array<{ title: string; url: string; snippet: string }> | null;
  setSources: (sources: Array<{ title: string; url: string; snippet: string }> | null) => void;
  
  // Computed — derived from phase, not stored
  busy: boolean;
}

export const useChatStore = create<ChatState>()((set) => ({
  // UI state
  phase: "idle",
  setPhase: (phase) => set({ phase, busy: phase !== "idle" }),
  
  // Model selection
  selection: loadSelection(),
  setSelection: (sel) => {
    localStorage.setItem(SEL_KEY, JSON.stringify(sel));
    set({ selection: sel });
  },
  
  // Streaming
  streamText: "",
  setStreamText: (text) => set({ streamText: text }),
  
  // Thinking mode
  thinkingMode: (() => {
    try {
      return localStorage.getItem("dagestan.thinkingMode") === "true";
    } catch {
      return false;
    }
  })(),
  setThinkingMode: (enabled) => {
    try {
      localStorage.setItem("dagestan.thinkingMode", String(enabled));
    } catch { /* ignore */ }
    set({ thinkingMode: enabled });
  },
  
  // Sidebar
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  
  // Error
  error: null,
  setError: (error) => set({ error }),
  
  // Sources
  sources: null,
  setSources: (sources) => set({ sources }),
  
  // Computed
  busy: false,
}));
