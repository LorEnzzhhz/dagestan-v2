import { describe, it, expect } from "vitest";

/**
 * These tests verify the structural invariants of the security patches:
 *  - No API key-like strings (`sk-...` / `nvapi-...`) live in source.
 *  - The `.gitignore` excludes secrets files.
 *  - The server exposes a sane default bind (loopback) and an auth gate.
 *
 * They don't try to hit the live HTTP server — that's covered by manual
 * smoke tests. Here we check that the *source code* still upholds the
 * guarantees we set out.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");

describe("source-tree security", () => {
  it("does not contain raw API keys in tracked source files", () => {
    // Walk all .ts files under src/ and check for sk-/nvapi- patterns.
    // Exempt files: this test file + the api-key-pool loader (it has no
    // keys now, but we guard with a regex anyway).
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (ent.isFile() && /\.(ts|tsx|mjs|js)$/.test(ent.name)) {
          if (full.endsWith("security.test.ts")) continue;
          const content = fs.readFileSync(full, "utf8");
          // Real keys are 32+ chars of base62. Test fixtures use shorter.
          if (/["'](sk-[A-Za-z0-9_-]{32,})["']/.test(content)) offenders.push(full);
          if (/["'](nvapi-[A-Za-z0-9_-]{32,})["']/.test(content)) offenders.push(full);
        }
      }
    }
    walk(path.join(ROOT, "src"));
    expect(offenders, `keys still hard-coded in:\n${offenders.join("\n")}`).toEqual([]);
  });

  it(".gitignore excludes secrets.local.json", () => {
    const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    // Either an explicit secrets.local.json pattern OR a *.local.json
    // wildcard that covers it.
    expect(
      gitignore.includes("secrets.local.json") || gitignore.includes("*.local.json"),
      "gitignore must exclude secrets.local.json"
    ).toBe(true);
    expect(gitignore).toMatch(/\.dagestan\//);
  });

  it("secrets.local.json.example exists for onboarding", () => {
    expect(fs.existsSync(path.join(ROOT, "secrets.local.json.example"))).toBe(true);
  });

  it("server binds to loopback by default", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "scripts/local-models/local-models-server.mjs"),
      "utf8"
    );
    expect(src).toMatch(/LOCAL_MODELS_HOST/);
    expect(src).toMatch(/127\.0\.0\.1/);
    // Default returns loopback unless LAN flag set
    expect(src).toMatch(/return "127\.0\.0\.1"/);
    // Token load exists
    expect(src).toMatch(/loadOrCreateToken/);
    // Auth check exists
    expect(src).toMatch(/checkAuth/);
    // Path sanitizer exists
    expect(src).toMatch(/safeRelative/);
    // Rate limiter exists
    expect(src).toMatch(/rateCheck/);
    // Security headers
    expect(src).toMatch(/X-Content-Type-Options/);
  });

  it("vite binds to localhost by default", () => {
    const src = fs.readFileSync(path.join(ROOT, "vite.config.ts"), "utf8");
    expect(src).toMatch(/VITE_LAN/);
    expect(src).toMatch(/127\.0\.0\.1/);
  });

  it("api-key-pool has no key strings in source", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "src/lib/api-key-pool.ts"),
      "utf8"
    );
    // Should NOT match the sk-/nvapi- hard-coded key patterns
    expect(src).not.toMatch(/key:\s*"sk-[A-Za-z0-9]{20,}/);
    expect(src).not.toMatch(/key:\s*"nvapi-[A-Za-z0-9]{20,}/);
  });
});
