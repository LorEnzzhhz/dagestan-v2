import { useAuth } from "@/hooks/use-auth";
import { Loader2, WifiOff, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { Button } from "@/components/ui/button";

/** If auth still hasn't resolved after this long, assume connectivity trouble
 *  and offer a retry instead of spinning forever (e.g. offline / backend down). */
const SLOW_AUTH_MS = 10_000;

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setSlow(true), SLOW_AUTH_MS);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [isLoading]);

  if (isLoading) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Loader2
          className={`size-7 text-muted-foreground ${slow ? "" : "animate-spin"}`}
        />
        {slow ? (
          <>
            <div className="max-w-xs space-y-1.5">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
                <WifiOff className="size-4" /> Still connecting…
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Can't reach the Dagestan servers right now. Check your internet
                connection — your on-device data is safe.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </>
        ) : null}
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  return children;
}
