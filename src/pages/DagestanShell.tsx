import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal,
  Hammer,
  LayoutDashboard,
  Cpu,
  Zap,
  Globe,
  HardDrive,
  Wifi,
  Server,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { TerminalEmulator } from "@/components/shell/TerminalEmulator";
import { OrbHUD } from "@/components/shell/OrbHUD";
import { AppForge } from "@/components/shell/AppForge";
import * as db from "@/lib/db";

type Panel = "terminal" | "forge" | "dashboard" | "processes";

interface ServiceStatus {
  name: string;
  icon: React.ReactNode;
  port: number;
  status: "running" | "stopped" | "checking";
}

import { getDroid } from "@/lib/bridge";

const SERVICE_DEFS = [
  { name: "Codex CLI", port: 3000, icon: <Terminal className="size-4" /> },
  { name: "OpenClaw Gateway", port: 18790, icon: <Globe className="size-4" /> },
  { name: "OpenCodex Proxy", port: 10101, icon: <Server className="size-4" /> },
  { name: "Hermes Web UI", port: 8788, icon: <LayoutDashboard className="size-4" /> },
];

const QUICK_ACTIONS = [
  { label: "Update packages", cmd: "apk update && apk upgrade 2>/dev/null || apt-get update -qq" },
  { label: "Install nodejs", cmd: "command -v node || apk add nodejs npm 2>/dev/null || apt-get install -y nodejs npm" },
  { label: "System info", cmd: "uname -a && df -h" },
  { label: "Network scan", cmd: "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo 'no tool available'" },
];

function useServiceStatuses(): ServiceStatus[] {
  const [statuses, setStatuses] = useState<ServiceStatus[]>(
    SERVICE_DEFS.map((s) => ({ ...s, status: "checking" }))
  );

  const poll = useCallback(() => {
    const droid = getDroid();
    if (!droid) {
      setStatuses(SERVICE_DEFS.map((s) => ({ ...s, status: "stopped" })));
      return;
    }
    const next = SERVICE_DEFS.map((s) => {
      try {
        const raw = droid.run(`lsof -ti:${s.port} 2>/dev/null | head -1 || echo ''`);
        return { ...s, status: (raw.trim() ? "running" : "stopped") as "running" | "stopped" };
      } catch {
        return { ...s, status: "stopped" as const };
      }
    });
    setStatuses(next);
  }, []);

  // Same polling pattern as OrbHUD — see comment there.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = setInterval(poll, 8_000);
    return () => clearInterval(t);
  }, [poll]);

  return statuses;
}

export default function DagestanShell() {
  const [activePanel, setActivePanel] = useState<Panel>("terminal");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const services = useServiceStatuses();

  const devices = db.listDevices();
  const onlineCount = devices.filter((d) => d.online).length;
  const runningCount = services.filter((s) => s.status === "running").length;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      {/* Sidebar toggle for mobile */}
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-2 top-2 z-10 rounded-lg border border-border/70 bg-card/90 p-1.5 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground lg:hidden"
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
      </button>

      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ opacity: 0, x: -20, width: 0 }}
            animate={{ opacity: 1, x: 0, width: "auto" }}
            exit={{ opacity: 0, x: -20, width: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex w-full shrink-0 flex-row gap-2 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-x-hidden"
          >
            {/* System stats */}
            <div className="min-w-[200px] flex-1 rounded-xl border border-border/70 bg-card/60 p-3 lg:min-w-0 lg:flex-none">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="size-3.5 text-cyan-400" />
                <span className="text-xs font-semibold">System</span>
              </div>
              <div className="space-y-2">
                <MiniStat icon={<Cpu className="size-3" />} label="CPU" value="—" />
                <MiniStat icon={<HardDrive className="size-3" />} label="RAM" value="—" />
                <MiniStat icon={<Wifi className="size-3" />} label="Net" value="Online" />
                <MiniStat icon={<Server className="size-3" />} label="Devices" value={`${onlineCount} online`} />
              </div>
            </div>

            {/* Services */}
            <div className="min-w-[200px] flex-1 rounded-xl border border-border/70 bg-card/60 p-3 lg:min-w-0 lg:flex-none">
              <div className="mb-3 flex items-center gap-2">
                <Server className="size-3.5 text-violet-400" />
                <span className="text-xs font-semibold">Services</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{runningCount}/{services.length}</span>
              </div>
              <div className="space-y-1.5">
                {services.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px]"
                  >
                    <span className={s.status === "running" ? "text-emerald-400" : s.status === "checking" ? "text-amber-400" : "text-muted-foreground/50"}>
                      {s.status === "running" ? "●" : s.status === "checking" ? "◌" : "○"}
                    </span>
                    <span className="text-muted-foreground">{s.name}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">:{s.port}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div className="min-w-[200px] flex-1 rounded-xl border border-border/70 bg-card/60 p-3 lg:min-w-0 lg:flex-none">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="size-3.5 text-amber-400" />
                <span className="text-xs font-semibold">Quick Actions</span>
              </div>
              <div className="space-y-1">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => setActivePanel("terminal")}
                    className="w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main area */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Panel tabs */}
        <div className="mb-3 flex gap-1 overflow-x-auto">
          {([
            { id: "terminal" as Panel, icon: <Terminal className="size-3.5" />, label: "Shell" },
            { id: "forge" as Panel, icon: <Hammer className="size-3.5" />, label: "App Forge" },
            { id: "dashboard" as Panel, icon: <LayoutDashboard className="size-3.5" />, label: "Dashboard" },
            { id: "processes" as Panel, icon: <Cpu className="size-3.5" />, label: "Processes" },
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActivePanel(tab.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shrink-0 ${
                activePanel === tab.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Panel content */}
        <div className="min-h-0 flex-1">
          {activePanel === "terminal" && (
            <div className="h-full min-h-[400px]">
              <TerminalEmulator />
            </div>
          )}
          {activePanel === "forge" && <AppForge />}
          {activePanel === "dashboard" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <div key={s.name} className="rounded-xl border border-border/70 bg-card/60 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    {s.icon}
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      s.status === "running"
                        ? "bg-emerald-400/10 text-emerald-400"
                        : s.status === "checking"
                          ? "bg-amber-400/10 text-amber-400"
                          : "bg-muted text-muted-foreground"
                    }`}>
                      {s.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Port {s.port} · localhost
                  </p>
                </div>
              ))}
            </div>
          )}
          {activePanel === "processes" && (
            <div className="rounded-xl border border-border/70 bg-[#0a0e1a] p-4 font-mono text-xs">
              <div className="mb-2 text-[11px] text-muted-foreground">NAME                  PORT    STATUS</div>
              <div className="mb-1 text-[11px] text-muted-foreground/40">────                  ────    ──────</div>
              {services.map((s) => (
                <div
                  key={s.name}
                  className={`py-0.5 ${s.status === "running" ? "text-emerald-300/80" : "text-muted-foreground/50"}`}
                >
                  {s.name.padEnd(22)}:{String(s.port).padEnd(8)}{s.status === "running" ? "✅ RUNNING" : "⏹ STOPPED"}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Orb HUD */}
      <OrbHUD />
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground/60">{icon}</span>
      <span className="w-12 text-[10px] text-muted-foreground">{label}</span>
      <span className="flex-1 text-right text-[10px] font-medium text-foreground">{value}</span>
    </div>
  );
}
