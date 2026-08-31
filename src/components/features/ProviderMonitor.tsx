import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Plus, Minus, Wifi, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAllProviderStatuses,
  PROVIDER_INFO,
  type ProviderId,
  type ProviderStatus,
} from "@/lib/smart-models";

interface ProviderMonitorProps {
  onRefresh?: () => void;
}

export function ProviderMonitor({ onRefresh }: ProviderMonitorProps) {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [showChanges, setShowChanges] = useState<ProviderId | null>(null);

  const refresh = useCallback(() => {
    setRefreshing(true);
    // Simulate checking providers
    setTimeout(() => {
      setStatuses(getAllProviderStatuses());
      setLastRefresh(new Date());
      setRefreshing(false);
      onRefresh?.();
    }, 1000);
  }, [onRefresh]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // Auto-refresh every 5 minutes
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const totalFree = statuses.reduce((sum, s) => sum + s.freeModels, 0);
  const totalModels = statuses.reduce((sum, s) => sum + s.totalModels, 0);
  const allChanges = statuses.flatMap((s) => s.changes);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wifi className="size-4 text-primary" />
            Provider Monitor
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={refresh}
              disabled={refreshing}
            >
              <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/60 p-2 text-center">
            <p className="text-lg font-bold text-primary">{totalFree}</p>
            <p className="text-[10px] text-muted-foreground">Free Models</p>
          </div>
          <div className="rounded-lg border border-border/60 p-2 text-center">
            <p className="text-lg font-bold">{totalModels}</p>
            <p className="text-[10px] text-muted-foreground">Total Models</p>
          </div>
          <div className="rounded-lg border border-border/60 p-2 text-center">
            <p className="text-lg font-bold">{allChanges.length}</p>
            <p className="text-[10px] text-muted-foreground">Changes</p>
          </div>
        </div>

        {/* Provider cards */}
        <div className="space-y-2">
          {statuses.map((status) => {
            const info = PROVIDER_INFO[status.provider];
            return (
              <motion.div
                key={status.provider}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-border/60 p-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${
                        status.status === "healthy"
                          ? "bg-emerald-400"
                          : status.status === "degraded"
                            ? "bg-amber-400"
                            : "bg-red-400"
                      }`}
                    />
                    <span className="text-xs font-semibold">{info.label}</span>
                    <Badge variant="outline" className={`text-[8px] ${info.badgeColor}`}>
                      {info.badge}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{status.freeModels} free</span>
                    <span>·</span>
                    <span>{status.totalModels} total</span>
                  </div>
                </div>

                {status.changes.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() =>
                        setShowChanges(showChanges === status.provider ? null : status.provider)
                      }
                      className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <TrendingUp className="size-3" />
                      {status.changes.length} change{status.changes.length > 1 ? "s" : ""} detected
                    </button>

                    <AnimatePresence>
                      {showChanges === status.provider && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="mt-2 space-y-1 overflow-hidden"
                        >
                          {status.changes.map((change, i) => (
                            <div
                              key={`${change.modelId}-${i}`}
                              className="flex items-center gap-2 rounded bg-secondary/50 px-2 py-1 text-[10px]"
                            >
                              {change.type === "added" ? (
                                <Plus className="size-3 text-emerald-400" />
                              ) : change.type === "removed" ? (
                                <Minus className="size-3 text-red-400" />
                              ) : (
                                <RefreshCw className="size-3 text-amber-400" />
                              )}
                              <span className="font-medium">{change.modelLabel}</span>
                              <span className="text-muted-foreground">{change.details}</span>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Auto-refresh note */}
        <p className="text-center text-[9px] text-muted-foreground/60">
          Auto-refreshes every 5 minutes · Free models are always up-to-date
        </p>
      </CardContent>
    </Card>
  );
}
