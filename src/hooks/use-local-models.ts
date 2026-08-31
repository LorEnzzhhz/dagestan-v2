import { useEffect, useState, useCallback } from "react";

/** A model file installed on disk (mirrors /v1/models response). */
export interface LocalModel {
  id: string;            // "owner/repo/filename.gguf"
  repo: string;
  filename: string;
  size_bytes: number;
  sha256: string;
  downloaded_at: string;
}

export interface RepoFile {
  filename: string;
  size: number | null;
  sha256: string | null;
}

export interface DownloadProgress {
  phase: "starting" | "downloading" | "verifying";
  downloaded: number;
  total: number;
  speed_bps: number;
  eta_seconds: number | null;
}

const BASE = "http://127.0.0.1:18927";

/** Probe whether the local-models server is running. */
export async function pingLocalModels(): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1000);
    const r = await fetch(`${BASE}/healthz`, { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

/** Hook that polls /v1/models on a 5s interval. Returns the installed list
 *  and a boolean indicating the server is reachable. */
export function useLocalModels() {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [reachable, setReachable] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/v1/models`);
      if (!r.ok) {
        setReachable(false);
        return;
      }
      const j = await r.json();
      const list: LocalModel[] = (j.data || []).map((m: { id: string; created?: number; dagestan?: { repo?: string; filename?: string; size_bytes?: number; sha256?: string } }) => ({
        id: m.id,
        repo: m.dagestan?.repo ?? "",
        filename: m.dagestan?.filename ?? "",
        size_bytes: m.dagestan?.size_bytes ?? 0,
        sha256: m.dagestan?.sha256 ?? "",
        downloaded_at: new Date((m.created ?? 0) * 1000).toISOString(),
      }));
      setModels(list);
      setReachable(true);
    } catch {
      setReachable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 5000);
    const initial = setTimeout(refresh, 0);
    return () => {
      clearInterval(id);
      clearTimeout(initial);
    };
  }, [refresh]);

  return { models, reachable, loading, refresh };
}

/** Resolve a HF repo's file list. */
export async function resolveRepo(repo: string): Promise<RepoFile[]> {
  const r = await fetch(`${BASE}/v1/models/resolve?repo=${encodeURIComponent(repo)}`);
  if (!r.ok) throw new Error(`resolve ${repo}: HTTP ${r.status}`);
  const j = await r.json();
  return (j.data || []).filter((f: RepoFile) => f.filename.endsWith(".gguf"));
}

/** Stream a model download, returning an AbortController so the caller can cancel.
 *  Calls onProgress for each SSE progress event. */
export function downloadModel(
  repo: string,
  filename: string,
  onProgress: (p: DownloadProgress) => void,
  onDone: (entry: LocalModel) => void,
  onError: (msg: string) => void,
): AbortController {
  const ctrl = new AbortController();
  (async () => {
    try {
      const r = await fetch(`${BASE}/v1/models/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, filename }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        onError(`download failed: HTTP ${r.status}`);
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          let name = "";
          let data = "";
          for (const line of ev.split("\n")) {
            if (line.startsWith("event: ")) name = line.slice(7).trim();
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!data) continue;
          try {
            const payload = JSON.parse(data);
            if (name === "progress") onProgress(payload);
            else if (name === "done") onDone({
              id: payload.id, repo: payload.repo, filename: payload.filename,
              size_bytes: payload.size_bytes, sha256: payload.sha256,
              downloaded_at: payload.downloaded_at,
            });
            else if (name === "error") onError(payload.error || "unknown error");
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      onError((e as Error).message);
    }
  })();
  return ctrl;
}

export async function deleteModel(repo: string, filename: string): Promise<void> {
  const r = await fetch(
    `${BASE}/v1/models/${encodeURIComponent(repo)}/${encodeURIComponent(filename)}`,
    { method: "DELETE" },
  );
  if (!r.ok) throw new Error(`delete failed: HTTP ${r.status}`);
}

/** Format bytes for display: 1.2 GB, 384 MB, etc. */
export function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

/** Active downloads tracked by repo+filename, shared across components. */
const activeDownloads = new Map<string, AbortController>();
export function cancelDownload(key: string) {
  const c = activeDownloads.get(key);
  if (c) { c.abort(); activeDownloads.delete(key); }
}
export function trackDownload(key: string, ctrl: AbortController) {
  activeDownloads.set(key, ctrl);
}
export function untrackDownload(key: string) {
  activeDownloads.delete(key);
}
