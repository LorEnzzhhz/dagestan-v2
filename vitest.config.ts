import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    // Only scan the Dagestan source tree. The repo also ships
    // vendored `openclaw-real/` and `opencodex/` which contain their
    // own vitest suites — they should not run from `npm test`.
    include: ["src/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/openclaw-real/**",
      "**/opencodex/**",
      "**/dagestan-android/**",
      "**/build-output/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/lib/**/*.ts", "src/lib/**/*.tsx"],
      exclude: ["src/lib/__tests__/**", "src/lib/**/*.d.ts"],
    },
  },
});
