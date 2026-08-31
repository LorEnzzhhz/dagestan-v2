import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router";
import { MessageSquare, Cpu, Wifi, HardDrive, Activity, X, ChevronDown, Zap } from "lucide-react";

import { getDroid } from "@/lib/bridge";

interface SystemStatus {
  cpu: string;
  mem: string;
  disk: string;
  network: string;
  services: string;
  uptime: string;
}

function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus>({
    cpu: "—", mem: "—", disk: "—", network: "—", services: "—", uptime: "—",
  });

  const refresh = useCallback(() => {
    const droid = getDroid();
    if (!droid) return;
    try {
      const cpu = droid.run("top -bn1 | head -5 | grep 'Cpu' | awk '{print $2}' || echo '—'");
      const mem = droid.run("free -m | awk '/Mem/{printf \"%d%%\", $3/$2*100}' 2>/dev/null || echo '—'");
      const disk = droid.run("df -h / | awk 'NR==2{print $5}' 2>/dev/null || echo '—'");
      const net = droid.run("ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' | head -1 || echo 'offline'");
      const svcs = droid.run(
        "count=0; for p in 3000 10101 8788 18790; do curl -s -o /dev/null -w '' http://localhost:$p 2>/dev/null && count=$((count+1)); done; echo \"$count/4\"",
      );
      const up = droid.run("uptime -p 2>/dev/null || uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}'");
      setStatus({
        cpu: cpu.trim() || "—",
        mem: mem.trim() || "—",
        disk: disk.trim() || "—",
        network: net.trim() || "—",
        services: svcs.trim() || "0/4",
        uptime: up.trim() || "—",
      });
    } catch {
      // not on device
    }
  }, []);

  // Polling pattern: kick off on mount, then every 15s. The kickoff's
  // synchronous setState is required by the polling pattern; the rule still
  // flags it, so we disable inline.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  return status;
}

// -------------------------------------------------------------------
// OrbHUD component — floating pill in bottom-right
// -------------------------------------------------------------------
export function OrbHUD() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const status = useSystemStatus();
  const hasDroid = Boolean(getDroid());

  // Keyboard shortcut: Ctrl+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setExpanded((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="fixed bottom-20 right-4 z-50 sm:bottom-6 sm:right-6">
      <AnimatePresence mode="wait">
        {expanded ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-72 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl shadow-black/30"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="relative flex size-3">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex size-3 rounded-full bg-cyan-500" />
                </span>
                <span className="text-sm font-semibold">System Status</span>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Status grid */}
            <div className="grid grid-cols-2 gap-px bg-border/30">
              <StatusCell icon={<Cpu className="size-3.5" />} label="CPU" value={status.cpu} />
              <StatusCell icon={<Activity className="size-3.5" />} label="Memory" value={status.mem} />
              <StatusCell icon={<HardDrive className="size-3.5" />} label="Disk" value={status.disk} />
              <StatusCell icon={<Wifi className="size-3.5" />} label="Network" value={status.network} />
              <StatusCell icon={<Zap className="size-3.5" />} label="Services" value={status.services} />
              <StatusCell icon={<ChevronDown className="size-3.5" />} label="Uptime" value={status.uptime} />
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 border-t border-border/50 p-3">
              <button
                type="button"
                onClick={() => { setExpanded(false); navigate("/chat"); }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/30"
              >
                <MessageSquare className="size-3.5" />
                Ask AI
              </button>
              <button
                type="button"
                onClick={() => { setExpanded(false); navigate("/dashboard"); }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
              >
                Dashboard
              </button>
            </div>

            {!hasDroid && (
              <div className="border-t border-border/50 px-4 py-2 text-center text-[10px] text-muted-foreground">
                Live data available on Dagestan Android
              </div>
            )}
          </motion.div>
        ) : (
          <motion.button
            key="orb"
            type="button"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setExpanded(true)}
            className="group relative flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-600 shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-cyan-500/50"
            aria-label="System orb"
          >
            {/* Pulse rings */}
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-20" />
            <span className="absolute inline-flex size-12 animate-pulse rounded-full bg-cyan-300 opacity-10" />

            {/* Orb icon */}
            <span className="relative text-lg font-bold text-white drop-shadow-md">
              ◉
            </span>

            {/* Status dot */}
            {hasDroid && (
              <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-background bg-emerald-400" />
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 bg-card px-3 py-2.5">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-semibold">{value}</p>
      </div>
    </div>
  );
}
