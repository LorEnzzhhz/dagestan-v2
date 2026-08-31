import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useNotifications, updatePrefs } from "@/hooks/use-notifications";
import { PROVIDERS } from "@/lib/models";
import {
  KeyRound,
  LogOut,
  Moon,
  Sun,
  Zap,
  Bell,
  Palette,
  Shield,
  Database,
  HardDrive,
  Trash2,
  Download,
  Activity,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useLocalModels, resolveRepo, downloadModel, deleteModel, fmtBytes, cancelDownload, trackDownload, untrackDownload, type LocalModel, type DownloadProgress, type RepoFile } from "@/hooks/use-local-models";
import { listModelHealth, clearModelHealth } from "@/lib/model-health";
import { VoicePanel } from "@/pages/settings/VoicePanel";
import { forceModelHealthRefresh } from "@/hooks/use-model-health";
import { useNavigate } from "react-router";
import * as db from "@/lib/db";
import { hasUserKey } from "@/lib/store";
import { getPoolStatus } from "@/lib/api-key-pool";
import { ProviderMonitor } from "@/components/features/ProviderMonitor";
import { ProviderStatusBadge } from "@/components/chat/SmartModelPicker";
import {
  getSmartModels,
  getFreeModels,
  PROVIDER_INFO,
  CATEGORY_INFO,
  type ProviderId,
} from "@/lib/smart-models";
import { TrendingUp, Sparkles } from "lucide-react"
import type { ApiKeys } from "@/lib/store";

/** Map an env-var name to its ApiKeys field, or null if it isn't a key we know. */
function envToProviderKey(env: string): keyof ApiKeys | null {
  if (env.includes("ZEN")) return "zen";
  if (env.includes("OPENROUTER")) return "openrouter";
  if (env.includes("NVIDIA")) return "nvidia";
  if (env.includes("EXA")) return "exa";
  return null;
}

const PROVIDER_OPTIONS = [
  {
    id: "zen",
    label: "OpenCode Zen",
    badge: "FREE",
    badgeColor: "border-emerald-400/30 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300",
    description: "Curated models including Big Pickle, MiMo, Nemotron — 100% free",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    badge: "FREE TIERS",
    badgeColor: "border-sky-400/30 bg-sky-400/10 text-sky-600 dark:text-sky-300",
    description: "Huge catalog with DeepSeek, Llama, Qwen, Gemma — free tiers",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    badge: "FREE CREDITS",
    badgeColor: "border-lime-400/30 bg-lime-400/10 text-lime-600 dark:text-lime-300",
    description: "Fast NVIDIA-hosted open models — free developer credits",
  },
];

const ACCENT_COLORS = [
  { name: "Emerald", value: "#34d399" },
  { name: "Sky", value: "#38bdf8" },
  { name: "Violet", value: "#a78bfa" },
  { name: "Rose", value: "#fb7185" },
  { name: "Amber", value: "#fbbf24" },
  { name: "Cyan", value: "#22d3ee" },
  { name: "Indigo", value: "#818cf8" },
  { name: "Teal", value: "#2dd4bf" },
];

function LocalModelsTab() {
  const { models, reachable, loading, refresh } = useLocalModels();
  const [repo, setRepo] = useState("Qwen/Qwen2.5-0.5B-Instruct-GGUF");
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Record<string, { progress?: DownloadProgress; error?: string; done?: boolean }>>({});

  const doResolve = useCallback(async () => {
    setResolving(true);
    setResolveError(null);
    setFiles([]);
    try {
      const list = await resolveRepo(repo);
      setFiles(list);
    } catch (e) {
      setResolveError((e as Error).message);
    } finally {
      setResolving(false);
    }
  }, [repo]);

  const startDownload = useCallback((filename: string) => {
    const key = `${repo}/${filename}`;
    if (downloads[key] && !downloads[key].error && !downloads[key].done) return;
    setDownloads((prev) => ({ ...prev, [key]: {} }));
    const ctrl = downloadModel(
      repo, filename,
      (p) => setDownloads((prev) => ({ ...prev, [key]: { ...prev[key], progress: p } })),
      () => {
        setDownloads((prev) => ({ ...prev, [key]: { ...prev[key], done: true } }));
        untrackDownload(key);
        refresh();
      },
      (msg) => {
        setDownloads((prev) => ({ ...prev, [key]: { ...prev[key], error: msg } }));
        untrackDownload(key);
      },
    );
    trackDownload(key, ctrl);
  }, [repo, downloads, refresh]);

  const remove = useCallback(async (m: LocalModel) => {
    await deleteModel(m.repo, m.filename);
    refresh();
  }, [refresh]);

  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <HardDrive className="size-4" /> Local Models
        </CardTitle>
        <CardDescription className="text-xs">
          Download GGUF models from{" "}
          <a className="underline" href="https://huggingface.co" target="_blank" rel="noopener noreferrer">Hugging Face</a>{" "}
          and run them on-device via llama.cpp. No API key, no data leaves your phone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs">
          <span className={"inline-block size-2 rounded-full " + (reachable ? "bg-emerald-500" : "bg-amber-500")} />
          {reachable ? "Local server reachable on 127.0.0.1:18927" : "Local server not running — start it with `npm run local-models`"}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border p-3 bg-muted/30">
          <div className="flex gap-2">
            <Input
              placeholder="owner/repo (e.g. Qwen/Qwen2.5-0.5B-Instruct-GGUF)"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="font-mono text-xs"
            />
            <Button onClick={doResolve} disabled={resolving || !repo} size="sm">
              {resolving ? "Listing..." : "List files"}
            </Button>
          </div>
          {resolveError && (
            <div className="text-xs text-destructive">{resolveError}</div>
          )}
          {files.length > 0 && (
            <div className="flex flex-col gap-1 mt-1">
              <div className="text-xs font-medium">
                {files.length} .gguf file{files.length === 1 ? "" : "s"} in this repo:
              </div>
              {files.map((f) => {
                const key = `${repo}/${f.filename}`;
                const dl = downloads[key];
                const pct = dl?.progress && dl.progress.total > 0
                  ? Math.round((dl.progress.downloaded / dl.progress.total) * 100)
                  : 0;
                const busy = dl && !dl.done && !dl.error;
                return (
                  <div key={f.filename} className="flex items-center gap-2 text-xs">
                    <code className="font-mono truncate flex-1">{f.filename}</code>
                    <span className="text-muted-foreground w-20 text-right">
                      {f.size ? fmtBytes(f.size) : "—"}
                    </span>
                    {busy ? (
                      <>
                        <span className="w-24 text-right tabular-nums">
                          {pct}% · {(dl.progress!.speed_bps / 1024 / 1024).toFixed(1)} MB/s
                        </span>
                        <Button variant="outline" size="sm" onClick={() => cancelDownload(key)}>
                          Cancel
                        </Button>
                      </>
                    ) : dl?.error ? (
                      <span className="text-destructive">failed: {dl.error}</span>
                    ) : dl?.done ? (
                      <span className="text-emerald-600 dark:text-emerald-400">installed</span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => startDownload(f.filename)}>
                        Download
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium flex items-center justify-between">
            <span>Installed models ({models.length})</span>
            {loading && <span className="text-muted-foreground">refreshing...</span>}
          </div>
          {models.length === 0 ? (
            <div className="text-xs text-muted-foreground border rounded-md p-3">
              No models installed yet. Pick a repo above and download a .gguf file.
            </div>
          ) : (
            models.map((m) => (
              <div key={m.id} className="flex items-center gap-2 border rounded-md p-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-mono truncate">{m.filename}</div>
                  <div className="text-muted-foreground truncate">{m.repo}</div>
                </div>
                <span className="text-muted-foreground w-20 text-right tabular-nums">{fmtBytes(m.size_bytes)}</span>
                <span className="text-muted-foreground font-mono w-16 truncate">{m.sha256.slice(0, 8)}</span>
                <Button variant="ghost" size="sm" onClick={() => remove(m)} aria-label="Delete">
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}



function ModelHealthPanel() {
  const [entries, setEntries] = useState(listModelHealth());
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => {
    setEntries(listModelHealth());
  }, []);
  useEffect(() => {
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
  }, [refresh]);
  const onForce = async () => {
    setRefreshing(true);
    try { await forceModelHealthRefresh(); } finally { setRefreshing(false); refresh(); }
  };
  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          No tracked free models yet. Models appear here when one is rate-limited or
          removed from the upstream catalog. The router still uses defaults in the meantime.
        </p>
        <div>
          <Button variant="outline" size="sm" onClick={onForce} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh now"}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{entries.length} tracked entries</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onForce} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh now"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { clearModelHealth(); refresh(); }}>
            Clear all
          </Button>
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border">
        {entries.map((e) => (
          <div key={`${e.provider}::${e.model}`} className="flex items-center justify-between border-b p-2 text-xs last:border-b-0">
            <div className="flex flex-col">
              <span className="font-mono">{e.provider}/{e.model}</span>
              {e.lastError ? <span className="text-muted-foreground">{e.lastError}</span> : null}
            </div>
            <Badge variant={e.status === "removed" ? "destructive" : "outline"} className="text-[10px]">
              {e.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Settings() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { preferences: notifPrefs } = useNotifications();
  const navigate = useNavigate();
  const displayName = user?.name || user?.email || "Explorer";
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");

  const [selectedProvider, setSelectedProvider] = useState<string>(() => {
    try {
      return localStorage.getItem("dagestan.selectedProvider") || "zen";
    } catch {
      return "zen";
    }
  });

  const [accentColor, setAccentColor] = useState<string>(() => {
    try {
      return localStorage.getItem("dagestan.accent") || "#34d399";
    } catch {
      return "#34d399";
    }
  });

  const selectProvider = useCallback((providerId: string) => {
    setSelectedProvider(providerId);
    try {
      localStorage.setItem("dagestan.selectedProvider", providerId);
    } catch { /* ignore */ }
  }, []);

  const selectAccent = useCallback((color: string) => {
    setAccentColor(color);
    try {
      localStorage.setItem("dagestan.accent", color);
      document.documentElement.style.setProperty("--primary", color);
    } catch { /* ignore */ }
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const keys = [
    ...PROVIDERS.map((p) => ({
      env: p.keyEnv,
      label: p.label,
      url: p.signupUrl,
    })),
    { env: "EXA_API_KEY", label: "Exa — live web search skill", url: "https://dashboard.exa.ai" },
  ];

  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      keys.map((k) => [k.env, (db.getApiKeys() as Record<string, string>)[envToProviderKey(k.env) as string] ?? ""]),
    ),
  );
  const [apiKeySaved, setApiKeySaved] = useState<Record<string, boolean>>({});

  const saveApiKey = (keyName: string) => {
    const providerKey = envToProviderKey(keyName);
    const currentKeys = db.getApiKeys() as Record<string, string>;
    if (providerKey) currentKeys[providerKey] = apiKeyInputs[keyName];
    db.setApiKeys(currentKeys as ApiKeys);
    setApiKeySaved(prev => ({ ...prev, [keyName]: true }));
    setTimeout(() => setApiKeySaved(prev => ({ ...prev, [keyName]: false })), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Workspace
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
      </header>

      <Tabs
        value={(() => {
          const t = new URLSearchParams(window.location.search).get("tab");
          return ["general","providers","smart","local","appearance","notifications","advanced","voice","sync","privacy"].includes(t ?? "") ? t! : "general";
        })()}
        onValueChange={(v) => {
          const url = new URL(window.location.href);
          url.searchParams.set("tab", v);
          window.history.replaceState(null, "", url.toString());
        }}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-10">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="smart">Smart AI</TabsTrigger>
          <TabsTrigger value="local">Local</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="notifications">Alerts</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="sync">Sync</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="flex flex-col gap-6 mt-4">
          {/* Account */}
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Account</CardTitle>
              <CardDescription className="text-xs">
                Your identity across Dagestan
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Avatar className="size-12 border">
                {user?.image && <AvatarImage src={user.image} alt={displayName} />}
                <AvatarFallback className="text-sm font-semibold">
                  {initials || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email ?? "Anonymous session"}
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-emerald-400/30 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300"
              >
                {user?.isAnonymous ? "Guest" : "Verified"}
              </Badge>
            </CardContent>
          </Card>

          {/* About */}
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">About Dagestan</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Every powerful model, one beautiful conversation.
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                Streaming chat across OpenCode Zen, OpenRouter and NVIDIA NIM,
                with skills for live web search, math, writing, code execution,
                and a silent root-Linux device agent. Version 2.5.0 · React + Tailwind.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-fit gap-1.5 text-destructive hover:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Providers Tab */}
        <TabsContent value="providers" className="flex flex-col gap-6 mt-4">
          {/* Provider Selection */}
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Zap className="size-4 text-primary" />
                Select your AI provider
              </CardTitle>
              <CardDescription className="text-xs">
                Choose a free provider. Your key is stored only on this device.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {PROVIDER_OPTIONS.map((p) => {
                const isActive = selectedProvider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectProvider(p.id)}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                      isActive
                        ? "border-primary/50 bg-primary/10 shadow-[0_0_16px_-6px] shadow-primary/25"
                        : "border-border/70 hover:border-border hover:bg-card/60"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2 rounded-full ${isActive ? "bg-primary" : "bg-muted-foreground/40"}`}
                        />
                        <span className="text-sm font-semibold">{p.label}</span>
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-semibold ${p.badgeColor}`}
                        >
                          {p.badge}
                        </Badge>
                      </div>
                      <p className="mt-0.5 pl-3.5 text-xs text-muted-foreground">
                        {p.description}
                      </p>
                    </div>
                    <span
                      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isActive
                          ? "border-primary"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {isActive && (
                        <span className="size-2.5 rounded-full bg-primary" />
                      )}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* API Keys */}
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <KeyRound className="size-4 text-primary" />
                AI provider keys
              </CardTitle>
              <CardDescription className="text-xs">
                Keys are stored only on this device and sent straight to the
                provider — there is no server in the middle.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {keys.map((k) => {
                const providerKey = envToProviderKey(k.env);
                const usingDefault = providerKey ? !hasUserKey(providerKey) : false;
                return (
                <div
                  key={k.env}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-mono text-xs font-semibold">{k.env}</p>
                      {usingDefault && (
                        <Badge variant="outline" className="text-[8px] border-emerald-400/30 text-emerald-600 dark:text-emerald-300">
                          Built-in ✓
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {usingDefault ? `${k.label} — built-in key, works immediately` : k.label}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <div className="flex items-center gap-2">
                      <Input
                        type="password"
                        value={apiKeyInputs[k.env] || ""}
                        onChange={(e) => setApiKeyInputs(prev => ({ ...prev, [k.env]: e.target.value }))}
                        placeholder="Paste API key..."
                        className="h-7 w-48 text-xs"
                      />
                      <Button
                        size="sm"
                        className="h-7"
                        onClick={() => saveApiKey(k.env)}
                      >
                        {apiKeySaved[k.env] ? "Saved!" : "Save"}
                      </Button>
                    </div>
                  </div>
                </div>
              ); })}
              <p className="text-[11px] text-muted-foreground">
                Free tiers: OpenCode Zen models are 100% free; OpenRouter has many
                <span className="font-mono"> :free </span>models; NVIDIA gives free
                developer credits. Web search uses Exa's free tier.
              </p>

              {/* Pool Status */}
              <div className="mt-3 rounded-lg border border-border/60 p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Shared Key Pool Status</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {getPoolStatus().map((ps) => (
                    <div key={ps.provider} className="rounded-md bg-secondary/50 p-2 text-center">
                      <p className="text-[10px] font-medium uppercase text-muted-foreground">{ps.provider}</p>
                      <p className="text-sm font-bold">
                        <span className="text-emerald-500">{ps.available}</span>
                        <span className="text-muted-foreground">/{ps.total}</span>
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {ps.healthy} healthy · score {ps.avgScore}
                      </p>
                      {ps.nextAvailableIn != null && ps.nextAvailableIn > 0 && (
                        <p className="text-[9px] text-amber-500">
                          Next in {Math.ceil(ps.nextAvailableIn / 60000)}m
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Smart AI Tab */}
        <TabsContent value="smart" className="flex flex-col gap-6 mt-4">
          {/* Smart Model Categories */}
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="size-4 text-primary" />
                Smart Model Categories
              </CardTitle>
              <CardDescription className="text-xs">
                Models are auto-categorized by profession. Pick the best model for your task.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(Object.entries(CATEGORY_INFO) as [string, { label: string; icon: string; description: string }][]).map(([key, info]) => {
                  const models = getSmartModels().filter(m => m.categories.includes(key as never));
                  const freeCount = models.filter(m => m.isFree).length;
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-border/60 p-2.5 transition-colors hover:border-primary/30 hover:bg-primary/5"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{info.icon}</span>
                        <span className="text-xs font-semibold">{info.label}</span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{info.description}</p>
                      <div className="mt-1 flex items-center gap-1">
                        <Badge variant="outline" className="text-[8px]">
                          {models.length} models
                        </Badge>
                        {freeCount > 0 && (
                          <Badge variant="outline" className="text-[8px] border-emerald-400/30 text-emerald-600 dark:text-emerald-300">
                            {freeCount} free
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Provider Status */}
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="size-4 text-primary" />
                Provider Status
              </CardTitle>
              <CardDescription className="text-xs">
                Auto-detects new free models and removed models
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(["zen", "openrouter", "nvidia"] as ProviderId[]).map((pid) => {
                const info = PROVIDER_INFO[pid];
                const allModels = getSmartModels(pid);
                const freeModels = getFreeModels(pid);
                return (
                  <div
                    key={pid}
                    className="flex items-center justify-between rounded-lg border border-border/60 p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-emerald-400" />
                      <span className="text-xs font-semibold">{info.label}</span>
                      <ProviderStatusBadge provider={pid} />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{freeModels.length} free</span>
                      <span>·</span>
                      <span>{allModels.length} total</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Live Provider Monitor */}
          <ProviderMonitor />
        </TabsContent>

        <TabsContent value="local" className="flex flex-col gap-6 mt-4">
          <LocalModelsTab />
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="flex flex-col gap-6 mt-4">
          {/* Theme */}
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Theme</CardTitle>
              <CardDescription className="text-xs">
                Midnight peaks in the dark, soft daylight in the light
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2.5">
                  {theme === "dark" ? (
                    <Moon className="size-4 text-muted-foreground" />
                  ) : (
                    <Sun className="size-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {theme === "dark" ? "Midnight peaks" : "Light mode"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Theme is saved on this device
                    </p>
                  </div>
                </div>
                <Switch checked={theme === "light"} onCheckedChange={toggleTheme} />
              </div>
            </CardContent>
          </Card>

          {/* Accent Color */}
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Palette className="size-4 text-primary" />
                Accent color
              </CardTitle>
              <CardDescription className="text-xs">
                Customize the primary accent color across the app
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => selectAccent(c.value)}
                    className={`group flex flex-col items-center gap-1.5`}
                  >
                    <div
                      className={`size-10 rounded-full border-2 transition-all hover:scale-110 ${
                        accentColor === c.value
                          ? "border-white scale-110 shadow-lg"
                          : "border-transparent"
                      }`}
                      style={{ background: c.value }}
                    />
                    <span className={`text-[10px] font-medium ${
                      accentColor === c.value ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {c.name}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="flex flex-col gap-6 mt-4">
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bell className="size-4 text-primary" />
                Notification preferences
              </CardTitle>
              <CardDescription className="text-xs">
                Control which notifications you receive
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Enable notifications</p>
                  <p className="text-xs text-muted-foreground">Master toggle for all notifications</p>
                </div>
                <Switch
                  checked={notifPrefs.enabled}
                  onCheckedChange={(v) => updatePrefs({ enabled: v })}
                />
              </div>

              {[
                { key: "chat" as const, label: "Chat messages", desc: "New messages and replies" },
                { key: "system" as const, label: "System updates", desc: "App updates and maintenance" },
                { key: "skill" as const, label: "Skill activity", desc: "Skill completions and results" },
                { key: "device" as const, label: "Device agent", desc: "Device online/offline and commands" },
                { key: "security" as const, label: "Security alerts", desc: "Auth events and anomalies" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch
                    checked={notifPrefs[item.key]}
                    onCheckedChange={(v) => updatePrefs({ [item.key]: v })}
                    disabled={!notifPrefs.enabled}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="flex flex-col gap-6 mt-4">
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Database className="size-4 text-primary" />
                Data management
              </CardTitle>
              <CardDescription className="text-xs">
                Manage your local data and storage
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Local storage</p>
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        try {
                          let total = 0;
                          for (const key in localStorage) {
                            if (key.startsWith("dagestan.")) {
                              total += localStorage.getItem(key)?.length || 0;
                            }
                          }
                          return `${(total / 1024).toFixed(1)} KB used`;
                        } catch {
                          return "Unknown";
                        }
                      })()}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">Local only</Badge>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Download className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Export data</p>
                    <p className="text-xs text-muted-foreground">
                      Download all chats and settings as JSON
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const data = {
                      chats: (() => { try { return JSON.parse(localStorage.getItem("dagestan.chats") || "[]"); } catch { return []; } })(),
                      settings: { provider: selectedProvider, accent: accentColor, theme },
                      exportDate: new Date().toISOString(),
                    };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `dagestan-export-${new Date().toISOString().split("T")[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export
                </Button>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-destructive/30 p-3">
                <div className="flex items-center gap-2">
                  <Trash2 className="size-4 text-destructive" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Clear all data</p>
                    <p className="text-xs text-muted-foreground">
                      Remove all chats, settings, and cached data
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm("This will delete all your local data. Are you sure?")) {
                      const keys = Object.keys(localStorage).filter(k => k.startsWith("dagestan."));
                      keys.forEach(k => localStorage.removeItem(k));
                      window.location.reload();
                    }
                  }}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="size-4 text-primary" />
                Model health
              </CardTitle>
              <CardDescription className="text-xs">
                Free models auto-removed by the router when they 404 or vanish from
                upstream <code className="font-mono">/v1/models</code>. Auto-refresh
                every 10 minutes; manual refresh picks up changes immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ModelHealthPanel />
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield className="size-4 text-primary" />
                Privacy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs leading-5 text-muted-foreground">
                Dagestan stores everything locally on your device. No data is sent
                to any server except the AI provider you choose (with your API key).
                Chat history, settings, and preferences never leave your device.
                The device agent runs commands only on hardware you register.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="voice" className="flex flex-col gap-6 mt-4">
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Voice engine</CardTitle>
              <CardDescription className="text-xs">
                Pick where spoken responses come from. Browser STT is always used
                for transcription; only TTS is configurable here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VoicePanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync" className="flex flex-col gap-6 mt-4">
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Cross-device sync</CardTitle>
              <CardDescription className="text-xs">
                End-to-end encrypted chat history. Opt-in only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Sync configuration will appear here once the sync system ships.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy" className="flex flex-col gap-6 mt-4">
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Telemetry</CardTitle>
              <CardDescription className="text-xs">
                Crash reports are sent automatically. Usage stats are off by
                default and never include message text.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-xs">
              <p className="text-xs text-muted-foreground">
                Dagestan buffers a rolling 500 events on your device.
                Errors are captured automatically; usage events are only
                emitted if you enable them. View the buffer at{" "}
                <a href="/debug" className="font-mono text-primary hover:underline">
                  /debug
                </a>.
              </p>
              <p className="text-xs text-muted-foreground">
                Future versions will optionally upload anonymized reports
                from this panel. Until then, nothing leaves your device.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
