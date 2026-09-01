/**
 * DroidBridge — the JavaScript interface injected by the Android WebView.
 * Every component that calls droid.run() should import from here instead of
 * redeclaring the interface locally.
 */

export interface DroidBridge {
  run: (cmd: string) => string;
  submit?: (cmd: string) => string;
  job?: (id: string) => string;
  killJob?: (id: string) => void;
  /** Managed-server control (Services page). Returns JSON state strings. */
  serverState?: (id: string) => string;
  startServer?: (id: string) => string;
  stopServer?: (id: string) => string;
}

export interface DroidServerState {
  id: string;
  state: "idle" | "starting" | "stopping" | "running" | "error" | "unknown";
  running: boolean;
  port: number;
  error: string | null;
}

/** Parse a DroidBridge serverState() JSON payload defensively. */
export function parseServerState(raw: string | undefined | null): DroidServerState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DroidServerState>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      id: String(parsed.id ?? ""),
      state: (parsed.state as DroidServerState["state"]) ?? "unknown",
      running: Boolean(parsed.running),
      port: Number(parsed.port ?? 0),
      error: typeof parsed.error === "string" ? parsed.error : null,
    };
  } catch {
    return null;
  }
}

/**
 * Get the Android WebView bridge if running inside the Dagestan APK.
 * Returns null in a normal browser (Freebuff preview, Chrome, etc.).
 */
export function getDroid(): DroidBridge | null {
  try {
    const w = window as unknown as Record<string, unknown>;
    const droid = (w.DagestanDroid ?? w.PrismDroid) as DroidBridge | undefined;
    return droid && typeof droid.run === "function" ? droid : null;
  } catch {
    return null;
  }
}
