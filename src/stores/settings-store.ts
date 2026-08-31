import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  // Theme
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;
  
  // Provider
  selectedProvider: string;
  setSelectedProvider: (provider: string) => void;
  
  // UI preferences
  compactMode: boolean;
  setCompactMode: (compact: boolean) => void;
  
  // Notifications
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Theme
      theme: "dark",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({
        theme: state.theme === "dark" ? "light" : "dark",
      })),
      
      // Provider
      selectedProvider: "zen",
      setSelectedProvider: (provider) => set({ selectedProvider: provider }),
      
      // UI preferences
      compactMode: false,
      setCompactMode: (compact) => set({ compactMode: compact }),
      
      // Notifications
      notificationsEnabled: true,
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
    }),
    {
      name: "dagestan.settings",
    }
  )
);
