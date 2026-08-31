import { describe, it, expect, beforeEach } from "vitest";
import {
  recordModelSuccess,
  recordModelFailure,
  isModelUnhealthy,
  clearModelHealth,
} from "../model-health";

const KEY = "dagestan.modelHealth";

describe("model-health", () => {
  beforeEach(() => {
    try { localStorage.removeItem(KEY); } catch { /* */ }
    clearModelHealth();
  });

  it("returns null/healthy for unknown models", () => {
    expect(isModelUnhealthy("zen", "big-pickle")).toBe(false);
  });

  it("marks removed on 404 / not-found errors", () => {
    recordModelFailure("zen", "big-pickle", 404, "model not found");
    expect(isModelUnhealthy("zen", "big-pickle")).toBe(true);
  });

  it("marks rate-limited on 429 / rate errors", () => {
    recordModelFailure("zen", "big-pickle", 429, "rate limit exceeded");
    expect(isModelUnhealthy("zen", "big-pickle")).toBe(true);
  });

  it("success clears the unhealthy state", () => {
    recordModelFailure("zen", "big-pickle", 404, "model not found");
    expect(isModelUnhealthy("zen", "big-pickle")).toBe(true);
    recordModelSuccess("zen", "big-pickle");
    expect(isModelUnhealthy("zen", "big-pickle")).toBe(false);
  });

  it("any non-404 failure marks the model rate-limited", () => {
    recordModelFailure("zen", "x", 500, "server error");
    expect(isModelUnhealthy("zen", "x")).toBe(true);
  });

  it("clearModelHealth wipes everything", () => {
    recordModelFailure("zen", "big-pickle", 404, "not found");
    clearModelHealth();
    expect(isModelUnhealthy("zen", "big-pickle")).toBe(false);
  });
});
