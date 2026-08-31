import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fmtBytes,
  useLocalModels,
  resolveRepo,
  downloadModel,
  deleteModel,
  cancelDownload,
  trackDownload,
  untrackDownload,
  type RepoFile,
  type DownloadProgress,
  type LocalModel,
} from "@/hooks/use-local-models";

// Curated HF repos with small, phone-friendly GGUF files. The user can
// also type any `owner/repo` to resolve its GGUFs on demand.
const FEATURED_REPOS: Array<{ repo: string; label: string; blurb: string; tag?: string }> = [
  {
    repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    label: "Qwen 2.5 0.5B Instruct",
    blurb: "Tiny general-purpose chat model. ~400 MB. Great on phones.",
    tag: "STARTER",
  },
  {
    repo: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    label: "Qwen 2.5 1.5B Instruct",
    blurb: "Step up in quality. ~1 GB.",
    tag: "RECOMMENDED",
  },
  {
    repo: "microsoft/Phi-3.5-mini-instruct-GGUF",
    label: "Phi-3.5 Mini Instruct",
    blurb: "Microsoft's compact reasoning model. ~2.3 GB.",
  },
  {
    repo: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    label: "Llama 3.2 3B Instruct",
    blurb: "Meta's small but capable chat model. ~2 GB.",
  },
];

interface DownloadState {
  phase: "starting" | "downloading" | "verifying" | "done" | "error";
  downloaded: number;
  total: number;
  speed_bps: number;
  eta_seconds: number | null;
  error?: string;
  model?: LocalModel;
}

function emptyDownload(): DownloadState {
  return { phase: "starting", downloaded: 0, total: 0, speed_bps: 0, eta_seconds: null };
}

export function LocalModelsBrowser() {
  const { models, reachable, loading, refresh } = useLocalModels();
  const [repoQuery, setRepoQuery] = useState("");
  const [resolving, setResolving] = useState(false);
  const [files, setFiles] = useState<RepoFile[] | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolvingRepo, setResolvingRepo] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  const resolve = useCallback(async (repo: string) => {
    setResolving(true);
    setResolvingRepo(repo);
    setResolveError(null);
    setFiles(null);
    try {
      const list = await resolveRepo(repo);
      setFiles(list);
    } catch (e) {
      setResolveError((e as Error).message);
    } finally {
      setResolving(false);
      setResolvingRepo(null);
    }
  }, []);

  const onDownload = useCallback(
    (repo: string, filename: string) => {
      const key = `${repo}/${filename}`;
      setDownloads((m) => ({ ...m, [key]: emptyDownload() }));
      const ctrl = downloadModel(
        repo,
        filename,
        (p: DownloadProgress) =>
          setDownloads((m) => ({
            ...m,
            [key]: {
              phase: p.phase,
              downloaded: p.downloaded,
              total: p.total,
              speed_bps: p.speed_bps,
              eta_seconds: p.eta_seconds,
            },
          })),
        (entry) => {
          setDownloads((m) => ({
            ...m,
            [key]: { phase: "done", downloaded: 0, total: 0, speed_bps: 0, eta_seconds: null, model: entry },
          }));
          untrackDownload(key);
          void refresh();
        },
        (msg) => {
          setDownloads((m) => ({
            ...m,
            [key]: { phase: "error", downloaded: 0, total: 0, speed_bps: 0, eta_seconds: null, error: msg },
          }));
          untrackDownload(key);
        },
      );
      trackDownload(key, ctrl);
    },
    [refresh],
  );

  const onCancel = useCallback((repo: string, filename: string) => {
    const key = `${repo}/${filename}`;
    cancelDownload(key);
    setDownloads((m) => {
      const cp = { ...m };
      delete cp[key];
      return cp;
    });
  }, []);

  const onDelete = useCallback(
    async (repo: string, filename: string) => {
      const key = `${repo}/${filename}`;
      setDeleting(key);
      try {
        await deleteModel(repo, filename);
        await refresh();
      } finally {
        setDeleting(null);
      }
    },
    [refresh],
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = repoQuery.trim();
      if (!q) return;
      void resolve(q);
    },
    [repoQuery, resolve],
  );

  const installedIds = useMemo(
    () => new Set(models.map((m) => `${m.repo}/${m.filename}`)),
    [models],
  );

  return (
    <div className="space-y-4">
      {/* Server status banner */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
          reachable
            ? "border-emerald-400/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
            : "border-amber-400/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
        )}
      >
        {reachable ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
        <span className="font-medium">
          Local-models server: {reachable ? "online" : "offline"}
        </span>
        <span className="text-muted-foreground">
          {reachable
            ? `(${models.length} installed)`
            : "Start with `npm run local-models` to enable downloads."}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          aria-label="Refresh installed models"
          disabled={loading}
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Search any HF repo */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={repoQuery}
            onChange={(e) => setRepoQuery(e.target.value)}
            placeholder="owner/repo (e.g. TheBloke/Llama-2-7B-Chat-GGUF)"
            className="h-9 pl-8 text-xs"
            disabled={!reachable}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={!reachable || resolving || !repoQuery.trim()}
        >
          {resolving ? <Loader2 className="size-3 animate-spin" /> : "Resolve"}
        </Button>
      </form>

      {/* Resolved file list */}
      <AnimatePresence>
        {files && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border border-border/60 bg-card/40 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium">
                {files.length} GGUF file{files.length === 1 ? "" : "s"} found
              </span>
              <button
                type="button"
                onClick={() => setFiles(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
            {files.length === 0 && (
              <div className="text-xs text-muted-foreground">
                No .gguf files in this repo.
              </div>
            )}
            <div className="space-y-1.5">
              {files.map((f) => {
                const repo = resolvingRepo ?? repoQuery.trim();
                const key = `${repo}/${f.filename}`;
                const installed = installedIds.has(key);
                const dl = downloads[key];
                return (
                  <FileRow
                    key={f.filename}
                    file={f}
                    repo={repo}
                    installed={installed}
                    download={dl}
                    deleting={deleting === key}
                    onDownload={onDownload}
                    onCancel={onCancel}
                    onDelete={onDelete}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {resolveError && (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
          {resolveError}
        </div>
      )}

      {/* Featured repos */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Featured
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {FEATURED_REPOS.map((r) => (
            <Card key={r.repo} className="border-border/60 bg-card/40">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm">{r.label}</CardTitle>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {r.repo}
                    </div>
                  </div>
                  {r.tag && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px]",
                        r.tag === "RECOMMENDED"
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {r.tag}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs leading-5 text-muted-foreground">{r.blurb}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  disabled={!reachable || resolving}
                  onClick={() => void resolve(r.repo)}
                >
                  {resolving && resolvingRepo === r.repo ? (
                    <>
                      <Loader2 className="mr-1.5 size-3 animate-spin" /> Resolving…
                    </>
                  ) : (
                    <>Browse files</>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Installed list */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Installed
          </div>
          <span className="text-[10px] text-muted-foreground">{models.length} model{models.length === 1 ? "" : "s"}</span>
        </div>
        {models.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-card/20 p-6 text-center text-xs text-muted-foreground">
            No local models installed yet. Resolve a repo above and tap Download.
          </div>
        ) : (
          <div className="space-y-1.5">
            {models.map((m) => {
              const key = `${m.repo}/${m.filename}`;
              return (
                <FileRow
                  key={m.id}
                  file={{
                    filename: m.filename,
                    size: m.size_bytes,
                    sha256: m.sha256,
                  }}
                  repo={m.repo}
                  installed
                  download={downloads[key]}
                  deleting={deleting === key}
                  onDownload={onDownload}
                  onCancel={onCancel}
                  onDelete={onDelete}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface FileRowProps {
  file: RepoFile;
  repo: string;
  installed: boolean;
  download?: DownloadState;
  deleting: boolean;
  onDownload: (repo: string, filename: string) => void;
  onCancel: (repo: string, filename: string) => void;
  onDelete: (repo: string, filename: string) => void;
}

function FileRow({
  file,
  repo,
  installed,
  download,
  deleting,
  onDownload,
  onCancel,
  onDelete,
}: FileRowProps) {
  const pct = download && download.total > 0
    ? Math.round((download.downloaded / download.total) * 100)
    : 0;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5">
      <HardDrive className="size-3.5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium">{file.filename}</span>
          {file.size && (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {fmtBytes(file.size)}
            </span>
          )}
          {installed && (
            <Badge variant="outline" className="border-emerald-400/30 text-[9px] text-emerald-600 dark:text-emerald-300">
              INSTALLED
            </Badge>
          )}
        </div>
        {download && download.phase !== "done" && download.phase !== "error" && (
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border/60">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-400 to-violet-400"
                style={{ width: `${pct}%` }}
                transition={{ ease: "linear" }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {pct}%
              {download.eta_seconds !== null && ` · ${Math.max(0, Math.round(download.eta_seconds))}s`}
            </span>
          </div>
        )}
        {download?.phase === "error" && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-rose-500">
            <XCircle className="size-3" /> {download.error}
          </div>
        )}
        {download?.phase === "done" && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-300">
            <CheckCircle2 className="size-3" /> Installed
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!installed && !download && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            onClick={() => onDownload(repo, file.filename)}
          >
            <Download className="mr-1 size-3" /> Download
          </Button>
        )}
        {download && download.phase !== "done" && download.phase !== "error" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => onCancel(repo, file.filename)}
          >
            Cancel
          </Button>
        )}
        {installed && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-rose-500 hover:text-rose-500"
            disabled={deleting}
            onClick={() => void onDelete(repo, file.filename)}
          >
            {deleting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
