import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const REACTIONS = ["👍", "🔥", "💡", "❌", "❤️", "🎉", "🤔", "👀"];

interface EmojiReactionsProps {
  messageId: string;
  reactions?: Record<string, { count: number; reacted: boolean }>;
  onReact?: (emoji: string) => void;
}

export function EmojiReactions({ reactions = {}, onReact }: EmojiReactionsProps) {
  const [showPicker, setShowPicker] = useState(false);

  const handleReact = useCallback(
    (emoji: string) => {
      onReact?.(emoji);
      setShowPicker(false);
    },
    [onReact],
  );

  const activeReactions = Object.entries(reactions)
    .filter(([, r]) => r.count > 0)
    .map(([emoji, r]) => ({ emoji, ...r }));

  return (
    <div className="relative">
      {/* Active reactions */}
      {activeReactions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeReactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => handleReact(r.emoji)}
              className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors ${
                r.reacted
                  ? "border-primary/50 bg-primary/10"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <span>{r.emoji}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{r.count}</span>
            </button>
          ))}
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex size-5 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground hover:border-primary/30 hover:text-foreground"
          >
            +
          </button>
        </div>
      )}

      {/* Reaction picker */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 5 }}
            className="absolute bottom-full left-0 z-50 mb-1 flex gap-0.5 rounded-lg border border-border bg-card p-1 shadow-lg"
          >
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                className="flex size-7 items-center justify-center rounded-md text-sm transition-colors hover:bg-accent"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
