import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RefreshCw, X, WifiOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OutboxItem } from "@/lib/outbox";

interface QueuedBadgeProps {
  item: OutboxItem;
  onRetry: (id: string) => void;
  onDrop: (id: string) => void;
}

/** Small badge rendered next to a queued/failed message bubble. Clicking
 *  expands it to show the error and the retry/dismiss controls. */
export function QueuedBadge({ item, onRetry, onDrop }: QueuedBadgeProps) {
  const [open, setOpen] = useState(false);

  const isPending = item.state === "pending" || item.state === "sending";
  const isFailed = item.state === "failed";

  return (
    <div className="mt-1 inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
          isPending && "border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          isFailed && "border-rose-400/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
        )}
        aria-expanded={open}
      >
        {isPending ? (
          <>
            {item.state === "sending" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <WifiOff className="size-3" />
            )}
            <span>
              {item.state === "sending" ? "Sending…" : `Queued (attempt ${item.attempts + 1})`}
            </span>
          </>
        ) : (
          <>
            <Send className="size-3" />
            <span>Failed after {item.attempts} attempts</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-md rounded-lg border border-border/60 bg-card/80 p-3 text-xs"
          >
            {item.lastError && (
              <p className="mb-2 font-mono text-[10px] text-muted-foreground">
                {item.lastError}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              {isFailed && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-[11px]"
                  onClick={() => onRetry(item.id)}
                >
                  <RefreshCw className="size-3" /> Retry
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
                onClick={() => onDrop(item.id)}
              >
                <X className="size-3" /> Dismiss
              </Button>
              <span className="ml-auto text-[10px] text-muted-foreground">
                Created {new Date(item.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
