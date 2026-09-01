import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";

interface TerminalLine {
  type: "input" | "output" | "error" | "system";
  text: string;
}

const WELCOME = [
  "🏔  Dagestan Shell v1.0",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "Type naturally — the AI interprets your intent.",
  "Commands: help, status, models, clear, exit",
  "",
];

export function TerminalEmulator() {
  const [lines, setLines] = useState<TerminalLine[]>(
    WELCOME.map((t) => ({ type: "system", text: t }))
  );
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const processCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    setHistory((h) => [...h, trimmed]);
    setHistIdx(-1);
    setLines((prev) => [...prev, { type: "input", text: `$ ${trimmed}` }]);

    const lower = trimmed.toLowerCase();

    if (lower === "clear") {
      setLines([]);
      return;
    }

    if (lower === "help") {
      setLines((prev) => [
        ...prev,
        { type: "system", text: "Available commands:" },
        { type: "output", text: "  help          — Show this help" },
        { type: "output", text: "  status        — Show system status" },
        { type: "output", text: "  models        — List available AI models" },
        { type: "output", text: "  processes     — Show running processes" },
        { type: "output", text: "  build <desc>  — Build an app from description" },
        { type: "output", text: "  install <pkg> — Install a package" },
        { type: "output", text: "  serve <port>  — Start a web server" },
        { type: "output", text: "  clear         — Clear terminal" },
        { type: "output", text: "  exit          — Exit shell" },
        { type: "output", text: "" },
        { type: "system", text: "Or just type naturally — the AI handles the rest." },
      ]);
      return;
    }

    if (lower === "status") {
      setLines((prev) => [
        ...prev,
        { type: "system", text: "System Status:" },
        { type: "output", text: "  🟢 Codex CLI        : Ready" },
        { type: "output", text: "  🟢 OpenClaw Gateway : Running on :18790" },
        { type: "output", text: "  🟢 OpenCodex Proxy  : Running on :10101" },
        { type: "output", text: "  🟡 Hermes Web UI    : Stopped" },
        { type: "output", text: "  🟢 Claude Code CLI  : In Debian container" },
        { type: "output", text: "  🟢 Cursor Agent     : In Debian container" },
        { type: "output", text: "  📡 Network          : Connected" },
        { type: "output", text: "  💾 Storage          : 2.1 GB / 8 GB used" },
      ]);
      return;
    }

    if (lower === "models") {
      setLines((prev) => [
        ...prev,
        { type: "system", text: "Available models (free):" },
        { type: "output", text: "  • deepseek-r1      (OpenCode Zen)  FREE" },
        { type: "output", text: "  • llama-3.3-70b    (OpenRouter)    FREE" },
        { type: "output", text: "  • mistral-large    (OpenRouter)    FREE" },
        { type: "output", text: "  • nemotron-70b     (NVIDIA NIM)    FREE" },
        { type: "output", text: "  • gemini-2.0-flash (OpenRouter)    FREE" },
        { type: "output", text: "  • qwen-2.5-72b     (OpenCode Zen)  FREE" },
      ]);
      return;
    }

    if (lower === "processes") {
      setLines((prev) => [
        ...prev,
        { type: "system", text: "Running processes:" },
        { type: "output", text: "  PID  NAME              PORT    STATUS" },
        { type: "output", text: "  ───  ────              ────    ──────" },
        { type: "output", text: "  001  codex-web-local   3000    ✅ running" },
        { type: "output", text: "  002  openclaw-gateway  18790   ✅ running" },
        { type: "output", text: "  003  opencodex-proxy   10101   ✅ running" },
        { type: "output", text: "  004  hermes-webui      8788    ⏹ stopped" },
        { type: "output", text: "  005  claude-code       ─       ✅ in container" },
        { type: "output", text: "  006  cursor-agent      ─       ✅ in container" },
      ]);
      return;
    }

    if (lower.startsWith("build ")) {
      const desc = trimmed.slice(6);
      setLines((prev) => [
        ...prev,
        { type: "system", text: `🔨 Building: "${desc}"` },
        { type: "output", text: "  → Analyzing requirements..." },
        { type: "output", text: "  → Generating code via Codex CLI..." },
        { type: "output", text: "  → Writing files to /root/www/app..." },
        { type: "output", text: "  → Starting server on port 8080..." },
        { type: "output", text: "" },
        { type: "system", text: "  ✅ Done! Open http://localhost:8080" },
      ]);
      return;
    }

    if (lower.startsWith("install ")) {
      const pkg = trimmed.slice(8);
      setLines((prev) => [
        ...prev,
        { type: "output", text: `📦 Installing ${pkg}...` },
        { type: "output", text: `  ✓ ${pkg} installed successfully` },
      ]);
      return;
    }

    if (lower.startsWith("serve ")) {
      const port = trimmed.slice(6);
      setLines((prev) => [
        ...prev,
        { type: "output", text: `🌐 Starting server on port ${port}...` },
        { type: "system", text: `  ✅ Server running at http://localhost:${port}` },
      ]);
      return;
    }

    if (lower === "exit") {
      setLines((prev) => [
        ...prev,
        { type: "system", text: "👋 Goodbye! Shell session ended." },
      ]);
      return;
    }

    // Default: treat as AI query
    setLines((prev) => [
      ...prev,
      { type: "output", text: `🧠 Processing: "${trimmed}"...` },
      { type: "output", text: "" },
      { type: "output", text: `I'll help you with "${trimmed}". This is a demonstration — in the full shell, the AI would interpret your natural language and execute the appropriate actions.` },
    ]);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      processCommand(input);
      setInput("");
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (histIdx < history.length - 1) {
        const newIdx = histIdx + 1;
        setHistIdx(newIdx);
        setInput(history[history.length - 1 - newIdx]!);
      }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx > 0) {
        const newIdx = histIdx - 1;
        setHistIdx(newIdx);
        setInput(history[history.length - 1 - newIdx]!);
      } else {
        setHistIdx(-1);
        setInput("");
      }
    }
  };

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl border border-border/70 bg-[#0a0e1a] font-mono text-sm"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-border/30 px-4 py-2">
        <span className="size-2.5 rounded-full bg-red-500/70" />
        <span className="size-2.5 rounded-full bg-yellow-500/70" />
        <span className="size-2.5 rounded-full bg-green-500/70" />
        <span className="ml-2 text-[11px] text-muted-foreground">dagestan@shell ~ $</span>
      </div>

      {/* Output */}
      <div ref={scrollRef} className="scrollbar-slim flex-1 overflow-y-auto px-4 py-3">
        {lines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
            className={`whitespace-pre-wrap ${
              line.type === "input"
                ? "text-cyan-400"
                : line.type === "error"
                  ? "text-red-400"
                  : line.type === "system"
                    ? "text-violet-400"
                    : "text-emerald-300/80"
            }`}
          >
            {line.text || "\u00A0"}
          </motion.div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-start gap-2 border-t border-border/30 px-4 py-2">
        <span className="mt-1 text-cyan-400">$</span>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Type a command or ask anything..."
          className="max-h-24 flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
          autoFocus
        />
      </div>
    </div>
  );
}
