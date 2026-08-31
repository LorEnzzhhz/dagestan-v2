import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  Globe,
  Hammer,
  Compass,
  ExternalLink,
  Play,
  Square,
  RefreshCw,
  Loader2,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

// -----------------------------------------------------------------------------
// Service registry — each entry points to the control port of our
// scripts/services/runner.mjs instances. The runner owns the primary listener
// and exposes /healthz, POST /shutdown, POST /restart.
// -----------------------------------------------------------------------------
type ServiceStatus = "unknown" | "stopped" | "starting" | "running" | "error";

interface ServiceDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
  color: string;
  /** Port the primary service listens on (where users open the UI). */
  primary: number;
  /** Port the control server listens on (POST /shutdown etc). */
  control: number;
}

const SERVICES: ServiceDef[] = [
  {
    id: "codex-web",
    name: "Codex Web UI",
    tagline: "AI coding assistant web dashboard",
    description: "Web UI for the Codex CLI. Listens on 3000 and an alt on 18925.",
    icon: Bot,
    color: "text-emerald-400",
    primary: 3000,
    control: 4000,
  },
  {
    id: "openclaw",
    name: "OpenClaw Gateway",
    tagline: "WebSocket relay for device control",
    description: "Bridges the Android shell and the Codex backend over WebSocket.",
    icon: Globe,
    color: "text-sky-400",
    primary: 18790,
    control: 19790,
  },
  {
    id: "opencodex",
    name: "OpenCodex Proxy",
    tagline: "Universal LLM API proxy",
    description: "Single OpenAI-compatible endpoint that fans out to every configured provider.",
    icon: Hammer,
    color: "text-violet-400",
    primary: 10101,
    control: 11101,
  },
  {
    id: "hermes",
    name: "Hermes Web UI",
    tagline: "Built-in chat interface",
    description: "Lightweight chat surface served locally.",
    icon: Compass,
    color: "text-amber-400",
    primary: 8788,
    control: 9788,
  },
];

interface HealthResponse {
  ok: boolean;
  name: string;
  ports: number[];
  control: number;
}

async function pingControl(control: number, signal?: AbortSignal): Promise<HealthResponse | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1500);
    const r = await fetch(`http://127.0.0.1:${control}/healthz`, {
      signal: signal ?? c.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    return (await r.json()) as HealthResponse;
  } catch {
    return null;
  }
}

async function postControl(control: number, action: "shutdown" | "restart"): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${control}/${action}`, { method: "POST" });
    return r.ok;
  } catch {
    return false;
  }
}

export default function Services() {
  const [statuses, setStatuses] = useState<Record<string, ServiceStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next: Record<string, ServiceStatus> = {};
    await Promise.all(
      SERVICES.map(async (s) => {
        const h = await pingControl(s.control);
        next[s.id] = h ? "running" : "stopped";
      }),
    );
    setStatuses(next);
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 5_000);
    const initial = setTimeout(refresh, 0);
    return () => {
      clearInterval(id);
      clearTimeout(initial);
    };
  }, [refresh]);

  const handleStop = useCallback(async (s: ServiceDef) => {
    setBusy(s.id);
    setStatuses((prev) => ({ ...prev, [s.id]: "starting" }));
    await postControl(s.control, "shutdown");
    setBusy(null);
    setTimeout(refresh, 500);
  }, [refresh]);

  const handleStart = useCallback(async (s: ServiceDef) => {
    // We can't start a service from the browser (it requires node on the host).
    // Instead, copy a one-liner the user can run.
    void navigator.clipboard?.writeText(
      `node scripts/services/runner.mjs scripts/services/${s.id === "codex-web" ? "codex" : s.id === "openclaw" ? "openclaw" : s.id === "opencodex" ? "opencodex" : "hermes"}.cjs.src ${s.primary} ${s.id}`,
    ).catch(() => undefined);
    setStatuses((prev) => ({ ...prev, [s.id]: "unknown" }));
  }, []);

  const runningCount = Object.values(statuses).filter((s) => s === "running").length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Control Center
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Services</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Browser-side status for the four local services that ship with Dagestan.
            Start/stop is wired to the control endpoint exposed by each runner.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              runningCount === SERVICES.length
                ? "border-emerald-400/30 text-emerald-600 dark:text-emerald-300"
                : "border-amber-400/30 text-amber-600 dark:text-amber-300"
            }
          >
            {runningCount} / {SERVICES.length} running
          </Badge>
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        </div>
      </header>

      <Alert className="border-sky-400/30 bg-sky-400/5">
        <Cpu className="size-4 text-sky-500" />
        <AlertTitle className="text-sm">Bring up all services</AlertTitle>
        <AlertDescription className="text-xs">
          Run{" "}
          <code className="rounded bg-background/60 px-1 py-0.5 font-mono">
            bash scripts/services/start-all.sh
          </code>{" "}
          from the repo root to start every service at once. Stop them with{" "}
          <code className="rounded bg-background/60 px-1 py-0.5 font-mono">
            bash scripts/services/stop-all.sh
          </code>
          .
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {SERVICES.map((s, i) => (
          <ServiceCard
            key={s.id}
            service={s}
            index={i}
            status={statuses[s.id] ?? "unknown"}
            busy={busy === s.id}
            onStop={() => void handleStop(s)}
            onStart={() => void handleStart(s)}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({
  service,
  index,
  status,
  busy,
  onStop,
  onStart,
}: {
  service: ServiceDef;
  index: number;
  status: ServiceStatus;
  busy: boolean;
  onStop: () => void;
  onStart: () => void;
}) {
  const Icon = service.icon;
  const isRunning = status === "running";
  const isStarting = status === "starting";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card
        className={`border transition-colors ${
          isRunning
            ? "border-primary/40 shadow-[0_0_20px_-8px] shadow-primary/20"
            : "border-border/70"
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`flex size-9 items-center justify-center rounded-lg border border-border/60 bg-background/60 ${service.color}`}>
                <Icon className="size-4" />
              </span>
              <div>
                <CardTitle className="text-sm">{service.name}</CardTitle>
                <CardDescription className="text-xs">{service.tagline}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {isRunning ? (
                <Wifi className={`size-3.5 ${service.color}`} />
              ) : (
                <WifiOff className="size-3.5 text-muted-foreground" />
              )}
              <Badge
                variant="outline"
                className={
                  isRunning
                    ? "border-emerald-400/30 text-emerald-600 dark:text-emerald-300"
                    : isStarting
                      ? "border-amber-400/30 text-amber-600 dark:text-amber-300"
                      : "border-border/60 text-muted-foreground"
                }
              >
                {isStarting ? "transitioning…" : isRunning ? "running" : "stopped"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-[11px] leading-snug text-muted-foreground">{service.description}</p>
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
            <Badge variant="outline" className="font-mono">
              :{service.primary}
            </Badge>
            <span>primary</span>
            <Badge variant="outline" className="font-mono">
              :{service.control}
            </Badge>
            <span>control</span>
            <HardDrive className="ml-auto size-3" />
            <span className="font-mono">scripts/services/{service.id}.cjs.src</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={isRunning ? "destructive" : "default"}
              className="h-8 gap-1.5"
              disabled={busy || (!isRunning && isStarting)}
              onClick={isRunning ? onStop : onStart}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isRunning ? (
                <Square className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
              {isRunning ? "Stop" : busy ? "Working…" : "Copy start cmd"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              disabled={!isRunning}
              onClick={() => window.open(`http://127.0.0.1:${service.primary}`, "_blank", "noopener")}
            >
              <ExternalLink className="size-3.5" />
              Open UI
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
