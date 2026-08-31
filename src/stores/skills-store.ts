import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SkillId } from "@/hooks/use-skills";

const DEFAULT_SKILLS: SkillId[] = ["math"];

interface SkillsState {
  enabled: SkillId[];
  toggle: (id: SkillId) => void;
  isEnabled: (id: SkillId) => boolean;
  setEnabled: (skills: SkillId[]) => void;
}

export const useSkillsStore = create<SkillsState>()(
  persist(
    (set, get) => ({
      enabled: DEFAULT_SKILLS,
      toggle: (id) =>
        set((state) => ({
          enabled: state.enabled.includes(id)
            ? state.enabled.filter((s) => s !== id)
            : [...state.enabled, id],
        })),
      isEnabled: (id) => get().enabled.includes(id),
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: "dagestan.skills",
    }
  )
);
