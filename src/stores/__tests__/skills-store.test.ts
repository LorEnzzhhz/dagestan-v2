import { describe, it, expect, beforeEach } from "vitest";
import { useSkillsStore } from "../skills-store";

describe("useSkillsStore", () => {
  beforeEach(() => {
    // Reset store to defaults
    useSkillsStore.setState({ enabled: ["math"] });
  });

  it("should start with math enabled by default", () => {
    const state = useSkillsStore.getState();
    expect(state.enabled).toContain("math");
  });

  it("should toggle a skill on", () => {
    const { toggle } = useSkillsStore.getState();
    toggle("web");
    expect(useSkillsStore.getState().enabled).toContain("web");
  });

  it("should toggle a skill off", () => {
    const { toggle } = useSkillsStore.getState();
    // math is on by default
    toggle("math");
    expect(useSkillsStore.getState().enabled).not.toContain("math");
  });

  it("should not duplicate skills when toggled twice", () => {
    const { toggle } = useSkillsStore.getState();
    toggle("web");
    toggle("web");
    const webCount = useSkillsStore
      .getState()
      .enabled.filter((s) => s === "web").length;
    expect(webCount).toBe(0); // toggled off after two clicks
  });

  it("should check isEnabled correctly", () => {
    const { isEnabled, toggle } = useSkillsStore.getState();
    expect(isEnabled("math")).toBe(true);
    toggle("math");
    expect(isEnabled("math")).toBe(false);
  });

  it("should set multiple skills at once", () => {
    const { setEnabled } = useSkillsStore.getState();
    setEnabled(["web", "research", "writer"]);
    const state = useSkillsStore.getState();
    expect(state.enabled).toEqual(["web", "research", "writer"]);
  });
});
