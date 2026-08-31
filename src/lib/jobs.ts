/**
 * jobs.ts — Client-side wrapper around the local-models server's
 * /v1/jobs/* namespace.
 *
 * The job system lets long-running work (model downloads, health
 * checks, exports) survive tab reloads and be resumed from any client.
 * A single EventSource per job streams progress + completion events.
 */

const PREFERRED_PORT = 18927;
const PROBE_RANGE = 5;
let cachedPort: number | null = null;
let probePromise: Promise<number> | null = null;

async function discoverPort(): Promise<number> {
  for (let i = 0; i < PROBE_RANGE; i++) {
    const port = PREFERRED_PORT + i;
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 500);
      const r = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: c.signal });
      clearTimeout(t);
      if (r.ok) return port;
    } catch {
      /* keep probing */
    }
  }
  return PREFERRED_PORT;
}

async function baseUrl(): Promise<string> {
  if (cachedPort === null) {
    probePromise ??= discoverPort().then((p) => { cachedPort = p; return p; });
    cachedPort = await probePromise;
  }
  return `http://127.0.0.1:${cachedPort}`;
}

export type JobState = "queued" | "running" | "done" | "failed" | "cancelled";
export type JobKind = "model-download" | "health-check";

export interface Job<TPayload = unknown, TResult = unknown> {
  id: string;
  kind: JobKind | string;
  state: JobState;
  payload: TPayload;
  result?: TResult;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface JobEvent {
  id: string;
  state: JobState;
  /** Progress payload (downloads: {phase, downloaded, total, speed_bps, eta_seconds}) */
  progress?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

/** Start a new job. Returns the created Job record. */
export async function createJob<TPayload extends object, TResult = unknown>(
  kind: JobKind | string,
  payload: TPayload,
): Promise<Job<TPayload, TResult>> {
  const base = await baseUrl();
  const r = await fetch(`${base}/v1/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, payload }),
  });
  if (!r.ok) throw new Error(`createJob failed: HTTP ${r.status}`);
  const j = await r.json();
  return { id: j.id, kind, state: j.state, payload, createdAt: Date.now() } as Job<TPayload, TResult>;
}

/** Get the current state of a job (one-shot poll). */
export async function getJob<TPayload = unknown, TResult = unknown>(
  id: string,
): Promise<Job<TPayload, TResult> | null> {
  const base = await baseUrl();
  const r = await fetch(`${base}/v1/jobs/${id}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`getJob failed: HTTP ${r.status}`);
  return await r.json() as Job<TPayload, TResult>;
}

/** List active jobs. */
export async function listJobs(): Promise<Job[]> {
  const base = await baseUrl();
  const r = await fetch(`${base}/v1/jobs`);
  if (!r.ok) throw new Error(`listJobs failed: HTTP ${r.status}`);
  const j = await r.json();
  return j.jobs ?? [];
}

/** Cancel a job. */
export async function cancelJob(id: string): Promise<boolean> {
  const base = await baseUrl();
  const r = await fetch(`${base}/v1/jobs/${id}`, { method: "DELETE" });
  if (r.status === 404) return false;
  if (!r.ok) throw new Error(`cancelJob failed: HTTP ${r.status}`);
  return true;
}

/** Subscribe to a job's events. Returns an unsubscribe function.
 *  Reconnects automatically on network errors with exponential backoff. */
export function subscribeJob(
  id: string,
  onEvent: (event: JobEvent) => void,
  onError?: (err: Error) => void,
): () => void {
  let stopped = false;
  let backoff = 1_000;
  let es: EventSource | null = null;

  async function connect() {
    if (stopped) return;
    const base = await baseUrl();
    es = new EventSource(`${base}/v1/jobs/${id}/events`);
    es.addEventListener("snapshot", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        onEvent({ id, state: data.state, result: data.result, error: data.error });
        backoff = 1_000;
      } catch { /* malformed */ }
    });
    es.addEventListener("started", (e) => {
      try { onEvent({ id, state: "running", ...JSON.parse((e as MessageEvent).data) }); } catch { /* */ }
    });
    es.addEventListener("progress", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        onEvent({ id, state: "running", progress: data });
      } catch { /* */ }
    });
    es.addEventListener("done", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        onEvent({ id, state: "done", result: data.result });
        backoff = 1_000;
        cleanup();
      } catch { /* */ }
    });
    es.addEventListener("failed", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        onEvent({ id, state: "failed", error: data.error });
        cleanup();
      } catch { /* */ }
    });
    es.addEventListener("cancelled", (e) => {
      try { onEvent({ id, state: "cancelled", ...JSON.parse((e as MessageEvent).data) }); } catch { /* */ }
      cleanup();
    });
    es.onerror = () => {
      onError?.(new Error("EventSource error"));
      cleanup();
      if (!stopped) {
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      }
    };
  }

  function cleanup() {
    if (es) { es.close(); es = null; }
  }

  void connect();
  return () => { stopped = true; cleanup(); };
}
