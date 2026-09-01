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
import { getDroid, parseServerState, type DroidBridge } from "@/lib/bridge";

// -----------------------------------------------------------------------------
// Service registry — two modes.
//
// On-device (inside the APK): the four servers are owned by the native
// CodexServerManager and controlled through the DagestanDroid bridge
// (serverState / startServer / stopServer). Ports are the manager's
// constants: codex-web-local 18925, OpenClaw gateway 18790 (Control UI
// 19002), OpenCodex 10101, Hermes 8788.
//
// Desktop dev: the scripts/services/runner.mjs instances own the primary
// listener and expose /healthz + POST /shutdown,/restart on control ports.
// -----------------------------------------------------------------------------
type ServiceStatus = "unknown" | "stopped" | "starting" | "stopping" | "running" | "error";

interface ServiceDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
  color: string;
  /** Port the primary service listens on (where users open the UI). */
  primary: number;
  /** Port the control server listens on (POST /shutdown etc). Desktop only. */
  control: number;
}

const DESKTOP_SERVICES: ServiceDef[] = [
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

// On-device ids must match DroidBridge.SERVER_IDS in DroidBridge.kt.
const DEVICE_SERVICES: ServiceDef[] = [
  {
    id: "codex",
    name: "Codex Web UI",
    tagline: "AI coding assistant web dashboard",
    description: "codex-web-local, managed by the native server manager on 127.0.0.1:18925.",
    icon: Bot,
    color: "text-emerald-400",
    primary: 18925,
    control: 0,
  },
  {
    id: "openclaw",
    name: "OpenClaw Gateway",
    tagline: "WebSocket relay for device control",
    description: "Gateway on 18790 plus its Control UI on 19002, managed natively.",
    icon: Globe,
    color: "text-sky-400",
    primary: 18790,
    control: 0,
  },
  {
    id: "opencodex",
    name: "OpenCodex Proxy",
    tagline: "Universal LLM API proxy",
    description: "ocx proxy + dashboard on 10101, managed natively.",
    icon: Hammer,
    color: "text-violet-400",
    primary: 10101,
    control: 0,
  },
  {
    id: "hermes",
    name: "Hermes Web UI",
    tagline: "Built-in chat interface",
    description: "hermes-webui on 8788 (HERMES_WEBUI_PORT), managed natively.",
    icon: Compass,
    color: "text-amber-400",
    primary: 8788,
    control: 0,
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

/** Device-mode state polled from the native server manager via the bridge. */
interface DeviceServiceState {
  state: ServiceStatus;
  running: boolean;
  port: number;
  error: string | null;
}

export default function Services() {
  const [droid] = useState<DroidBridge | null>(() => getDroid());
  const onDevice =
    !!droid &&
    typeof droid.serverState === "function" &&
    typeof droid.startServer === "function" &&
    typeof droid.stopServer === "function";

  const SERVICES = onDevice ? DEVICE_SERVICES : DESKTOP_SERVICES;

  const [statuses, setStatuses] = useState<Record<string, ServiceStatus>>({});
  const [deviceStates, setDeviceStates] = useState<Record<string, DeviceServiceState>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (onDevice && droid) {
      const nextStates: Record<string, DeviceServiceState> = {};
      const nextStatuses: Record<string, ServiceStatus> = {};
      for (const s of DEVICE_SERVICES) {
        try {
          const parsed = parseServerState(droid.serverState!(s.id));
          if (parsed) {
            const status: ServiceStatus =
              parsed.state === "running" || parsed.running
                ? "running"
                : parsed.state === "starting"
                  ? "starting"
                  : parsed.state === "stopping"
                    ? "stopping"
                    : parsed.state === "error"
                      ? "error"
                      : "stopped";
            nextStates[s.id] = {
              state: status,
              running: parsed.running,
              port: parsed.port || s.primary,
              error: parsed.error,
            };
            nextStatuses[s.id] = status;
            continue;
          }
        } catch {
          // fall through to stopped
        }
        nextStates[s.id] = { state: "stopped", running: false, port: s.primary, error: null };
        nextStatuses[s.id] = "stopped";
      }
      setDeviceStates(nextStates);
      setStatuses(nextStatuses);
      return;
    }

    const next: Record<string, ServiceStatus> = {};
    await Promise.all(
      SERVICES.map(async (s) => {
        const h = await pingControl(s.control);
        next[s.id] = h ? "running" : "stopped";
      }),
    );
    setStatuses(next);
  }, [onDevice, droid, SERVICES]);

  useEffect(() => {
    const id = setInterval(refresh, 5_000);
    const initial = setTimeout(refresh, 0);
    return () => {
      clearInterval(id);
      clearTimeout(initial);
    };
  }, [refresh]);

  const handleStop = useCallback(
    async (s: ServiceDef) => {
      setBusy(s.id);
      if (onDevice && droid?.stopServer) {
        setStatuses((prev) => ({ ...prev, [s.id]: "stopping" }));
        try {
          droid.stopServer(s.id);
        } catch {
          // bridge error — refresh will reflect reality
        }
        setTimeout(refresh, 800);
      } else {
        setStatuses((prev) => ({ ...prev, [s.id]: "stopping" }));
        await postControl(s.control, "shutdown");
        setTimeout(refresh, 500);
      }
      setBusy(null);
    },
    [onDevice, droid, refresh],
  );

  const handleStart = useCallback(
    async (s: ServiceDef) => {
      setBusy(s.id);
      if (onDevice && droid?.startServer) {
        setStatuses((prev) => ({ ...prev, [s.id]: "starting" }));
        try {
          droid.startServer(s.id);
        } catch {
          // bridge error — refresh will reflect reality
        }
        setTimeout(refresh, 800);
      } else {
        // Desktop: we can't start a service from the browser (it requires
        // node on the host). Instead, copy a one-liner the user can run.
        const blob = s.id === "codex-web" ? "codex" : s.id;
        void navigator.clipboard
          ?.writeText(
            `node scripts/services/runner.mjs scripts/services/${blob}.cjs.src ${s.primary} ${s.id}`,
          )
          .catch(() => undefined);
        setStatuses((prev) => ({ ...prev, [s.id]: "unknown" }));
      }
      setBusy(null);
    },
    [onDevice, droid, refresh],
  );

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
            {onDevice
              ? "The four local servers managed by the Dagestan server manager. Start/stop talks directly to the native process owner."
              : "Browser-side status for the four local services that ship with Dagestan. Start/stop is wired to the control endpoint exposed by each runner."}
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

      {onDevice ? (
        <Alert className="border-sky-400/30 bg-sky-400/5">
          <Cpu className="size-4 text-sky-500" />
          <AlertTitle className="text-sm">On-device servers</AlertTitle>
          <AlertDescription className="text-xs">
            Start and stop are wired to the native <code className="font-mono">CodexServerManager</code>{" "}
            through the DagestanDroid bridge. Each server restarts cleanly — stale port occupants
            are killed automatically before a new instance binds.
          </AlertDescription>
        </Alert>
      ) : (
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
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {SERVICES.map((s, i) => (
          <ServiceCard
            key={s.id}
            service={s}
            index={i}
            status={statuses[s.id] ?? "unknown"}
            busy={busy === s.id}
            error={deviceStates[s.id]?.error ?? null}
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
  error,
  onStop,
  onStart,
}: {
  service: ServiceDef;
  index: number;
  status: ServiceStatus;
  busy: boolean;
  error: string | null;
  onStop: () => void;
  onStart: () => void;
}) {
  const Icon = service.icon;
  const isRunning = status === "running";
  const isTransitioning = status === "starting" || status === "stopping";

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
            : status === "error"
              ? "border-destructive/40"
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
                    : status === "error"
                      ? "border-destructive/40 text-destructive"
                      : isTransitioning
                        ? "border-amber-400/30 text-amber-600 dark:text-amber-300"
                        : "border-border/60 text-muted-foreground"
                }
              >
                {status === "starting"
                  ? "starting…"
                  : status === "stopping"
                    ? "stopping…"
                    : isRunning
                      ? "running"
                      : status === "error"
                        ? "error"
                        : "stopped"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-[11px] leading-snug text-muted-foreground">{service.description}</p>
          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[10px] leading-snug text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
            <Badge variant="outline" className="font-mono">
              :{service.primary}
            </Badge>
            <span>primary</span>
            {service.control > 0 ? (
              <>
                <Badge variant="outline" className="font-mono">
                  :{service.control}
                </Badge>
                <span>control</span>
              </>
            ) : (
              <>
                <HardDrive className="ml-0.5 size-3" />
                <span className="font-mono">native manager</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={isRunning ? "destructive" : "default"}
              className="h-8 gap-1.5"
              disabled={busy || isTransitioning}
              onClick={isRunning ? onStop : onStart}
            >
              {busy || isTransitioning ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isRunning ? (
                <Square className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
              {isRunning ? "Stop" : isTransitioning ? "Working…" : "Start"}
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
