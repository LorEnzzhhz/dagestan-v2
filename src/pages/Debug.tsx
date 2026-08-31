import { useEffect, useState } from "react";
import { listEvents, clearEvents, logUsage, logError, type TelemetryEvent } from "@/lib/telemetry";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Zap, AlertTriangle } from "lucide-react";

function fmt(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function Debug() {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [filter, setFilter] = useState<"all" | "error" | "usage">("all");

  useEffect(() => {
    let cancelled = false;
    void listEvents().then((e) => { if (!cancelled) setEvents(e); });
    const id = setInterval(() => {
      void listEvents().then((e) => { if (!cancelled) setEvents(e); });
    }, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const filtered = filter === "all" ? events : events.filter((e) => e.kind === filter);
  const errors = events.filter((e) => e.kind === "error").length;
  const usage = events.filter((e) => e.kind === "usage").length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 text-xs">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Developer
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Debug</h1>
        <p className="text-xs text-muted-foreground">
          Local telemetry buffer. {events.length} event{events.length === 1 ? "" : "s"} ({errors} error{errors === 1 ? "" : "s"}, {usage} usage). Never leaves your device unless you enable upload in Settings → Privacy.
        </p>
      </header>

      <div className="flex items-center gap-2">
        {(["all", "error", "usage"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              filter === f
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            }`}
          >
            {f} {f === "error" && `(${errors})`} {f === "usage" && `(${usage})`}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => logUsage("debug_test_event", { hello: "world" })}
          >
            <Zap className="size-3" /> Test usage
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => logError("debug_test_error", "synthetic for testing")}
          >
            <AlertTriangle className="size-3" /> Test error
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] text-rose-500 hover:text-rose-500"
            onClick={() => { void clearEvents().then(() => setEvents([])); }}
          >
            <Trash2 className="size-3" /> Clear
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 bg-card/30 p-6 text-center text-muted-foreground">
            No events yet.
          </div>
        )}
        {filtered.map((e, i) => (
          <div
            key={`${e.ts}-${i}`}
            className={`rounded-lg border bg-card/40 p-3 font-mono text-[11px] ${
              e.kind === "error"
                ? "border-rose-400/30 bg-rose-500/5"
                : "border-border/40"
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <Badge
                variant="outline"
                className={e.kind === "error"
                  ? "border-rose-400/40 text-[9px] text-rose-600"
                  : "border-border text-[9px] text-muted-foreground"}
              >
                {e.kind}
              </Badge>
              <span className="font-semibold">{e.name}</span>
              <span className="ml-auto text-muted-foreground">{fmt(e.ts)}</span>
            </div>
            {e.message && <p className="text-rose-700 dark:text-rose-300">{e.message}</p>}
            {e.context && (
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
                {JSON.stringify(e.context, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
