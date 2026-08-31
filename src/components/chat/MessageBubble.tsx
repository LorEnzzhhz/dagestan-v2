import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Markdown } from "./Markdown";
import { PulseOrb } from "./TypingDots";
import { siteIconUrl, type Source } from "@/lib/site-icons";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Pencil,
  RefreshCw,
  Volume2,
  VolumeX,
  Brain,
} from "lucide-react";
import { EmojiReactions } from "@/components/features/EmojiReactions";
import { Button } from "@/components/ui/button";

/** Parse  blocks from content. Returns { thinking, content } */
function parseThinkingBlocks(text: string): { thinking: string; content: string } {
  const match = text.match(/^<thinking>([\s\S]*?)<\/thinking>\s*/);
  if (!match) return { thinking: "", content: text };
  return {
    thinking: match[1].trim(),
    content: text.slice(match[0].length).trim(),
  };
}

/** Collapsible thinking block UI */
function ThinkingBlock({ content, defaultOpen = false }: { content: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content) return null;
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-indigo-400/20 bg-indigo-400/5 px-2.5 py-1.5 text-[11px] font-medium text-indigo-400 transition-colors hover:bg-indigo-400/10"
      >
        <Brain className="size-3.5" />
        <span>Reasoning</span>
        {open ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
        <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 rounded-lg border border-indigo-400/10 bg-indigo-400/5 px-3 py-2">
              <div className="scrollbar-slim max-h-64 overflow-auto text-[12px] leading-relaxed text-indigo-300/80">
                <Markdown>{content}</Markdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SourceChips({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5">
        {sources.slice(0, 6).map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <img
              src={siteIconUrl(s.url)}
              alt=""
              className="size-3.5 rounded-sm"
              onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
            />
            <span className="truncate">{s.title}</span>
          </a>
        ))}
        {sources.length > 6 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {open ? "less" : `+${sources.length - 6} more`}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-1.5">
          {sources.slice(6).map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="size-3 shrink-0" />
              <span className="truncate">{s.title}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export interface ChatMessageView {
  _id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider?: string | null;
  model?: string | null;
  createdAt?: number;
}

/** Short timestamp: clock time today, otherwise "Mon 9". */
function fmtTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const TOOL_PREFIX = "TOOL RESULT";

export function MessageBubble({
  message,
  streaming = false,
  sources,
  editable = false,
  onEditSubmit,
  onRegenerate,
}: {
  message: ChatMessageView;
  streaming?: boolean;
  sources?: Source[] | null;
  /** User messages only: offer edit-and-resubmit. */
  editable?: boolean;
  onEditSubmit?: (content: string) => void;
  /** Assistant messages only: offer regenerate (last reply). */
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // stop any ongoing speech when this message unmounts / chat switches
  // (must run before any early return — hooks can't be conditional)
  useEffect(
    () => () => {
      try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    },
    [],
  );

  // All hooks above this line — early returns below must NOT be conditional
  // on hook state (react-hooks/rules-of-hooks).
  const isUser = message.role === "user";

  // Parse thinking blocks from assistant messages.
  // useMemo must come before any conditional return.
  const { thinking, content: mainContent } = useMemo(() => {
    if (isUser) return { thinking: "", content: message.content };
    return parseThinkingBlocks(message.content);
  }, [isUser, message.content]);

  // Silent tool results render as a collapsed chip, not a bubble.
  // Delegated to a separate component so this function can keep all hooks
  // unconditional (react-hooks/rules-of-hooks).
  if (isUser && message.content.startsWith(TOOL_PREFIX)) {
    return <SilentToolResult content={message.content} />;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  /** Read this message aloud with the browser's TTS engine. */
  const toggleSpeak = () => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const plain = message.content
      .replace(/```[\s\S]*?```/g, " … code block omitted … ")
      .replace(/[*_#>`~[\]()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) return;
    const u = new SpeechSynthesisUtterance(plain.slice(0, 4000));
    u.rate = 1.02;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };

  const startEdit = () => {
    setDraft(message.content);
    setEditing(true);
  };

  const saveEdit = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== message.content) onEditSubmit?.(t);
  };

  const stamp = fmtTime(message.createdAt);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("mx-auto flex w-full max-w-3xl gap-3", isUser && "justify-end")}
    >
      {!isUser && <PulseOrb />}
      <div className={cn("group relative min-w-0", isUser ? "max-w-[85%]" : "flex-1")}>
        {isUser ? (
          editing ? (
            <div className="rounded-2xl border border-primary/50 bg-card p-2 shadow-sm">
              <textarea
                autoFocus
                value={draft}
                rows={Math.min(8, draft.split("\n").length + 1)}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditing(false);
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    saveEdit();
                  }
                }}
                className="scrollbar-slim max-h-48 w-full resize-none bg-transparent px-2 py-1 text-sm leading-relaxed outline-none"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="px-2 text-[10px] text-muted-foreground">
                  ⌘/Ctrl+Enter to resubmit · Esc to cancel
                </span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-7 px-2.5 text-xs" disabled={!draft.trim()} onClick={saveEdit}>
                    Save &amp; resubmit
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
              <div className="mt-0.5 flex items-center justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={copy}
                  className="flex items-center gap-1 rounded p-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                {editable && onEditSubmit && (
                  <button
                    type="button"
                    onClick={startEdit}
                    title="Edit and get a fresh answer"
                    className="flex items-center gap-1 rounded p-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-3" />
                    Edit
                  </button>
                )}
                {stamp && (
                  <span className="text-[10px] text-muted-foreground/50" title={new Date(message.createdAt ?? 0).toLocaleString()}>
                    · {stamp}
                  </span>
                )}
              </div>
            </>
          )
        ) : (
          <div className="rounded-2xl rounded-bl-md border border-border/70 bg-card/80 px-4 py-3">
            {thinking && <ThinkingBlock content={thinking} />}
            <Markdown>{mainContent || message.content}</Markdown>
            {streaming && (
              <span className="caret-blink ml-0.5 inline-block h-4 w-[2px] bg-primary align-middle" />
            )}
            {sources && sources.length > 0 && <SourceChips sources={sources} />}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              {"speechSynthesis" in window && (
                <button
                  type="button"
                  onClick={toggleSpeak}
                  className={cn(
                    "flex items-center gap-1 rounded p-1 text-[10px] transition-colors",
                    speaking ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {speaking ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
                  {speaking ? "Stop" : "Listen"}
                </button>
              )}
              <button
                type="button"
                onClick={copy}
                className="flex items-center gap-1 rounded p-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
              {onRegenerate && !streaming && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  title="Ask again for a different answer"
                  className="flex items-center gap-1 rounded p-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="size-3" />
                  Retry
                </button>
              )}
              {stamp && (
                <span className="text-[10px] text-muted-foreground/50" title={new Date(message.createdAt ?? 0).toLocaleString()}>
                  · {stamp}
                </span>
              )}
              {message.model && (
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  {message.model}
                </span>
              )}
              <EmojiReactions messageId={message._id ?? "msg"} />
              <EmojiReactions messageId={message._id ?? "msg"} />
              <span className="font-mono text-[10px] text-muted-foreground/40" title="Estimated tokens">
                ~{Math.ceil(message.content.length / 4).toLocaleString()} tok
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Collapsed chip for silent tool results — extracted so MessageBubble can keep
 *  its hooks unconditional. */
function SilentToolResult({ content }: { content: string }) {
  return (
    <motion.details
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="group mx-auto w-full max-w-3xl rounded-lg border border-border/70 bg-secondary/40 px-3 py-1.5 text-[11px] text-muted-foreground"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5">
        <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
        <span className="font-mono">⚡ tool executed silently — tap to view output</span>
      </summary>
      <pre className="scrollbar-slim mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
        {content}
      </pre>
    </motion.details>
  );
}
