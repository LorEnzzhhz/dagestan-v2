import { useState, useMemo } from "react";

import { Zap, Search, ChevronDown, Sparkles, Brain, Code, PenLine, BarChart3, Languages, Palette, Gauge, HardDrive, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSmartModels, recommendModel, PROVIDER_INFO, CATEGORY_INFO, type SmartModel, type ModelCategory, type ProviderId } from "@/lib/smart-models"
import { useLiveModelPool } from "@/hooks/use-live-model-pool"
import { useLocalModels, fmtBytes, type LocalModel } from "@/hooks/use-local-models"

const CATEGORY_ICONS: Record<ModelCategory, React.ElementType> = {
  coding: Code,
  writing: PenLine,
  analysis: BarChart3,
  math: Zap,
  creative: Palette,
  translation: Languages,
  reasoning: Brain,
  general: Sparkles,
  fast: Gauge,
  multimodal: Sparkles,
};

interface SmartModelPickerProps {
  currentModel: string;
  currentProvider: ProviderId | string;
  onSelect: (provider: string, model: string) => void;
  preferFree?: boolean;
}

export function SmartModelPicker({
  currentModel,
  currentProvider,
  onSelect,
  preferFree = true,
}: SmartModelPickerProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ModelCategory | null>(null);

  const allModels = useMemo(() => getSmartModels(), []);
  const filteredModels = useMemo(() => {
    let models = allModels;

    if (preferFree) {
      models = models.filter((m) => m.isFree);
    }

    if (selectedCategory) {
      models = models.filter((m) => m.categories.includes(selectedCategory));
    }

    if (search) {
      const lower = search.toLowerCase();
      models = models.filter(
        (m) =>
          m.label.toLowerCase().includes(lower) ||
          m.id.toLowerCase().includes(lower) ||
          m.notes?.toLowerCase().includes(lower),
      );
    }

    return models;
  }, [allModels, selectedCategory, search, preferFree]);

  const groupedByProvider = useMemo(() => {
    const groups: Record<string, SmartModel[]> = {};
    for (const model of filteredModels) {
      const key = model.provider;
      if (!groups[key]) groups[key] = [];
      groups[key].push(model);
    }
    return groups;
  }, [filteredModels]);

  const smartRecommendation = useMemo(() => {
    return recommendModel("general", preferFree, false);
  }, [preferFree]);

  const { models: localModels, reachable: localReachable, refresh: refreshLocal } = useLocalModels();
  const live = useLiveModelPool({ pollMs: 30000 });
  const filteredLocalModels = useMemo(() => {
    if (!search) return localModels;
    const lower = search.toLowerCase();
    return localModels.filter(
      (m) =>
        m.id.toLowerCase().includes(lower) ||
        m.repo.toLowerCase().includes(lower) ||
        m.filename.toLowerCase().includes(lower),
    );
  }, [localModels, search]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8">
          <Sparkles className="size-3.5 text-primary" />
          <span className="max-w-[120px] truncate text-xs">
            {allModels.find((m) => m.id === currentModel)?.label || currentModel}
          </span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[500px] overflow-auto">
        <div className="p-2">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="h-7 pl-7 text-xs"
            />
          </div>

          {/* Category pills */}
          <div className="mb-2 flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                !selectedCategory
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {Object.entries(CATEGORY_INFO).map(([key, info]) => {
              return (
                <button
                  key={key}
                  onClick={() =>
                    setSelectedCategory(selectedCategory === key ? null : key as ModelCategory)
                  }
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    selectedCategory === key
                      ? "bg-primary/15 text-primary"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {info.icon}
                  {info.label}
                </button>
              );
            })}
          </div>

          {/* Smart recommendation */}
          {smartRecommendation && !search && !selectedCategory && (
            <div className="mb-2 rounded-lg border border-primary/30 bg-primary/5 p-2">
              <p className="text-[10px] font-medium text-primary">
                {"\u2728"} Smart Pick: {smartRecommendation.label}
              </p>
              <p className="text-[9px] text-muted-foreground">
                Best free model for general tasks
              </p>
            </div>
          )}
        </div>

        <DropdownMenuSeparator />

        {/* Local Models (Hugging Face) — populated from /v1/models */}
        <div>
          <DropdownMenuLabel className="flex items-center gap-2 text-xs">
            <HardDrive className="size-3.5 text-amber-500" />
            <span>Local Models</span>
            <Badge variant="outline" className={PROVIDER_INFO.local.badgeColor}>
              {PROVIDER_INFO.local.badge}
            </Badge>
            <span
              className={`ml-auto flex items-center gap-1 text-[9px] ${
                localReachable ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground"
              }`}
              title={localReachable ? "Local-models server reachable" : "Local-models server unreachable"}
            >
              <span
                className={`inline-flex size-1.5 rounded-full ${
                  localReachable ? "bg-emerald-400" : "bg-muted-foreground/40"
                }`}
              />
              {localReachable ? "Server reachable" : "Server offline"}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                refreshLocal();
              }}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Refresh local models"
            >
              <RefreshCw className="size-3" />
            </button>
          </DropdownMenuLabel>

          {!localReachable && (
            <div className="px-3 pb-2 text-[10px] text-muted-foreground">
              Start the local-models server to see on-device GGUF models here.
              Install via the Marketplace or Forge tab.
            </div>
          )}

          {localReachable && filteredLocalModels.length === 0 && (
            <div className="px-3 pb-2 text-[10px] text-muted-foreground">
              {search
                ? "No local models match your search."
                : "No local models installed yet. Browse Hugging Face repos in the Marketplace."}
            </div>
          )}

          {filteredLocalModels.map((m: LocalModel) => {
            const isActive = currentProvider === "local" && currentModel === m.id;
            return (
              <DropdownMenuItem
                key={m.id}
                onClick={() => onSelect("local", m.id)}
                className={`flex items-center gap-2 text-xs ${isActive ? "bg-primary/10" : ""}`}
              >
                <HardDrive className="size-3 shrink-0 text-amber-500" />
                <span className="flex-1 truncate">
                  {m.filename || m.id}
                </span>
                <div className="flex items-center gap-1">
                  {m.size_bytes > 0 && (
                    <Badge
                      variant="outline"
                      className="border-amber-400/30 text-[8px] text-amber-600 dark:text-amber-300"
                    >
                      {fmtBytes(m.size_bytes)}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="border-emerald-400/30 text-[8px] text-emerald-600 dark:text-emerald-300"
                  >
                    LOCAL
                  </Badge>
                </div>
                {isActive && <span className="size-1.5 rounded-full bg-primary" />}
              </DropdownMenuItem>
            );
          })}
        </div>


        <DropdownMenuSeparator />

        {/* Live cloud pool (auto-detected from /v1/models) */}
        <div>
          <DropdownMenuLabel className="flex items-center gap-2 text-xs">
            <Sparkles className="size-3.5 text-cyan-400" />
            <span>Live cloud pool</span>
            <Badge variant="outline" className="border-cyan-400/30 text-[8px] text-cyan-600 dark:text-cyan-300">
              AUTO
            </Badge>
            <span
              className={`ml-auto flex items-center gap-1 text-[9px] ${live.models.length ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground'}`}
              title={live.lastError ? `last error: ${live.lastError}` : `polled ${live.models.length} models`}
            >
              <span className={`inline-flex size-1.5 rounded-full ${live.models.length ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />
              {live.models.length ? `${live.models.length} live` : 'polling…'}
            </span>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); live.refresh(); }}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Refresh live pool"
            >
              <RefreshCw className="size-3" />
            </button>
          </DropdownMenuLabel>
          {live.models.length === 0 ? (
            <div className="px-3 pb-2 text-[10px] text-muted-foreground">
              No live models yet. Make sure at least one Dagestan service (hermes/opencodex/openclaw) is running on its port.
            </div>
          ) : (
            live.models
              .filter((m) => m.free)
              .filter((m) => !search || m.id.toLowerCase().includes(search.toLowerCase()) || m.label.toLowerCase().includes(search.toLowerCase()))
              .slice(0, 50)
              .map((m) => {
                const isActive = m.id === currentModel && m.provider === currentProvider;
                return (
                  <DropdownMenuItem
                    key={`live-${m.id}`}
                    onClick={() => onSelect(m.provider, m.id)}
                    className={`flex items-center gap-2 text-xs ${isActive ? 'bg-primary/10' : ''}`}
                  >
                    <Sparkles className="size-3 shrink-0 text-cyan-400" />
                    <span className="flex-1 truncate">{m.label}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="border-emerald-400/30 text-[8px] text-emerald-600 dark:text-emerald-300">FREE</Badge>
                      <span className="text-[8px] text-muted-foreground">{m.provider}</span>
                    </div>
                    {isActive && <span className="size-1.5 rounded-full bg-primary" />}
                  </DropdownMenuItem>
                );
              })
          )}
        </div>

        <DropdownMenuSeparator />

        {/* Cloud models grouped by provider */}
        {Object.entries(groupedByProvider).map(([provider, models]) => {
          const info = PROVIDER_INFO[provider as ProviderId];
          return (
            <div key={provider}>
              <DropdownMenuLabel className="flex items-center gap-2 text-xs">
                <span>{info?.label || provider}</span>
                <Badge variant="outline" className={`text-[8px] ${info?.badgeColor || ""}`}>
                  {info?.badge}
                </Badge>
                <span className="ml-auto text-[9px] text-muted-foreground">
                  {models.length} models
                </span>
              </DropdownMenuLabel>
              {models.map((model) => {
                const isActive = model.id === currentModel && model.provider === currentProvider;
                return (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => onSelect(model.provider, model.id)}
                    className={`flex items-center gap-2 text-xs ${isActive ? "bg-primary/10" : ""}`}
                  >
                    <span className="flex-1 truncate">{model.label}</span>
                    <div className="flex items-center gap-1">
                      {model.categories.slice(0, 3).map((cat) => (
                        <span key={cat} className="text-[10px]">
                          {CATEGORY_INFO[cat]?.icon}
                        </span>
                      ))}
                      <Badge
                        variant="outline"
                        className={`text-[8px] ${
                          model.isFree
                            ? "border-emerald-400/30 text-emerald-600 dark:text-emerald-300"
                            : "border-amber-400/30 text-amber-600 dark:text-amber-300"
                        }`}
                      >
                        {model.isFree ? "FREE" : "CREDITS"}
                      </Badge>
                    </div>
                    {isActive && (
                      <span className="size-1.5 rounded-full bg-primary" />
                    )}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
            </div>
          );
        })}

        {filteredModels.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No models found. Try a different search or category.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Provider status badge */
export function ProviderStatusBadge({ provider }: { provider: ProviderId }) {
  const info = PROVIDER_INFO[provider];
  const freeCount = getSmartModels(provider).filter((m) => m.isFree).length;
  const totalCount = getSmartModels(provider).length;

  return (
    <Badge variant="outline" className={`text-[9px] ${info.badgeColor}`}>
      {info.badge} · {freeCount}/{totalCount} free
    </Badge>
  );
}

/** Quick model selector with categories */
export function QuickModelSelector({
  onSelect,
  currentModel,
}: {
  onSelect: (model: string) => void;
  currentModel: string;
}) {
  const categories: ModelCategory[] = ["coding", "writing", "math", "reasoning", "creative"];

  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((cat) => {
        const model = recommendModel(cat, true, false);
        if (!model) return null;
        const Icon = CATEGORY_ICONS[cat];
        const isActive = model.id === currentModel;

        return (
          <button
            key={cat}
            onClick={() => onSelect(model.id)}
            className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium transition-all ${
              isActive
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            <Icon className="size-3" />
            {CATEGORY_INFO[cat].label}
          </button>
        );
      })}
    </div>
  );
}
