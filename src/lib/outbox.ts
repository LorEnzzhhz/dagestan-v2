/**
 * outbox.ts — Persistent offline send queue.
 *
 * When a user taps Send but the network is down (or the chat stream throws
 * a transient network error), we don't lose the message. We enqueue it in
 * IndexedDB and surface a "queued" badge in the UI. A retry worker wakes on:
 *   - the browser `online` event
 *   - `visibilitychange` to visible
 *   - exponential backoff (1s, 5s, 30s, 5m, 30m) — max 5 attempts
 *
 * After 5 failed attempts the item becomes "failed" and shows a manual
 * retry button.
 */

export type OutboxState = "pending" | "sending" | "sent" | "failed";

export interface OutboxItem {
  id: string;            // uuid v4
  chatId: string;
  text: string;
  /** Snapshot of provider+model at enqueue time so we retry against the
   *  same model even if the user changes selection mid-retry. */
  provider: string;
  model: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  state: OutboxState;
  lastError?: string;
}

const DB_NAME = "dagestan.outbox";
const DB_VERSION = 1;
const STORE = "items";
const MAX_ATTEMPTS = 5;

/** Backoff schedule in ms (indexed by attempt count, starting at 0). */
function backoffFor(attempts: number): number {
  const base = [1_000, 5_000, 30_000, 5 * 60_000, 30 * 60_000];
  return base[Math.min(attempts, base.length - 1)] ?? 30 * 60_000;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC4122 v4 fallback (browser env without randomUUID)
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10, 16).join("")}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let result: T;
    Promise.resolve(fn(store))
      .then((r) => { result = r; })
      .catch(reject);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? new Error("IDB tx failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IDB tx aborted"));
  });
}

/** Detect whether an error is transient (worth a retry) vs fatal. */
export function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  if (m.includes("abort")) return false;
  if (m.includes("network")) return true;
  if (m.includes("failed to fetch")) return true;
  if (m.includes("timeout")) return true;
  if (m.includes("503") || m.includes("504") || m.includes("502")) return true;
  if (m.includes("econnreset") || m.includes("etimedout")) return true;
  return false;
}

/** Add a new pending message to the outbox. */
export async function enqueue(input: {
  chatId: string;
  text: string;
  provider: string;
  model: string;
}): Promise<OutboxItem> {
  const item: OutboxItem = {
    id: uuid(),
    chatId: input.chatId,
    text: input.text,
    provider: input.provider,
    model: input.model,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: Date.now(),
    state: "pending",
  };
  await tx("readwrite", (store) => {
    store.put(item);
  });
  return item;
}

/** All items for a chat, sorted oldest first. */
export async function listForChat(chatId: string): Promise<OutboxItem[]> {
  const all = await listAll();
  return all
    .filter((i) => i.chatId === chatId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** All items in the outbox, regardless of chat. */
export async function listAll(): Promise<OutboxItem[]> {
  return tx("readonly", (store) => {
    return new Promise<OutboxItem[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as OutboxItem[]);
      req.onerror = () => reject(req.error ?? new Error("IDB getAll failed"));
    });
  });
}

/** Mark an item as currently being sent (caller must immediately try to
 *  deliver; if delivery succeeds call `markSent`, if it fails call
 *  `markFailed`). */
export async function markSending(id: string): Promise<void> {
  await update(id, (it) => ({ ...it, state: "sending" }));
}

/** Successful delivery — drop the item from the outbox. */
export async function markSent(id: string): Promise<void> {
  await tx("readwrite", (store) => {
    store.delete(id);
  });
}

/** Failed delivery — bump attempt count, schedule next retry, or move to
 *  "failed" state if MAX_ATTEMPTS is exceeded. */
export async function markFailed(id: string, error: string): Promise<OutboxItem | null> {
  let updated: OutboxItem | null = null;
  await update(id, (it) => {
    const attempts = it.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    updated = {
      ...it,
      attempts,
      lastError: error.slice(0, 200),
      state: failed ? "failed" : "pending",
      nextAttemptAt: failed ? it.nextAttemptAt : Date.now() + backoffFor(attempts),
    };
    return updated;
  });
  return updated;
}

/** Manually re-arm a failed item for another round of attempts. */
export async function retry(id: string): Promise<void> {
  await update(id, (it) => ({
    ...it,
    attempts: 0,
    state: "pending",
    nextAttemptAt: Date.now(),
    delete: undefined as never,
    lastError: undefined,
  } as OutboxItem));
}

/** Permanently drop a single item. */
export async function drop(id: string): Promise<void> {
  await tx("readwrite", (store) => {
    store.delete(id);
  });
}

/** Items that are due to retry right now. */
export async function listDue(): Promise<OutboxItem[]> {
  const all = await listAll();
  const now = Date.now();
  return all.filter((it) => it.state === "pending" && it.nextAttemptAt <= now);
}

async function update(id: string, fn: (it: OutboxItem) => OutboxItem): Promise<void> {
  await tx("readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const get = store.get(id);
      get.onsuccess = () => {
        const existing = get.result as OutboxItem | undefined;
        if (!existing) { resolve(); return; }
        const next = fn(existing);
        // Drop `delete` key if retry() added it as a sentinel
        delete (next as unknown as Record<string, unknown>).delete;
        const put = store.put(next);
        put.onsuccess = () => resolve();
        put.onerror = () => reject(put.error ?? new Error("IDB put failed"));
      };
      get.onerror = () => reject(get.error ?? new Error("IDB get failed"));
    });
  });
}

/** Subscribe to outbox changes. Returns an unsubscribe function. */
export function subscribe(handler: () => void): () => void {
  const tick = () => handler();
  window.addEventListener("online", tick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });
  // Light polling so retry timers don't drift
  const id = window.setInterval(tick, 5_000);
  return () => {
    window.removeEventListener("online", tick);
    window.clearInterval(id);
  };
}
