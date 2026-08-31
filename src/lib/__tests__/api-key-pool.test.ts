import { describe, it, expect } from "vitest";
import { hasPoolKeys, getPoolStatus } from "../api-key-pool";

describe("api-key-pool", () => {
  it("exposes keys for each active provider", () => {
    expect(hasPoolKeys("zen")).toBe(true);
    expect(hasPoolKeys("openrouter")).toBe(true);
    expect(hasPoolKeys("nvidia")).toBe(true);
  });

  it("does not expose orca keys after the router removal", () => {
    expect(hasPoolKeys("orca")).toBe(false);
  });

  it("getPoolStatus returns rows for every known provider", () => {
    const status = getPoolStatus();
    expect(Array.isArray(status)).toBe(true);
    // Function always returns one row per tracked provider (even with 0 keys)
    expect(status.length).toBeGreaterThanOrEqual(3);
    const providers = status.map((r) => r.provider);
    expect(providers).toContain("zen");
    expect(providers).toContain("openrouter");
    expect(providers).toContain("nvidia");
    // Active providers must have a non-empty pool
    for (const provider of ["zen", "openrouter", "nvidia"] as const) {
      const row = status.find((r) => r.provider === provider);
      expect(row).toBeDefined();
      expect(row!.total).toBeGreaterThan(0);
    }
  });
});
