import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PROVIDERS,
  MODELS,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  type ProviderId,
} from "@/lib/models";
import { Check, ChevronDown, Plus, Search, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { migrateKey } from "@/lib/store";

const CUSTOM_KEY = migrateKey("prism.customModels", "dagestan.customModels");

function loadCustom(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function loadCustomModels(): string[] {
  return loadCustom();
}

/** Small brand dot per provider so groups scan instantly. */
const PROVIDER_DOT: Record<ProviderId, string> = {
  zen: "bg-emerald-400",
  openrouter: "bg-sky-400",
  nvidia: "bg-lime-300",
  local: "bg-amber-400",
};

interface Props {
  provider: string;
  model: string;
  keyStatus: Record<string, boolean> | null;
  onChange: (provider: ProviderId | string, model: string) => void;
}

/** Model selector grouped by provider with live search, plus a custom-model
 *  input so any OpenAI-compatible model id can be used.
 *
 *  NOTE: items select via Radix `onSelect` (not onClick) — onClick can be
 *  swallowed when the menu closes mid-tap on touch devices / WebViews, which
 *  made models appear unselectable. */
export function ModelPicker({ provider, model, keyStatus, onChange }: Props) {
  const [custom, setCustom] = useState("");
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [customModels, setCustomModels] = useState<string[]>(
    () => loadCustom(),
  );

  const currentModel = MODELS.find(
    (m) => m.provider === provider && m.id === model,
  );
  const currentLabel =
    currentModel?.label ??
    (customModels.includes(model) || !currentModel ? model : model);
  const currentProviderLabel =
    PROVIDERS.find((p) => p.id === provider)?.label ?? String(provider);

  const q = query.trim().toLowerCase();

  const addCustom = () => {
    const id = custom.trim();
    if (!id) return;
    const next = Array.from(new Set([...loadCustom(), id]));
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
    setCustomModels(next);
    setCustom("");
    setAdding(false);
    onChange(provider, id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "group h-9 gap-2 rounded-xl border-border/80 bg-card/70 px-3 text-xs shadow-sm transition-all",
            "hover:border-primary/50 hover:bg-card focus-visible:ring-primary/40",
          )}
        >
          <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-500">
            <Zap className="size-3 text-white" />
          </span>
          <span className="flex min-w-0 flex-col items-start leading-none">
            <span className="max-w-[150px] truncate font-semibold">
              {currentLabel}
            </span>
            <span className="max-w-[150px] truncate text-[9px] font-normal text-muted-foreground">
              {currentProviderLabel}
            </span>
          </span>
          <ChevronDown className="size-3.5 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="max-h-[440px] w-80 overflow-y-auto scrollbar-slim"
      >
        {/* Live search across every catalog entry */}
        <div className="sticky top-0 z-10 -mx-1 -mt-1 bg-popover/95 px-1 pt-1 pb-1.5 backdrop-blur">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="h-8 rounded-lg pl-8 text-xs"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        {PROVIDERS.map((p, idx) => {
          const configured =
            keyStatus === null ? true : Boolean(keyStatus[p.keyEnv]);
          const matches = MODELS.filter(
            (m) =>
              m.provider === p.id &&
              (!q ||
                m.label.toLowerCase().includes(q) ||
                m.id.toLowerCase().includes(q)),
          );
          if (matches.length === 0 && q) return null;

          return (
            <div key={p.id}>
              <DropdownMenuLabel className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", PROVIDER_DOT[p.id])} />
                {p.label}
                {!configured && (
                  <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium normal-case text-amber-500">
                    key needed
                  </span>
                )}
              </DropdownMenuLabel>
              {matches.map((m) => {
                const active = provider === m.provider && model === m.id;
                return (
                  <DropdownMenuItem
                    key={`${p.id}:${m.id}`}
                    className="cursor-pointer justify-between gap-2 rounded-lg py-2"
                    onSelect={() => onChange(m.provider, m.id)}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">{m.label}</span>
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {m.note}
                      </span>
                    </span>
                    {active && (
                      <Check className="size-4 shrink-0 animate-in zoom-in-50 text-primary" />
                    )}
                  </DropdownMenuItem>
                );
              })}

              {/* Custom ids saved under this provider */}
              {!q &&
                p.id === provider &&
                customModels.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {customModels.map((id) => (
                      <DropdownMenuItem
                        key={`custom:${id}`}
                        className="cursor-pointer justify-between rounded-lg"
                        onSelect={() => onChange(p.id, id)}
                      >
                        <span className="truncate font-mono text-xs">{id}</span>
                        {model === id && (
                          <Check className="size-4 shrink-0 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}

              {idx !== PROVIDERS.length - 1 && <DropdownMenuSeparator />}
            </div>
          );
        })}

        {q &&
          MODELS.every(
            (m) =>
              !m.label.toLowerCase().includes(q) &&
              !m.id.toLowerCase().includes(q),
          ) && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No built-in model matches “{query}”.
            </p>
          )}

        <DropdownMenuSeparator />
        {adding ? (
          <div
            className="flex items-center gap-1.5 p-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Input
              autoFocus
              value={custom}
              placeholder="any-model-id"
              className="h-7 font-mono text-xs"
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") addCustom();
              }}
            />
            <Button size="sm" className="h-7 px-2 text-xs" onClick={addCustom}>
              Add
            </Button>
          </div>
        ) : (
          <DropdownMenuItem
            className="cursor-pointer gap-2 rounded-lg"
            onSelect={(e) => {
              e.preventDefault();
              setAdding(true);
            }}
          >
            <Plus className="size-4" /> Custom model id…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { DEFAULT_MODEL, DEFAULT_PROVIDER };
