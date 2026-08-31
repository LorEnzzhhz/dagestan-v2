/*
 * codex-inject.js — Dagestan injection for codex-web-local WebView
 *
 * Run this after the page loads to add:
 *   1. A Dagestan gradient strip at the top
 *   2. Quick-action suggestion chips below "Let's build"
 *   3. Branded footer
 *   4. Auto-resize for mobile viewport
 */

(function () {
  "use strict";

  // Prevent double-injection
  if (window.__dagestanCodexInjected) return;
  window.__dagestanCodexInjected = true;

  // ── 1. Gradient branding strip ──────────────────────────────────────────
  var strip = document.createElement("div");
  strip.className = "dagestan-strip";
  document.body.appendChild(strip);

  // ── 2. Quick-action chips ──────────────────────────────────────────────
  var CHIPS = [
    { label: "🚀 Build a website", prompt: "Build a modern one-page website" },
    { label: "🐍 Python script", prompt: "Write a useful Python CLI tool" },
    { label: "🔧 Fix a bug", prompt: "Help me debug this code" },
    { label: "📝 Explain code", prompt: "Explain how this code works" },
    { label: "🧪 Write tests", prompt: "Write unit tests for this function" },
    { label: "🎨 Design UI", prompt: "Design a beautiful React component" },
  ];

  function injectChips() {
    // Find the center content area with "Let's build"
    var heading = document.querySelector("h1, h2, [class*='heading']");
    if (!heading || document.querySelector(".dagestan-chips")) return;

    var chipContainer = document.createElement("div");
    chipContainer.className = "dagestan-chips";
    chipContainer.style.cssText =
      "display:flex;flex-wrap:wrap;gap:8px;justify-content:center;" +
      "max-width:640px;margin:16px auto 0;padding:0 16px;";

    CHIPS.forEach(function (chip) {
      var btn = document.createElement("button");
      btn.textContent = chip.label;
      btn.style.cssText =
        "background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);" +
        "border-radius:20px;padding:8px 16px;font-size:13px;color:#cbd5e1;" +
        "cursor:pointer;transition:all 0.2s;white-space:nowrap;";
      btn.onmouseenter = function () {
        btn.style.background = "rgba(34,211,238,0.12)";
        btn.style.borderColor = "rgba(34,211,238,0.4)";
        btn.style.color = "#22d3ee";
      };
      btn.onmouseleave = function () {
        btn.style.background = "rgba(255,255,255,0.06)";
        btn.style.borderColor = "rgba(255,255,255,0.1)";
        btn.style.color = "#cbd5e1";
      };
      btn.onclick = function () {
        // Find the textarea and fill it
        var ta = document.querySelector(
          "textarea, [contenteditable='true'], input[type='text']"
        );
        if (ta) {
          if (ta.tagName === "TEXTAREA" || ta.tagName === "INPUT") {
            ta.value = chip.prompt;
            ta.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            ta.textContent = chip.prompt;
            ta.dispatchEvent(new Event("input", { bubbles: true }));
          }
          ta.focus();
        }
      };
      chipContainer.appendChild(btn);
    });

    heading.parentNode.insertBefore(chipContainer, heading.nextSibling);
  }

  // ── 3. Branded footer ──────────────────────────────────────────────────
  function injectFooter() {
    if (document.querySelector(".dagestan-footer")) return;

    var footer = document.createElement("div");
    footer.className = "dagestan-footer";
    footer.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;text-align:center;" +
      "padding:6px;font-size:11px;color:rgba(148,163,184,0.5);" +
      "background:linear-gradient(transparent,rgba(10,15,26,0.9));" +
      "pointer-events:none;z-index:100;";
    footer.textContent = "Dagestan · Unlimited context · No paywall · No ads";
    document.body.appendChild(footer);
  }

  // ── 4. Mobile viewport fix ─────────────────────────────────────────────
  function fixViewport() {
    var meta = document.querySelector("meta[name='viewport']");
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.content =
      "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no";
  }

  // ── 5. Override innerWidth for sidebar rendering ────────────────────────
  // codex-web-local checks innerWidth to decide sidebar visibility
  try {
    Object.defineProperty(window, "innerWidth", {
      get: function () {
        return 1200; // Force desktop layout
      },
      configurable: true,
    });
    Object.defineProperty(window, "outerWidth", {
      get: function () {
        return 1200;
      },
      configurable: true,
    });
  } catch (e) {
    /* override failed — non-critical */
  }

  // ── Init ───────────────────────────────────────────────────────────────
  fixViewport();

  // Wait for DOM to settle, then inject
  var attempts = 0;
  var timer = setInterval(function () {
    attempts++;
    injectChips();
    injectFooter();

    // Also try on MutationObserver for SPA navigation
    if (attempts === 3) {
      var observer = new MutationObserver(function () {
        injectChips();
        injectFooter();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      clearInterval(timer);
    }

    if (attempts > 20) clearInterval(timer);
  }, 500);
})();
