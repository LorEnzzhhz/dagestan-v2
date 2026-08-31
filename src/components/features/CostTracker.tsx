import { DollarSign, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CostEntry {
  model: string;
  tokens: number;
  cost: number;
  timestamp: number;
}

const STORAGE_KEY = "dagestan.costs";
let costs: CostEntry[] = loadCosts();
const listeners = new Set<() => void>();

function loadCosts(): CostEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function trackCost(model: string, tokens: number, cost: number) {
  costs = [...costs, { model, tokens, cost, timestamp: Date.now() }].slice(-500);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(costs));
  } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

export function getTodayCosts(): CostEntry[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return costs.filter((c) => c.timestamp >= today.getTime());
}

export function getSessionStats() {
  const today = getTodayCosts();
  const totalTokens = today.reduce((sum, c) => sum + c.tokens, 0);
  const totalCost = today.reduce((sum, c) => sum + c.cost, 0);
  const messageCount = today.length;
  return { totalTokens, totalCost, messageCount };
}

export function CostTracker() {
  const { totalTokens, messageCount } = getSessionStats();

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <DollarSign className="size-4 text-primary" />
          Session Usage
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/60 p-2 text-center">
            <p className="text-lg font-bold text-primary">$0.00</p>
            <p className="text-[10px] text-muted-foreground">Total Cost</p>
          </div>
          <div className="rounded-lg border border-border/60 p-2 text-center">
            <p className="text-lg font-bold">{totalTokens.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Tokens Used</p>
          </div>
          <div className="rounded-lg border border-border/60 p-2 text-center">
            <p className="text-lg font-bold">{messageCount}</p>
            <p className="text-[10px] text-muted-foreground">Messages</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Zap className="size-3 text-emerald-400" />
          All models on this plan are 100% free — no cost tracking needed!
        </div>
      </CardContent>
    </Card>
  );
}
