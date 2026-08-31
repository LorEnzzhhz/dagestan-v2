/**
 * telemetry.ts — Local-first telemetry buffer + optional upload.
 *
 * Events are buffered in IndexedDB. Two categories:
 *  - "error": unhandled exceptions, failed network calls, render errors.
 *    ON by default. No message content included.
 *  - "usage": model selection, chat length, skill toggles, etc.
 *    OFF by default. Never includes message text or PII.
 *
 * Upload is gated by a user toggle. Without it, events stay local and
 * are only visible via `?debug=1`.
 */

export type TelemetryKind = "error" | "usage";

export interface TelemetryEvent {
  id?: number;
  ts: number;
  kind: TelemetryKind;
  name: string;        // short label, e.g. "model_unhealthy", "skill_toggle"
  message?: string;
  context?: Record<string, unknown>;
}

const DB_NAME = "dagestan.telemetry";
const STORE = "events";
const MAX_BUFFER = 500;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("ts", "ts");
        store.createIndex("kind", "kind");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
  return dbPromise;
}

async function put(ev: TelemetryEvent): Promise<void> {
  try {
    const db = await openDb();
    return await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      // Trim oldest events if we'd exceed the buffer cap.
      const countReq = store.count();
      countReq.onsuccess = () => {
        const count = countReq.result;
        if (count >= MAX_BUFFER) {
          const trim = MAX_BUFFER - count - 1;
          // Delete the oldest `trim` rows by reading in key order and removing them.
          const cursorReq = store.openCursor();
          let deleted = 0;
          cursorReq.onsuccess = () => {
            const cur = cursorReq.result;
            if (deleted < -trim && cur) {
              cur.delete();
              deleted++;
              cur.continue();
            }
          };
        }
        const addReq = store.add(ev);
        addReq.onsuccess = () => resolve();
        addReq.onerror = () => reject(addReq.error);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  } catch {
    /* IDB unavailable — silent */
  }
}

/** Log an error event. Safe to call from anywhere — never throws. */
export function logError(name: string, message?: string, context?: Record<string, unknown>): void {
  void put({
    ts: Date.now(),
    kind: "error",
    name,
    message: message?.slice(0, 500),
    context: context ? scrubContext(context) : undefined,
  });
}

/** Log a usage event. Safe to call from anywhere — never throws. */
export function logUsage(name: string, context?: Record<string, unknown>): void {
  void put({
    ts: Date.now(),
    kind: "usage",
    name,
    context: context ? scrubContext(context) : undefined,
  });
}

/** Strip anything that looks like message content or PII before storing. */
function scrubContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (/(message|content|prompt|text|email|api[_-]?key|secret|token)/i.test(k)) {
      out[k] = "<redacted>";
    } else if (typeof v === "string") {
      out[k] = v.slice(0, 200);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (v && typeof v === "object") {
      out[k] = scrubContext(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Read all events for the Debug viewer. */
export async function listEvents(): Promise<TelemetryEvent[]> {
  try {
    const db = await openDb();
    return await new Promise<TelemetryEvent[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const all = (req.result as TelemetryEvent[]).sort((a, b) => b.ts - a.ts);
        resolve(all);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Wipe all buffered telemetry. */
export async function clearEvents(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* silent */
  }
}

/** Install global error + unhandledrejection listeners. Idempotent. */
let installed = false;
export function installGlobalHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    logError("window.error", e.message, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    logError("unhandledrejection", reason);
  });
}
