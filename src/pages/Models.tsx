import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  HardDrive,
  Search,
  Sparkles,
  RefreshCw,
  Wifi,
  WifiOff,
  Layers,
  Download,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocalModels, fmtBytes, pingLocalModels, type LocalModel } from "@/hooks/use-local-models";
import { getSmartModels, PROVIDER_INFO, type SmartModel, type ModelCategory } from "@/lib/smart-models";
import { LocalModelsBrowser } from "@/components/features/LocalModelsBrowser";

const CATEGORY_FILTERS: Array<ModelCategory | "all"> = [
  "all",
  "coding",
  "writing",
  "reasoning",
  "analysis",
  "math",
  "creative",
  "general",
  "fast",
];

export default function Models() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ModelCategory | "all">("all");
  const { models: localModels, reachable, loading, refresh } = useLocalModels();

  // -- cloud (free online) registry ----------------------------------------
  const cloud = useMemo(() => getSmartModels().filter((m) => m.isFree), []);
  const filteredCloud = useMemo(() => {
    const lower = query.toLowerCase();
    return cloud.filter((m) => {
      const catOk = category === "all" || m.categories.includes(category);
      const qOk =
        !lower ||
        m.label.toLowerCase().includes(lower) ||
        m.id.toLowerCase().includes(lower);
      return catOk && qOk;
    });
  }, [cloud, query, category]);

  const grouped = useMemo(() => {
    const map = new Map<string, SmartModel[]>();
    for (const m of filteredCloud) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return Array.from(map.entries());
  }, [filteredCloud]);

  // -- installed local from /v1/models ------------------------------------
  const filteredLocal = useMemo(() => {
    const lower = query.toLowerCase();
    return localModels.filter(
      (m) =>
        !lower ||
        m.id.toLowerCase().includes(lower) ||
        m.repo.toLowerCase().includes(lower) ||
        m.filename.toLowerCase().includes(lower),
    );
  }, [localModels, query]);

  async function manualPing() {
    await refresh();
    void pingLocalModels();
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            AI Infrastructure
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Models</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Browse, install, and switch between on-device GGUF models, free cloud models,
            and everything in between.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              reachable
                ? "border-emerald-400/30 text-emerald-600 dark:text-emerald-300"
                : "border-rose-400/30 text-rose-600 dark:text-rose-300"
            }
          >
            {reachable ? (
              <Wifi className="mr-1 size-3" />
            ) : (
              <WifiOff className="mr-1 size-3" />
            )}
            Local server {reachable ? "online" : "offline"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={manualPing}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, id, or repo…"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {CATEGORY_FILTERS.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium capitalize transition-colors ${
                category === c
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="local" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="local" className="gap-1.5">
            <HardDrive className="size-3.5" /> Installed ({localModels.length})
          </TabsTrigger>
          <TabsTrigger value="browse" className="gap-1.5">
            <Download className="size-3.5" /> Hugging Face
          </TabsTrigger>
          <TabsTrigger value="free" className="gap-1.5">
            <Sparkles className="size-3.5" /> Free online ({cloud.length})
          </TabsTrigger>
        </TabsList>

        {/* LOCAL INSTALLED ----------------------------------------------- */}
        <TabsContent value="local" className="mt-4">
          {!reachable && (
            <Card className="border-amber-400/30 bg-amber-500/5">
              <CardContent className="flex items-start gap-2 py-3 text-xs text-muted-foreground">
                <WifiOff className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <p>
                  The local-models server at <code className="font-mono">127.0.0.1:18927</code>{" "}
                  is unreachable. Restart it from the sidebar or visit the{" "}
                  <span className="font-medium">Hugging Face</span> tab to install
                  your first model.
                </p>
              </CardContent>
            </Card>
          )}

          {reachable && filteredLocal.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 bg-card/20 p-8 text-center text-sm text-muted-foreground">
              {query ? "No local models match your search." : "No models installed yet — try the Hugging Face tab."}
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredLocal.map((m, i) => (
              <LocalCard key={m.id} model={m} index={i} />
            ))}
          </div>
        </TabsContent>

        {/* HF BROWSER ---------------------------------------------------- */}
        <TabsContent value="browse" className="mt-4">
          <LocalModelsBrowser />
        </TabsContent>

        {/* FREE ONLINE --------------------------------------------------- */}
        <TabsContent value="free" className="mt-4">
          {filteredCloud.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-card/20 p-8 text-center text-sm text-muted-foreground">
              No models match your filters.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {grouped.map(([provider, list]) => {
                const info = PROVIDER_INFO[provider as keyof typeof PROVIDER_INFO];
                return (
                  <div key={provider}>
                    <div className="mb-2 flex items-center gap-2">
                      <Layers className="size-4 text-primary" />
                      <h3 className="text-sm font-semibold">
                        {info?.label ?? provider}
                      </h3>
                      <Badge variant="outline" className={`text-[9px] ${info?.badgeColor ?? ""}`}>
                        {list.length} free
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {list.map((m, i) => (
                        <CloudCard key={m.id} model={m} index={i} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LocalCard({ model, index }: { model: LocalModel; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <HardDrive className="size-4 shrink-0 text-amber-500" />
            <span className="truncate font-mono text-xs">{model.filename}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate font-mono">{model.repo}</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-amber-400/30 text-[10px] text-amber-600 dark:text-amber-300">
              {fmtBytes(model.size_bytes)}
            </Badge>
            <Badge variant="outline" className="border-emerald-400/30 text-[10px] text-emerald-600 dark:text-emerald-300">
              LOCAL
            </Badge>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function CloudCard({ model, index }: { model: SmartModel; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Brain className="size-4 shrink-0 text-primary" />
            <span className="truncate">{model.label}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {model.notes && (
            <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
              {model.notes}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="border-emerald-400/30 text-[10px] text-emerald-600 dark:text-emerald-300">
              FREE
            </Badge>
            {model.categories.slice(0, 3).map((c) => (
              <Badge key={c} variant="outline" className="text-[10px]">
                {c}
              </Badge>
            ))}
          </div>
          <code className="block truncate rounded bg-secondary/50 px-2 py-1 font-mono text-[10px] text-muted-foreground">
            {model.id}
          </code>
        </CardContent>
      </Card>
    </motion.div>
  );
}
