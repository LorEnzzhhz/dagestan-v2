import { useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Copy,
  Check,
  FileText,
  Code,
  FileImage,
  BarChart3,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { Message } from "@/lib/store";

// -------------------------------------------------------------------
// Export Chat as Markdown
// -------------------------------------------------------------------
export function ExportChatDialog({
  messages,
  chatTitle,
}: {
  messages: Message[];
  chatTitle: string;
}) {
  const [copied, setCopied] = useState(false);

  const toMarkdown = useCallback(() => {
    const lines: string[] = [
      `# ${chatTitle}`,
      "",
      `> Exported from Dagestan on ${new Date().toLocaleDateString()}`,
      "",
      "---",
      "",
    ];
    for (const msg of messages) {
      const role = msg.role === "user" ? "**You**" : "**AI**";
      const model = msg.model ? ` (${msg.model})` : "";
      lines.push(`### ${role}${model}`);
      lines.push("");
      lines.push(msg.content);
      lines.push("");
      lines.push("---");
      lines.push("");
    }
    return lines.join("\n");
  }, [messages, chatTitle]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(toMarkdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [toMarkdown]);

  const handleDownload = useCallback(() => {
    const md = toMarkdown();
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chatTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [toMarkdown, chatTitle]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 h-8">
          <Download className="size-3.5" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            Export Chat
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{messages.length} messages</Badge>
            <Badge variant="outline">Markdown</Badge>
          </div>
          <pre className="scrollbar-slim max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-secondary/30 p-3 font-mono text-xs leading-relaxed">
            {toMarkdown()}
          </pre>
          <div className="flex gap-2">
            <Button onClick={handleCopy} variant="outline" className="gap-1.5">
              {copied ? (
                <Check className="size-3.5 text-emerald-400" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "Copied!" : "Copy"}
            </Button>
            <Button onClick={handleDownload} className="gap-1.5">
              <Download className="size-3.5" />
              Download .md
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------------
// Token Counter (estimates ~4 chars per token)
// -------------------------------------------------------------------
export function TokenCounter({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const tokens = Math.ceil(content.length / 4);
  return (
    <span className={className ?? "text-[10px] font-mono text-muted-foreground/60"}>
      ~{tokens.toLocaleString()} tokens
    </span>
  );
}

// -------------------------------------------------------------------
// Multi-Model Voting — send same prompt to N models, compare
// -------------------------------------------------------------------
interface VoteResult {
  model: string;
  provider: string;
  response: string;
  latency: number;
}

export function MultiModelVoting({
  onSendToModel,
}: {
  onSendToModel: (model: string, prompt: string) => Promise<string>;
}) {
  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState<VoteResult[]>([]);
  const [voting, setVoting] = useState(false);

  // useMemo with empty deps so the downstream useCallback deps don't change on every render.
  const voteModels = useMemo(
    () => [
      { model: "big-pickle", provider: "Zen", color: "emerald" },
      { model: "deepseek/deepseek-chat-v3-0324:free", provider: "OpenRouter", color: "sky" },
      { model: "meta/llama-3.3-70b-instruct:free", provider: "OpenRouter", color: "violet" },
    ],
    [],
  );

  const handleVote = useCallback(async () => {
    if (!prompt.trim()) return;
    setVoting(true);
    setResults([]);
    const allResults: VoteResult[] = [];

    await Promise.all(
      voteModels.map(async (vm) => {
        const start = Date.now();
        try {
          const response = await onSendToModel(vm.model, prompt);
          allResults.push({
            model: vm.model,
            provider: vm.provider,
            response,
            latency: Date.now() - start,
          });
        } catch {
          allResults.push({
            model: vm.model,
            provider: vm.provider,
            response: "Error: failed to get response",
            latency: Date.now() - start,
          });
        }
      }),
    );

    setResults(allResults);
    setVoting(false);
  }, [prompt, onSendToModel, voteModels]);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Layers className="size-4 text-primary" />
          Multi-Model Vote
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask the same question to 3 models..."
            className="flex-1 rounded-lg border border-border/70 bg-secondary/30 px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleVote()}
          />
          <Button onClick={handleVote} disabled={voting || !prompt.trim()} className="gap-1.5">
            {voting ? "Voting..." : "Vote"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {voteModels.map((vm) => (
            <Badge key={vm.model} variant="outline" className="text-[10px]">
              {vm.provider}
            </Badge>
          ))}
        </div>
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              {results
                .sort((a, b) => a.latency - b.latency)
                .map((r, i) => (
                  <div
                    key={r.model}
                    className={`rounded-lg border p-3 text-xs ${
                      i === 0
                        ? "border-emerald-400/30 bg-emerald-400/5"
                        : "border-border/60"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-semibold">{r.provider}</span>
                      <span className="font-mono text-muted-foreground">{r.model.split("/").pop()}</span>
                      <span className="ml-auto font-mono text-muted-foreground/60">{r.latency}ms</span>
                      {i === 0 && <Badge className="text-[9px]">Fastest</Badge>}
                    </div>
                    <p className="whitespace-pre-wrap text-muted-foreground line-clamp-4">
                      {r.response}
                    </p>
                  </div>
                ))}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------------
// Code Execution Sandbox
// -------------------------------------------------------------------
export function CodeSandbox({ onRun }: { onRun: (code: string, lang: string) => Promise<string> }) {
  const [code, setCode] = useState("");
  const [lang, setLang] = useState("python");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  const handleRun = useCallback(async () => {
    if (!code.trim()) return;
    setRunning(true);
    setOutput("Running...");
    try {
      const result = await onRun(code, lang);
      setOutput(result);
    } catch (err) {
      setOutput(`Error: ${(err as Error).message}`);
    }
    setRunning(false);
  }, [code, lang, onRun]);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Code className="size-4 text-primary" />
          Code Sandbox
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="rounded-lg border border-border/70 bg-secondary/30 px-2 py-1.5 text-xs"
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="bash">Bash</option>
          </select>
          <Button onClick={handleRun} disabled={running || !code.trim()} size="sm" className="gap-1.5">
            {running ? "Running..." : "Run"}
          </Button>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={`Write ${lang} code here...`}
          className="scrollbar-slim h-24 w-full resize-none rounded-lg border border-border/70 bg-secondary/30 p-2 font-mono text-xs"
          spellCheck={false}
        />
        {output && (
          <pre className="scrollbar-slim max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-black/20 p-2 font-mono text-xs text-emerald-400">
            {output}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------------
// File Analysis
// -------------------------------------------------------------------
export function FileAnalysis({
  onAnalyze,
}: {
  onAnalyze: (file: File, question: string) => Promise<string>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("Summarize this file");
  const [result, setResult] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    setAnalyzing(true);
    setResult("Analyzing...");
    try {
      const r = await onAnalyze(file, question);
      setResult(r);
    } catch (err) {
      setResult(`Error: ${(err as Error).message}`);
    }
    setAnalyzing(false);
  }, [file, question, onAnalyze]);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileImage className="size-4 text-primary" />
          File Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 p-4 transition-colors hover:border-primary/40"
        >
          {file ? (
            <Badge variant="outline">{file.name} ({(file.size / 1024).toFixed(1)}KB)</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Click to select a file</span>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What do you want to know?"
            className="flex-1 rounded-lg border border-border/70 bg-secondary/30 px-3 py-1.5 text-xs"
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
          />
          <Button onClick={handleAnalyze} disabled={analyzing || !file} size="sm">
            {analyzing ? "..." : "Analyze"}
          </Button>
        </div>
        {result && (
          <pre className="scrollbar-slim max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-secondary/30 p-2 text-xs leading-relaxed">
            {result}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------------
// Theme Builder
// -------------------------------------------------------------------
export function ThemeBuilder() {
  const [accent, setAccent] = useState(
    () => localStorage.getItem("dagestan.accent") || "#34d399"
  );
  const [radius, setRadius] = useState(
    () => localStorage.getItem("dagestan.radius") || "0.75"
  );

  const presets = [
    { label: "Emerald", color: "#34d399" },
    { label: "Sky", color: "#38bdf8" },
    { label: "Violet", color: "#a78bfa" },
    { label: "Rose", color: "#fb7185" },
    { label: "Amber", color: "#fbbf24" },
    { label: "Cyan", color: "#22d3ee" },
  ];

  const applyAccent = (color: string) => {
    setAccent(color);
    localStorage.setItem("dagestan.accent", color);
    document.documentElement.style.setProperty("--primary", color);
  };

  const applyRadius = (r: string) => {
    setRadius(r);
    localStorage.setItem("dagestan.radius", r);
    document.documentElement.style.setProperty("--radius", r + "rem");
  };

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BarChart3 className="size-4 text-primary" />
          Theme Builder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Accent Color</p>
          <div className="flex gap-2">
            {presets.map((p) => (
              <button
                key={p.color}
                onClick={() => applyAccent(p.color)}
                className={`size-8 rounded-full border-2 transition-transform hover:scale-110 ${
                  accent === p.color ? "border-white scale-110" : "border-transparent"
                }`}
                style={{ background: p.color }}
                title={p.label}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Border Radius</p>
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.125"
            value={radius}
            onChange={(e) => applyRadius(e.target.value)}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground">{radius}rem</p>
        </div>
      </CardContent>
    </Card>
  );
}
