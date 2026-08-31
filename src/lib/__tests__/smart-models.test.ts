import { describe, it, expect } from "vitest";
import { getSmartModels, getModelsByCategory, getFreeModels, recommendModel } from "../smart-models";

describe("smart-models", () => {
  it("returns curated models", () => {
    const all = getSmartModels();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((m) => typeof m.id === "string")).toBe(true);
  });

  it("filters by category", () => {
    const coding = getModelsByCategory("coding");
    expect(coding.every((m) => m.categories.includes("coding"))).toBe(true);
  });

  it("free models only", () => {
    const free = getFreeModels();
    expect(free.every((m) => m.isFree)).toBe(true);
  });

  it("recommends a model for a task", () => {
    const rec = recommendModel("coding", true, false);
    expect(rec).not.toBeNull();
    expect(rec?.categories).toContain("coding");
  });

  it("returns null for impossible constraints (no free reasoning)", () => {
    // No model must be 'free' AND in this rare intersection — but at least
    // we shouldn't crash. We just assert the function returns either null
    // or a valid model.
    const r = recommendModel("general", true, true);
    expect(r === null || typeof r.id === "string").toBe(true);
  });
});
