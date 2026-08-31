import "@testing-library/jest-dom/vitest";

// Inject a small fake key pool so api-key-pool tests have something to
// assert against. The real keys come from secrets.local.json at build
// time via vite.config.ts → __DAGESTAN_BUILD_KEYS__.
(globalThis as Record<string, unknown>).__DAGESTAN_BUILD_KEYS__ = [
  { provider: "zen", key: "test-zen-1", label: "Zen test #01" },
  { provider: "zen", key: "test-zen-2", label: "Zen test #02" },
  { provider: "openrouter", key: "test-or-1", label: "OR test #01" },
  { provider: "openrouter", key: "test-or-2", label: "OR test #02" },
  { provider: "nvidia", key: "test-nv-1", label: "NV test #01" },
  { provider: "nvidia", key: "test-nv-2", label: "NV test #02" },
];

// Ensure localStorage is clean between tests for things like usage stats.
try { localStorage.clear(); } catch { /* SSR */ }

// jsdom does not implement matchMedia; shim it so responsive hooks
// (use-mobile) can listen for viewport changes without crashing.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
