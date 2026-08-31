import { describe, it, expect } from "vitest";
import { isTransientError } from "../outbox";

describe("outbox.isTransientError", () => {
  it("flags network-style errors", () => {
    expect(isTransientError(new Error("NetworkError when attempting to fetch resource"))).toBe(true);
    expect(isTransientError(new Error("failed to fetch"))).toBe(true);
    expect(isTransientError(new Error("Request timeout"))).toBe(true);
    expect(isTransientError(new Error("HTTP 503 Service Unavailable"))).toBe(true);
    expect(isTransientError(new Error("HTTP 504 Gateway Timeout"))).toBe(true);
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("ETIMEDOUT"))).toBe(true);
  });

  it("does NOT flag non-transient errors", () => {
    expect(isTransientError(new Error("invalid API key"))).toBe(false);
    expect(isTransientError(new Error("model not found"))).toBe(false);
    expect(isTransientError(new Error("AbortError"))).toBe(false);
    expect(isTransientError(new Error(""))).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
    expect(isTransientError({ message: "NetworkError" })).toBe(false); // not an Error instance
    expect(isTransientError("NetworkError")).toBe(false);
  });
});

describe("outbox backoff schedule (indirect)", () => {
  it("rejects errors that look like user cancellations", () => {
    expect(isTransientError(new Error("AbortError: user cancelled"))).toBe(false);
  });
});
