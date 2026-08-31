import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Hammer, Loader2, Check, ExternalLink, Code, Palette, Globe } from "lucide-react";

interface ForgeProject {
  id: string;
  name: string;
  description: string;
  status: "building" | "done" | "error";
  url?: string;
  files?: string[];
}

const TEMPLATES = [
  { icon: <Globe className="size-4" />, name: "Landing Page", prompt: "Build a beautiful one-page landing site with hero, features, and CTA" },
  { icon: <Code className="size-4" />, name: "Dashboard", prompt: "Build an admin dashboard with charts, tables, and stats cards" },
  { icon: <Palette className="size-4" />, name: "Portfolio", prompt: "Build a personal portfolio site with projects gallery and contact form" },
  { icon: <Hammer className="size-4" />, name: "API Server", prompt: "Build a REST API server with Express, routes, and middleware" },
];

export function AppForge() {
  const [prompt, setPrompt] = useState("");
  const [projects, setProjects] = useState<ForgeProject[]>([]);
  const [building, setBuilding] = useState(false);

  const buildApp = async (description: string) => {
    if (!description.trim() || building) return;
    const project: ForgeProject = {
      id: Date.now().toString(),
      name: description.slice(0, 40),
      description,
      status: "building",
    };
    setProjects((prev) => [project, ...prev]);
    setBuilding(true);
    setPrompt("");

    // Simulate build process
    await new Promise((r) => setTimeout(r, 2500));

    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? { ...p, status: "done" as const, url: "http://localhost:8080", files: ["index.html", "style.css", "app.js"] }
          : p
      )
    );
    setBuilding(false);
  };

  return (
    <div className="space-y-4">
      {/* Build input */}
      <div className="rounded-xl border border-border/70 bg-card/80 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Hammer className="size-4 text-amber-400" />
          <span className="text-sm font-semibold">App Forge</span>
          <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">BETA</span>
        </div>
        <div className="flex gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want to build..."
            rows={2}
            className="flex-1 resize-none rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                buildApp(prompt);
              }
            }}
          />
          <button
            type="button"
            onClick={() => buildApp(prompt)}
            disabled={!prompt.trim() || building}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/40 disabled:opacity-50"
          >
            {building ? <Loader2 className="size-4 animate-spin" /> : <Hammer className="size-4" />}
            Build
          </button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">⌘/Ctrl+Enter to build · Powered by Codex CLI</p>
      </div>

      {/* Quick templates */}
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => {
              setPrompt(t.prompt);
              buildApp(t.prompt);
            }}
            disabled={building}
            className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-3 py-2.5 text-left text-[11px] text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground disabled:opacity-50"
          >
            <span className="text-primary/70">{t.icon}</span>
            {t.name}
          </button>
        ))}
      </div>

      {/* Built projects */}
      <AnimatePresence>
        {projects.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl border border-border/70 bg-card/60 p-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {p.status === "building" && <Loader2 className="size-4 animate-spin text-amber-400" />}
                {p.status === "done" && <Check className="size-4 text-emerald-400" />}
                {p.status === "error" && <span className="size-4 text-center text-red-400">✕</span>}
                <span className="text-sm font-medium">{p.name}</span>
              </div>
              {p.url && (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] text-primary transition-colors hover:bg-primary/20"
                >
                  <ExternalLink className="size-3" /> Open
                </a>
              )}
            </div>
            {p.files && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.files.map((f) => (
                  <span key={f} className="rounded bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
