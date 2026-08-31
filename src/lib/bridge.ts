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
