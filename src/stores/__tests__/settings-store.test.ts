import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "../settings-store";

describe("useSettingsStore", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      theme: "dark",
      selectedProvider: "zen",
      compactMode: false,
      notificationsEnabled: true,
    });
  });

  it("should default to dark theme", () => {
    expect(useSettingsStore.getState().theme).toBe("dark");
  });

  it("should toggle theme", () => {
    const { toggleTheme } = useSettingsStore.getState();
    toggleTheme();
    expect(useSettingsStore.getState().theme).toBe("light");
    toggleTheme();
    expect(useSettingsStore.getState().theme).toBe("dark");
  });

  it("should set theme explicitly", () => {
    useSettingsStore.getState().setTheme("light");
    expect(useSettingsStore.getState().theme).toBe("light");
  });

  it("should set selected provider", () => {
    useSettingsStore.getState().setSelectedProvider("openrouter");
    expect(useSettingsStore.getState().selectedProvider).toBe("openrouter");
  });

  it("should toggle compact mode", () => {
    useSettingsStore.getState().setCompactMode(true);
    expect(useSettingsStore.getState().compactMode).toBe(true);
  });

  it("should toggle notifications", () => {
    useSettingsStore.getState().setNotificationsEnabled(false);
    expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
  });
});
