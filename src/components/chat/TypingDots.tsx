import { motion } from "framer-motion";

const DOTS = [0, 1, 2];

/** Animated thinking indicator shown while waiting / streaming. */
export function TypingDots({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex items-end gap-1">
        {DOTS.map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-primary"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </span>
      {label && <span>{label}</span>}
    </span>
  );
}

/** Soft pulsing orb used as the assistant avatar while streaming. */
export function PulseOrb() {
  return (
    <span className="relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-500">
      <motion.span
        className="absolute inset-0 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500"
        animate={{ opacity: [0.35, 0.7, 0.35], scale: [1, 1.18, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="relative size-2 rounded-full bg-white" />
    </span>
  );
}
