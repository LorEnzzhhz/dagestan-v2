import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
import fs from "node:fs";

// Load secrets.local.json at build time and inject as a global. The
// file is gitignored — when missing the pool is empty (devs add their
// own keys) and the app still boots.
function loadBuildKeys() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, "secrets.local.json"), "utf8");
    const parsed = JSON.parse(raw);
    const providers = parsed?.providers ?? {};
    const out = [];
    for (const [provider, keys] of Object.entries(providers)) {
      for (const k of Array.isArray(keys) ? keys : []) {
        if (typeof k?.key === "string") {
          out.push({ provider, key: k.key, label: k.label ?? `${provider} key` });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

export default defineConfig({
  plugins: [
    {
      name: "dagestan-keys",
      transformIndexHtml() {
        const keys = loadBuildKeys();
        return [
          {
            tag: "script",
            attrs: { type: "application/json", id: "dagestan-keys" },
            children: JSON.stringify(keys),
          },
        ];
      },
      // Expose the keys on globalThis so api-key-pool.ts can read them.
      config() {
        return {
          define: {
            __DAGESTAN_BUILD_KEYS__: JSON.stringify(loadBuildKeys()),
          },
        };
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Force a single copy of React across all packages. Without this,
    // sub-deps can resolve their own React copies and trigger
    // "Invalid hook call" errors at runtime.
    dedupe: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
  },
  build: {
    // Enable source maps for better debugging (disable in production if needed)
    sourcemap: false,
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching and lazy loading
        manualChunks: {
          // Vendor chunks for large libraries
          'react-vendor': ['react', 'react-dom', 'react-router'],
          // Large UI library chunks
          'radix-ui': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-context-menu',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-hover-card',
            '@radix-ui/react-label',
            '@radix-ui/react-menubar',
            '@radix-ui/react-navigation-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-progress',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slider',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group',
            '@radix-ui/react-tooltip',
          ],
          // Heavy optional libraries - separate chunks for better lazy loading
          'framer-motion': ['framer-motion'],
          'charts': ['recharts'],
          'forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
        // Optimize chunk size
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Increase chunk size warning limit for better chunking
    chunkSizeWarningLimit: 1000,
    // Target older Android System WebViews: 'esnext' ships untranspiled
    // syntax (optional chaining, logical assignment, etc.) that older
    // WebViews fail to PARSE — silently rendering a permanent black
    // screen. es2018 parses everywhere minSdk 26 can run.
    target: 'es2018',
    // Minify options - using esbuild (faster than terser)
    minify: 'esbuild',
  },
  // Optimize dependencies
  optimizeDeps: {
    // Only scan the app entry HTML; avoids crawling unrelated *.html files
    // if a legacy snapshot accidentally contains leaked package folders.
    entries: ['index.html'],
    include: [      'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'react-router', 'framer-motion',
    ],
  },
  // Performance hints
  server: {
    // Bind to localhost by default. Set VITE_LAN=1 to expose on the LAN
    // (matches the local-models server's LOCAL_MODELS_LAN opt-in).
    host: process.env.VITE_LAN === "1" ? true : "127.0.0.1",
    port: 5173,
    // Keep HMR on, but disable full-screen error overlay
    hmr: {
      overlay: false,
    },
    // The repo ships a large `openclaw-real/` and `opencodex/` tree
    // alongside `src/`. Watching those blows past inotify limits on
    // Android / Termux where fs.watch caps are small. Ignore them
    // unless the operator explicitly opts in via VITE_WATCH_ALL=1.
    watch: {
      ignored: process.env.VITE_WATCH_ALL === "1"
        ? []
        : [
            "**/openclaw-real/**",
            "**/opencodex/**",
            "**/dagestan-android/**",
            "**/build-output/**",
            "**/dist/**",
            "**/node_modules/**",
            "**/.git/**",
          ],
    },
  },
});
