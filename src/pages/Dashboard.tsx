import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { getDroid } from "@/lib/bridge";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/hooks/use-theme";
import { getApiKeys } from "@/lib/store";
import { useLiveModelPool } from "@/hooks/use-live-model-pool";
import { getPoolStatus } from "@/lib/api-key-pool";
// (getSmartModels/PROVIDER_INFO previously imported but not used in this view)
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard, Brain, Store, Puzzle, TerminalSquare, Settings,
  Activity, Zap, HardDrive, Cpu, Globe, Server, Hammer, Compass, Moon,
  ExternalLink, RefreshCw, Smartphone, MonitorPlay, Wifi, WifiOff, Search, Sparkles,
} from "lucide-react";

type PanelKey =
  | "overview" | "services" | "models" | "marketplace"
  | "skills" | "shell" | "providers" | "settings"
  | "workspace";

interface PanelDef {
  key: PanelKey;
  label: string;
  icon: React.ElementType;
}

const SIDEBAR_GROUPS: { label: string; items: PanelDef[] }[] = [
  {
    label: "WORKSPACE",
    items: [
      { key: "overview", label: "Overview", icon: LayoutDashboard },
      { key: "services", label: "Services", icon: Activity },
      { key: "shell", label: "Shell", icon: TerminalSquare },
    ],
  },
  {
    label: "AI",
    items: [
      { key: "models", label: "Models", icon: Brain },
      { key: "providers", label: "Providers", icon: Zap },
      { key: "marketplace", label: "Marketplace", icon: Store },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { key: "skills", label: "Skills", icon: Puzzle },
      { key: "settings", label: "Settings", icon: Settings },
      { key: "workspace", label: "Workspace", icon: MonitorPlay },
    ],
  },
];

interface ServiceInfo {
  name: string;
  icon: React.ElementType;
  port: number;
  href: string;
  reachable: boolean;
}

const SERVICES: ServiceInfo[] = [
  // Port 18925 = CodexServerManager.SERVER_PORT (the desktop dev runner
  // uses 3000, but this page also runs inside the APK WebView where only
  // the managed server exists).
  { name: "Codex Web UI", icon: Globe, port: 18925, href: "/chat", reachable: false },
  { name: "OpenClaw Gateway", icon: Server, port: 18790, href: "http://127.0.0.1:18790", reachable: false },
  { name: "OpenCodex Proxy", icon: Hammer, port: 10101, href: "http://127.0.0.1:10101", reachable: false },
  { name: "Hermes Web UI", icon: Compass, port: 8788, href: "http://127.0.0.1:8788", reachable: false },
];

function useServicesStatus(): ServiceInfo[] {
  const [services, setServices] = useState<ServiceInfo[]>(
    SERVICES.map((s) => ({ ...s, reachable: false })),
  );
  const droid = getDroid();
  const probe = useCallback(async () => {
    if (droid) {
      // Inside the APK the WebView origin is not 127.0.0.1, so cross-origin
      // fetch probes are blocked by CORS. Ask the prefix shell instead —
      // lsof may be missing, so fall back to a /proc socket-table scan.
      const next = SERVICES.map((s) => {
        let reachable = false;
        try {
          const raw = droid.run(
            `lsof -ti:${s.port} 2>/dev/null | head -1 || grep -c ":${s.port.toString(16).toUpperCase().padStart(4, "0")} " /proc/net/tcp 2>/dev/null || echo ''`,
          );
          reachable = raw.trim() !== "" && raw.trim() !== "0";
        } catch {
          reachable = false;
        }
        return { ...s, reachable };
      });
      setServices(next);
      return;
    }
    const next = await Promise.all(
      SERVICES.map(async (s) => {
        // Desktop dev runners expose /healthz on primary+1000 (codex-web: 4000).
        const control = s.port === 18925 ? 4000 : s.port + 1000;
        let reachable = false;
        try {
          const r = await fetch(`http://127.0.0.1:${control}/healthz`, {
            signal: AbortSignal.timeout(1200),
          });
          reachable = r.ok;
        } catch {
          reachable = false;
        }
        return { ...s, reachable };
      }),
    );
    setServices(next);
  }, [droid]);
  useEffect(() => {
    // Defer the initial probe to avoid a cascading render inside the effect body.
    const initial = window.setTimeout(() => { void probe(); }, 0);
    const id = setInterval(probe, 5000);
    return () => {
      window.clearTimeout(initial);
      clearInterval(id);
    };
  }, [probe]);
  return services;
}

function ServiceCard({ service }: { service: ServiceInfo }) {
  const Icon = service.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border p-4 transition-colors",
        service.reachable ? "border-primary/30 bg-primary/5" : "border-border/70 bg-card",
      )}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border",
            service.reachable
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
              : "border-border/60 text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-semibold">{service.name}</span>
        <Badge
          variant="outline"
          className={cn(
            "ml-auto text-[9px]",
            service.reachable
              ? "border-emerald-400/30 text-emerald-600 dark:text-emerald-300"
              : "border-border text-muted-foreground",
          )}
        >
          {service.reachable ? "ON" : "OFF"}
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">Port {service.port} · localhost</p>
      {service.reachable && (
        <Button
          size="sm" variant="outline"
          className="mt-2 h-7 w-full gap-1 text-[11px]"
          onClick={() => window.open(service.href, "_blank")}
        >
          <ExternalLink className="size-3" />
          Open
        </Button>
      )}
    </motion.div>
  );
}

function SystemStats({ droid }: { droid: NonNullable<ReturnType<typeof getDroid>> }) {
  const [cpu, setCpu] = useState(0);
  const [mem, setMem] = useState(0);
  useEffect(() => {
    const tick = () => {
      try {
        const c = droid.run("top -bn1 2>/dev/null | grep -i cpu | head -1 || echo 0");
        const m = droid.run("free 2>/dev/null | awk '/Mem/{printf \"%d\", $3/$2*100}' || echo 0");
        setCpu(parseFloat(String(c).match(/[\d.]+/)?.[0] ?? "0") || 0);
        setMem(parseFloat(String(m).match(/[\d.]+/)?.[0] ?? "0") || 0);
      } catch {
        /* not on device */
      }
    };
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [droid]);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Cpu className="size-4 text-cyan-400" /> CPU
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
            animate={{ width: `${cpu}%` }}
          />
        </div>
      </div>
      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HardDrive className="size-4 text-violet-400" /> Memory
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-500"
            animate={{ width: `${mem}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-2">{icon}<span className="text-sm font-medium">{label}</span></div>
      <span className="font-mono text-sm font-bold text-foreground">{value}</span>
    </div>
  );
}

function OverviewPanel() {
  const services = useServicesStatus();
  const running = services.filter((s) => s.reachable).length;
  const droid = getDroid();
  const keys = getApiKeys();
  const configuredKeys = Object.values(keys).filter(Boolean).length;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex size-2 rounded-full",
              running === services.length
                ? "bg-emerald-400 shadow shadow-emerald-400/60"
                : running > 0 ? "bg-amber-400" : "bg-muted-foreground/40",
            )}
          />
          <span className="text-sm font-medium">{running}/{services.length} services running</span>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[9px]",
            running === services.length
              ? "border-emerald-400/30 text-emerald-600 dark:text-emerald-300"
              : "border-border text-muted-foreground",
          )}
        >
          {droid ? "Device mode" : "Browser preview"}
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{services.map((s) => <ServiceCard key={s.name} service={s} />)}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard icon={<Brain className="size-4 text-indigo-400" />} label="Configured keys" value={String(configuredKeys)} />
        <StatCard icon={<Globe className="size-4 text-sky-400" />} label="Providers" value="3 free tiers" />
      </div>
      {droid && <SystemStats droid={droid} />}
    </div>
  );
}

function InlineStub({ icon, title, description, onOpen }: {
  icon: React.ReactNode; title: string; description: string; onOpen: () => void;
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button size="sm" className="w-fit gap-1.5" onClick={onOpen}>
          <ExternalLink className="size-3" />
          Open full {title}
        </Button>
      </CardContent>
    </Card>
  );
}

function ServicesPanel() {
  const services = useServicesStatus();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Services</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Control Center</h1>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{services.map((s) => <ServiceCard key={s.name} service={s} />)}</div>
      <div className="rounded-lg border border-sky-400/30 bg-sky-400/5 p-3 text-xs">
        Run <code className="rounded bg-background/60 px-1 py-0.5 font-mono">bash scripts/services/start-all.sh</code> to start every service at once.
      </div>
    </div>
  );
}

function WorkspacePanel() {
  const droid = getDroid();
  const [previewUrl, setPreviewUrl] = useState("http://127.0.0.1:5173");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [reachable, setReachable] = useState<boolean | null>(null);

  const probe = useCallback(async () => {
    try {
      const r = await fetch(previewUrl, { method: "GET", signal: AbortSignal.timeout(1500) });
      setReachable(r.ok);
    } catch {
      setReachable(false);
    }
  }, [previewUrl]);

  useEffect(() => {
    // Defer the initial probe to avoid a cascading render inside the effect.
    const initial = window.setTimeout(() => { void probe(); }, 0);
    const id = window.setInterval(probe, 8000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, [probe]);

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MonitorPlay className="size-4 text-primary" />
            Workspace Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Live layer-by-layer preview of the dev server running on this host. Switch the URL to
            preview any of the bundled services as you build them.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="url"
              value={previewUrl}
              onChange={(e) => setPreviewUrl(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs"
              placeholder="http://127.0.0.1:5173"
            />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={probe}>
              <RefreshCw className="size-3" />
              Probe
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setPreviewOpen((o) => !o)}
              disabled={reachable === false}
            >
              {previewOpen ? "Hide preview" : "Show preview"}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {reachable === null ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Wifi className="size-3" /> Checking...
              </span>
            ) : reachable ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Wifi className="size-3" /> Reachable
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <WifiOff className="size-3" /> Not reachable
              </span>
            )}
          </div>
          {previewOpen && reachable && (
            <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/30">
              <iframe
                src={previewUrl}
                title="Workspace preview"
                className="h-[480px] w-full"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Smartphone className="size-4 text-primary" />
            Android Emulator
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {droid ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="size-2 rounded-full bg-emerald-500" />
              Device bridge connected
              <code className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                {"android"}
              </code>
            </div>
          ) : (
            <p className="text-muted-foreground">
              No on-device Android bridge detected. To run a live emulator on this host, install
              Android Studio + the SDK command-line tools and create an AVD, then run
              <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">adb start-server</code>
              and launch
              <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">emulator -avd &lt;name&gt;</code>.
              Once <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">adb devices</code> lists a device,
              it will be picked up here automatically.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href="https://developer.android.com/studio" target="_blank" rel="noreferrer">
                <ExternalLink className="size-3" />
                Android Studio
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a
                href="https://developer.android.com/studio#command-line-tools-only"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-3" />
                SDK tools
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ModelsPanel() {
  const live = useLiveModelPool({ pollMs: 15000 });
  const [q, setQ] = useState("");
  const filtered = live.models
    .filter((m) => m.free)
    .filter((m) => !q || m.id.toLowerCase().includes(q.toLowerCase()) || m.label.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 80);
  const groups = new Map<string, typeof filtered>();
  for (const m of filtered) {
    const arr = groups.get(m.provider) ?? [];
    arr.push(m);
    groups.set(m.provider, arr);
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">AI</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Models</h1>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => live.refresh()}>
          <RefreshCw className="size-3" /> Refresh
        </Button>
      </div>
      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs">
        <p className="font-medium text-cyan-700 dark:text-cyan-300">Live auto-detect</p>
        <p className="mt-1 text-muted-foreground">Polling /v1/models on hermes, opencodex, openclaw, codex-web and the local stub every 15s. New free models appear here automatically; models that disappear upstream are removed the next poll.</p>
      </div>
      {live.removed.length > 0 && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-3 text-xs">
          <p className="font-medium text-rose-600 dark:text-rose-300">{live.removed.length} model(s) removed upstream since last refresh</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {live.removed.slice(0, 5).map((m) => <li key={m.id}>{m.id} (was on {m.source})</li>)}
          </ul>
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search live free models…" className="pl-8" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from(groups.entries()).map(([provider, list]) => (
          <div key={provider} className="rounded-xl border border-border/70 bg-card p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{provider}</span>
              <Badge variant="outline" className="text-[9px]">{list.length} free</Badge>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {list.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5 text-xs">
                  <Brain className="size-3 text-primary" />
                  <span className="flex-1 truncate">{m.label}</span>
                  <Badge variant="outline" className="border-emerald-400/30 text-[8px] text-emerald-600 dark:text-emerald-300">FREE</Badge>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">
            {live.loading ? "Polling /v1/models…" : "No free models detected. Start a service to populate."}
          </div>
        )}
      </div>
    </div>
  );
}

function ProvidersPanel() {
  const live = useLiveModelPool({ pollMs: 20000 });
  const keys = getApiKeys();
  const pool = (() => { try { return getPoolStatus(); } catch { return null; } })();
  const providers: Array<{ id: string; name: string; icon: React.ElementType }> = [
    { id: "openrouter", name: "OpenRouter", icon: Zap },
    { id: "nvidia", name: "NVIDIA Integrate", icon: Cpu },
    { id: "zen", name: "OpenCode Zen", icon: Sparkles },
  ];
  const countByProvider = new Map<string, number>();
  for (const m of live.models) {
    if (!m.free) continue;
    countByProvider.set(m.provider, (countByProvider.get(m.provider) ?? 0) + 1);
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">AI</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Providers</h1>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {providers.map((p) => {
          const Icon = p.icon;
          const configured = !!(keys as Record<string, unknown>)[p.id];
          const poolCount = (pool as Record<string, { totalKeys?: number }> | null)?.[p.id]?.totalKeys ?? null;
          const freeCount = countByProvider.get(p.id) ?? 0;
          return (
            <Card key={p.id} className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Icon className="size-4 text-primary" /> {p.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">API key</span>
                  <Badge variant="outline" className={configured ? "border-emerald-400/30 text-emerald-600 dark:text-emerald-300" : "border-rose-400/30 text-rose-600 dark:text-rose-300"}>
                    {configured ? "Configured" : "Missing"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pool size</span>
                  <span className="font-mono">{poolCount ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Free models live</span>
                  <span className="font-mono">{freeCount}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="rounded-lg border border-sky-400/30 bg-sky-400/5 p-3 text-xs">
        Add or rotate keys in <code className="rounded bg-background/60 px-1 py-0.5 font-mono">secrets.local.json</code> at the repo root, then restart the services.
      </div>
    </div>
  );
}

function DesktopSidebar({ active, onSelect }: { active: PanelKey; onSelect: (k: PanelKey) => void }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border/70 bg-card/40 p-3 md:flex">
      {SIDEBAR_GROUPS.map((g) => (
        <div key={g.label}>
          <div className="px-2.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1">{g.label}</div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.key;
              return (
                <button
                  key={item.key} type="button" onClick={() => onSelect(item.key)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                    isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}

function MobileTabBar({ active, onSelect }: { active: PanelKey; onSelect: (k: PanelKey) => void }) {
  const mobileItems: PanelDef[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "services", label: "Services", icon: Activity },
    { key: "models", label: "Models", icon: Brain },
    { key: "marketplace", label: "Store", icon: Store },
    { key: "skills", label: "Skills", icon: Puzzle },
    { key: "settings", label: "Settings", icon: Settings },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 glass pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid h-16 max-w-md grid-cols-6 items-center px-1">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key} type="button" onClick={() => onSelect(item.key)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="mobile-pill"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  className="absolute top-1 h-1 w-5 rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                />
              )}
              <Icon className="size-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default function Dashboard() {
  const [active, setActive] = useState<PanelKey>("overview");
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();

  const renderPanel = (key: PanelKey) => {
    switch (key) {
      case "overview": return <OverviewPanel />;
      case "services": return <ServicesPanel />;
      case "models": return <ModelsPanel />;
      case "providers": return <ProvidersPanel />;
      case "marketplace": return <InlineStub icon={<Store className="size-4 text-primary" />} title="Marketplace" description="Discover skills, plugins, and MCP servers." onOpen={() => navigate("/marketplace")} />;
      case "skills": return <InlineStub icon={<Puzzle className="size-4 text-primary" />} title="Skills" description="Manage your installed skills and generators." onOpen={() => navigate("/skills")} />;
      case "shell": return <InlineStub icon={<TerminalSquare className="size-4 text-primary" />} title="Shell" description="Root-Linux device agent terminal." onOpen={() => navigate("/shell")} />;
      case "settings": return <InlineStub icon={<Settings className="size-4 text-primary" />} title="Settings" description="Theme, notifications, local models, voice, and sync." onOpen={() => navigate("/settings")} />;
      case "workspace": return <WorkspacePanel />;
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 glass">
        <div className="mx-auto flex h-13 w-full max-w-[1400px] items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2.5">
            {!isMobile && (
              <Button variant="ghost" size="sm" className="size-8" title="Refresh" onClick={() => window.location.reload()}>
                <RefreshCw className="size-4" />
              </Button>
            )}
            <h1 className="text-lg font-semibold">Dashboard</h1>
          </div>
          {!isMobile && (
            <Button variant="ghost" size="sm" className="size-8" aria-label="Theme" onClick={() => toggleTheme()}>
              <Moon className="size-4" />
            </Button>
          )}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-0">
        {!isMobile && <DesktopSidebar active={active} onSelect={setActive} />}
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-6 sm:pb-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-6"
            >
              {renderPanel(active)}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {isMobile && <MobileTabBar active={active} onSelect={setActive} />}
    </div>
  );
}
