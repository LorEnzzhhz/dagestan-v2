import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Download, Loader2 } from "lucide-react";
import { SKILLS, useSkills } from "@/hooks/use-skills";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useChatManager } from "@/hooks/use-chat-manager";
import { useOutbox } from "@/hooks/use-outbox";
import { isTransientError, enqueue as outboxEnqueue } from "@/lib/outbox";
import { QueuedBadge } from "@/components/chat/QueuedBadge";
import { SmartModelPicker } from "@/components/chat/SmartModelPicker";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { TypingDots } from "@/components/chat/TypingDots";
import type { Source } from "@/lib/site-icons";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Brain,
  Menu,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  SendHorizontal,
  Square,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Minimal shape of the browser SpeechRecognition API we use. */
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

const SUGGESTIONS = [
  "Solve ∫ x²·eˣ dx step by step",
  "Search YouTube and GitHub for the best open-source AI agents this year",
  "Write a 300-word cyberpunk story about a lighthouse keeper",
  "On my device: update packages and install htop, then run htop --version",
];

const CODING_CHIPS = [
  { label: "🚀 Landing page app", prompt: "Build a beautiful one-page website in /root/www/landing with modern CSS, serve it detached, verify it headlessly, then give me the URL." },
  { label: "🐍 Python script", prompt: "On my device: write a useful Python CLI tool in /root/src, install any needed packages, run it and show me its real output." },
  { label: "🧪 Test a webpage", prompt: "Install chromium if needed, then headlessly test http://localhost:8080 — dump the DOM and report what renders." },
  { label: "🛠 Setup build tools", prompt: "Update packages on my device and install python3, nodejs and build tools. Verify each with a version check." },
];

export default function ChatPage() {
  const { chatId: urlChatId } = useParams<{ chatId: string }>();
  const chatId = urlChatId ?? undefined;

  // ─── Extracted hooks: all streaming + chat CRUD logic lives here ───
  const {
    phase,
    selection,
    setSelection,
    streamText,
    thinkingMode,
    setThinkingMode,
    error,
    sources,
    messages,
    setMessages,
    busy,
    onlineDevice,
    droid,
    runConversation,
    stop,
    beginTurn,
    finishTurn,
    guardTurn,
    navigate,
  } = useChatStream(chatId);

  const {
    chats,
    refreshChats,
    deleteChat,
    togglePin,
    renameChat,
    setChatModel,  } = useChatManager(chatId);

  const { items: queued, retry: retryQueued, drop: dropQueued } = useOutbox(chatId);

  const { enabled: enabledSkills, toggle: toggleSkill } = useSkills();
  // Memoize so the downstream useCallback deps don't change on every render.
  const visible = useMemo(() => messages ?? [], [messages]);

  // ─── Local UI state (voice, composer, scroll) ─────────────────────
  const [input, setInput] = useState("");
  const [showJump, setShowJump] = useState(false);
  const [listening, setListening] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recogRef = useRef<SpeechRec | null>(null);

  // stop any in-flight voice recognition when leaving the page
  useEffect(
    () => () => {
      try { recogRef.current?.stop(); } catch { /* gone */ }
    },
    [],
  );

  // Stick to the newest token only while the user is already near the bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 260;
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages?.length, streamText, phase]);

  // ─── Actions ──────────────────────────────────────────────────────

  const doSend = useCallback(
    async (rawInput: string) => {
      const text = rawInput.trim();
      if (!text || busy) return;
      beginTurn();
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      let cid = chatId;
      if (!cid) {
        cid = (await import("@/lib/db")).createChat(
          "New chat",
          String(selection.provider),
          selection.model,
        );
        navigate(`/chat/${cid}`, { replace: true });
      }
      try {
        (await import("@/lib/db")).addMessage(cid, "user", text);
        setMessages((await import("@/lib/db")).listMessages(cid));
        await runConversation(cid);
      } catch (err) {
        guardTurn(err);
        // On transient network failure, queue the message so it retries
        // automatically when the network comes back.
        if (isTransientError(err) && cid) {
          try {
            await outboxEnqueue({
              chatId: cid,
              text,
              provider: String(selection.provider),
              model: selection.model,
            });
          } catch {
            /* outbox unavailable — message already in db, just stays un-answered */
          }
        }
      } finally {
        finishTurn();
      }
    },
    [busy, chatId, selection, navigate, beginTurn, runConversation, guardTurn, finishTurn, setMessages],
  );

  const regenerate = useCallback(async () => {
    if (busy || !chatId || !visible.length) return;
    let anchorId: string | null = null;
    for (let i = visible.length - 1; i >= 0; i--) {
      const m = visible[i];
      if (m.role === "user" && !m.content.startsWith("TOOL RESULT")) {
        anchorId = m._id;
        break;
      }
    }
    if (!anchorId) return;
    beginTurn();
    try {
      const db = await import("@/lib/db");
      db.truncateAfter(chatId, anchorId);
      setMessages(db.listMessages(chatId));
      await runConversation(chatId);
    } catch (err) {
      guardTurn(err);
    } finally {
      finishTurn();
    }
  }, [busy, chatId, visible, beginTurn, runConversation, guardTurn, finishTurn, setMessages]);

  const submitEdit = useCallback(
    async (messageId: string, content: string) => {
      if (busy || !chatId) return;
      beginTurn();
      try {
        const db = await import("@/lib/db");
        db.editMessage(messageId, content);
        db.truncateAfter(chatId, messageId);
        setMessages(db.listMessages(chatId));
        await runConversation(chatId);
      } catch (err) {
        guardTurn(err);
      } finally {
        finishTurn();
      }
    },
    [busy, chatId, beginTurn, runConversation, guardTurn, finishTurn, setMessages],
  );

  const newChat = useCallback(() => {
    stop();
    navigate("/chat");
  }, [stop, navigate]);

  const removeChat = useCallback(
    (id: string) => {
      deleteChat(id);
      refreshChats();
    },
    [deleteChat, refreshChats],
  );

  const jumpToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  // ─── Voice input ──────────────────────────────────────────────────
  const startVoice = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const r = new SR();
      r.lang = navigator.language || "en-US";
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (e) => {
        let t = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          t += e.results[i][0]?.transcript ?? "";
        }
        if (t) setInput((prev) => (prev ? prev.trimEnd() + " " : "") + t);
      };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      recogRef.current = r;
      setListening(true);
      r.start();
    } catch {
      setListening(false);
    }
  }, []);

  // ─── Export ────────────────────────────────────────────────────────
  const exportChat = useCallback(() => {
    if (!visible.length) return;
    const parts = visible.map((m) => {
      if (m.role === "user")
        return m.content.startsWith("TOOL RESULT")
          ? `> ${m.content.split("\n")[0]}`
          : `**🧑 You:**\n\n${m.content}`;
      return `**✦ Assistant${m.model ? ` · ${m.model}` : ""}:**\n\n${m.content}`;
    });
    const blob = new Blob(
      [`# Dagestan export — ${new Date().toLocaleString()}\n\n${parts.join("\n\n---\n\n")}\n`],
      { type: "text/markdown" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dagestan-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [visible]);

  // ─── Global keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        newChat();
        return;
      }
      if (e.key === "Escape" && (phase === "streaming" || phase === "running")) {
        stop();
        return;
      }
      if (e.key === "/" && !mod && !e.altKey && !e.shiftKey) {
        const t = document.activeElement;
        if (t?.tagName !== "TEXTAREA" && t?.tagName !== "INPUT") {
          e.preventDefault();
          textareaRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ─── Derived ───────────────────────────────────────────────────────
  const changeModelFn = useCallback(
    (provider: string, model: string) => {
      setSelection({ provider, model });
      if (chatId) setChatModel(chatId, provider, model);
    },

    [chatId, setChatModel, setSelection],
  );

  const sidebar = (
    <ChatSidebar
      chats={chats}
      activeId={chatId}
      onNew={newChat}
      onSelect={(id) => navigate(`/chat/${id}`)}
      onDelete={removeChat}
      onPin={(id) => { togglePin(id); refreshChats(); }}
      onRename={(id, title) => { renameChat(id, title); refreshChats(); }}
    />
  );

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1">
      {/* Desktop collapsible sidebar */}
      {sidebarOpen && (
        <aside className="hidden w-64 shrink-0 rounded-xl border border-border/70 bg-sidebar/60 lg:block">
          {sidebar}
        </aside>
      )}

      <section className="flex min-w-0 flex-1 flex-col lg:pl-4">
        {/* Toolbar */}
        <div className="flex items-center gap-2 pb-2">
          {/* Mobile sidebar toggle */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="size-8 lg:hidden">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Conversations</SheetTitle>
              {sidebar}
            </SheetContent>
          </Sheet>

          {/* Desktop sidebar toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 hidden lg:flex"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </Button>

          <SmartModelPicker
            currentProvider={selection.provider}
            currentModel={selection.model}
            onSelect={changeModelFn}
            preferFree
          />

          <div className="flex items-center gap-1">
            {/* Reasoning/thinking mode toggle */}
            <button
              type="button"
              title={thinkingMode ? "Thinking mode ON — AI shows reasoning" : "Thinking mode OFF — normal responses"}
              onClick={() => setThinkingMode(!thinkingMode)}
              className={`flex size-8 items-center justify-center rounded-lg border transition-colors ${
                thinkingMode
                  ? "border-indigo-400/50 bg-indigo-400/15 text-indigo-400"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Brain className="size-4" />
            </button>
            {SKILLS.map((s) => {
              const on = enabledSkills.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  title={`${s.name} — ${s.tagline} (${on ? "on" : "off"})`}
                  aria-label={`${s.name} — ${s.tagline}`}
                  onClick={() => toggleSkill(s.id)}
                  className={`flex size-8 items-center justify-center rounded-lg border transition-colors ${
                    on
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <s.icon className="size-4" />
                </button>
              );
            })}
          </div>

          {/* Live phase pill */}
          <AnimatePresence>
            {busy && (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.18 }}
                className="hidden items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary sm:flex"
              >
                <Loader2 className="size-3 animate-spin" />
                {phase === "searching"
                  ? "searching web"
                  : phase === "running"
                    ? "executing silently"
                    : "thinking…"}
              </motion.span>
            )}
          </AnimatePresence>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            title="Export chat as Markdown"
            disabled={!visible.length}
            onClick={exportChat}
          >
            <Download className="size-4" />
          </Button>

          {onlineDevice && (
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 sm:flex dark:text-emerald-300">
              <Zap className="size-3" /> {onlineDevice.name}
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 320);
            }}
            className="scrollbar-slim h-full space-y-4 overflow-y-auto rounded-xl border border-border/60 bg-card/30 px-3 py-4"
          >
            {visible.length === 0 && phase === "idle" ? (
              <Welcome onPick={doSend} />
            ) : (
              <>
                {visible.map((m, i) => {
                  const lastAssistant =
                    m.role === "assistant" &&
                    !visible.slice(i + 1).some((x) => x.role === "assistant");
                  return (
                    <MessageBubble
                      key={m._id}
                      message={m}
                      editable={
                        m.role === "user" &&
                        !m.content.startsWith("TOOL RESULT") &&
                        !busy
                      }
                      onEditSubmit={(content) => m._id && submitEdit(m._id, content)}
                      onRegenerate={lastAssistant && !busy ? regenerate : undefined}
                    />
                  );
                })}
                {phase === "streaming" && (
                  <MessageBubble
                    message={{ role: "assistant", content: streamText }}
                    streaming
                    sources={sources as Source[] | null}
                  />
                )}
                {(phase === "searching" || phase === "running") && (
                  <div className="mx-auto max-w-3xl pl-10">
                    <TypingDots
                      label={
                        phase === "searching"
                          ? "searching the live web…"
                          : "running silently on your device…"
                      }
                    />
                  </div>
                )}
                {queued.length > 0 && (
                  <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-2 px-4 pb-3">
                    {queued.map((q) => (
                      <QueuedBadge
                        key={q.id}
                        item={q}
                        onRetry={retryQueued}
                        onDrop={dropQueued}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Jump to latest */}
          <AnimatePresence>
            {showJump && (
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 12, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.9 }}
                whileTap={{ scale: 0.92 }}
                onClick={jumpToBottom}
                className="absolute bottom-3 right-4 flex size-9 items-center justify-center rounded-full border border-border/70 bg-card/95 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:border-primary/50 hover:text-primary"
                aria-label="Scroll to latest message"
              >
                <ArrowDown className="size-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {error && (
          <p className="shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {/* Coding quick-actions */}
        {(droid || onlineDevice) && !busy && (
          <div className="scrollbar-slim mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5">
            {CODING_CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => doSend(c.prompt)}
                className="shrink-0 rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Composer */}
        <div className="mt-2 rounded-2xl border border-border/80 bg-card p-2 transition-colors focus-within:border-primary/50">
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            aria-label="Chat message input"
            placeholder={
              droid || onlineDevice
                ? "Ask anything — I can also run commands on your device…"
                : "Ask anything…"
            }
            className="max-h-40 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                doSend(input);
              }
            }}
          />
          <div className="flex items-center justify-between px-1">
            <span className="truncate text-[10px] text-muted-foreground">
              {droid
                ? "⚡ Embedded root Linux — silent execution"
                : onlineDevice
                  ? `⚡ ${onlineDevice.name} ready — silent /bin/bash execution`
                  : "Connect a root device in Skills for silent commands"}
            </span>
            <div className="flex items-center gap-1.5">
              {"webkitSpeechRecognition" in window || "SpeechRecognition" in window ? (
                <Button
                  size="icon"
                  variant="ghost"
                  title="Voice input"
                  className={cn(
                    "size-8 rounded-full",
                    listening && "animate-pulse bg-destructive/15 text-destructive",
                  )}
                  onClick={() => {
                    if (listening) {
                      try { recogRef.current?.stop(); } catch { /* gone */ }
                      setListening(false);
                    } else {
                      startVoice();
                    }
                  }}
                >
                  <Mic className="size-4" />
                </Button>
              ) : null}
              {busy ? (
                <Button
                  size="icon"
                  variant="destructive"
                  className="size-8 rounded-full"
                  onClick={stop}
                >
                  <Square className="size-3.5" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="size-8 rounded-full"
                  disabled={!input.trim()}
                  onClick={() => doSend(input)}
                >
                  <SendHorizontal className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4 text-center">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className="relative"
      >
        <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-br from-cyan-500/30 to-violet-500/30 blur-xl" />
        <div className="relative flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-500 text-2xl shadow-lg shadow-cyan-500/20">
          ✦
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.35 }}
      >
        <h1 className="bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
          What should we get into?
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Free models from OpenCode Zen, OpenRouter and NVIDIA — with live
          search, math, writing, and a silent root-Linux agent when your device
          is connected.
        </p>
      </motion.div>

      <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s}
            type="button"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.07, duration: 0.32, ease: "easeOut" }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onPick(s)}
            className="rounded-xl border border-border/80 bg-card/60 px-4 py-3 text-left text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {s}
          </motion.button>
        ))}
      </div>
    </div>
  );
}