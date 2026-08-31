import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "../chat-store";

describe("useChatStore", () => {
  beforeEach(() => {
    useChatStore.setState({
      phase: "idle",
      streamText: "",
      error: null,
      sources: null,
      sidebarOpen: true,
      busy: false,
    });
  });

  it("should start in idle phase", () => {
    expect(useChatStore.getState().phase).toBe("idle");
  });

  it("should compute busy from phase via setPhase", () => {
    useChatStore.getState().setPhase("streaming");
    expect(useChatStore.getState().busy).toBe(true);
  });

  it("should not be busy in idle phase", () => {
    expect(useChatStore.getState().busy).toBe(false);
  });

  it("should set and clear error", () => {
    const { setError } = useChatStore.getState();
    setError("something went wrong");
    expect(useChatStore.getState().error).toBe("something went wrong");
    setError(null);
    expect(useChatStore.getState().error).toBeNull();
  });

  it("should toggle thinking mode and persist", () => {
    const { setThinkingMode } = useChatStore.getState();
    setThinkingMode(true);
    expect(useChatStore.getState().thinkingMode).toBe(true);
    setThinkingMode(false);
    expect(useChatStore.getState().thinkingMode).toBe(false);
  });

  it("should toggle sidebar", () => {
    const { setSidebarOpen } = useChatStore.getState();
    setSidebarOpen(false);
    expect(useChatStore.getState().sidebarOpen).toBe(false);
    setSidebarOpen(true);
    expect(useChatStore.getState().sidebarOpen).toBe(true);
  });

  it("should update stream text", () => {
    const { setStreamText } = useChatStore.getState();
    setStreamText("Hello world");
    expect(useChatStore.getState().streamText).toBe("Hello world");
  });

  it("should set sources", () => {
    const mockSources = [
      { title: "Test", url: "https://test.com", snippet: "A snippet" },
    ];
    const { setSources } = useChatStore.getState();
    setSources(mockSources);
    expect(useChatStore.getState().sources).toEqual(mockSources);
  });
});
