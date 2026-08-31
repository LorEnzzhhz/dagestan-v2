import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Loader2, Trophy, Clock, DollarSign, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { streamChat, type ApiMessage } from "@/lib/ai-client";


interface VoteResult {
  modelId: string;
  modelLabel: string;
  provider: string;
  response: string;
  latency: number;
  tokens: number;
  cost: number;
  error?: string;
}

const VOTE_MODELS = [
  { id: "big-pickle", label: "Big Pickle", provider: "Zen", color: "emerald" },
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3", provider: "OpenRouter", color: "sky" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B", provider: "OpenRouter", color: "violet" },
];

export function MultiModelVoting({ apiKey }: { apiKey?: string }) {
  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState<VoteResult[]>([]);
  const [voting, setVoting] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleVote = useCallback(async () => {
    if (!prompt.trim() || !apiKey) return;
    setVoting(true);
    setResults([]);

    const allResults: VoteResult[] = [];

    await Promise.all(
      VOTE_MODELS.map(async (vm) => {
        const start = Date.now();
        try {
          const messages: ApiMessage[] = [
            { role: "user", content: prompt },
          ];
          let response = "";
          const provider = vm.provider.toLowerCase().replace("opencodex ", "zen").replace("opencode ", "zen");
          for await (const chunk of streamChat({ provider: provider === "openrouter" ? "openrouter" : "zen", model: vm.id, messages })) {
            response += chunk;
          }
          const latency = Date.now() - start;
          const tokens = Math.ceil(response.length / 4);
          allResults.push({
            modelId: vm.id,
            modelLabel: vm.label,
            provider: vm.provider,
            response,
            latency,
            tokens,
            cost: 0, // Free models
          });
        } catch (err) {
          allResults.push({
            modelId: vm.id,
            modelLabel: vm.label,
            provider: vm.provider,
            response: "",
            latency: Date.now() - start,
            tokens: 0,
            cost: 0,
            error: (err as Error).message || "Failed",
          });
        }
      }),
    );

    // Sort by latency (fastest first)
    allResults.sort((a, b) => a.latency - b.latency);
    setResults(allResults);
    setVoting(false);
  }, [prompt, apiKey]);

  const copyResponse = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

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
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask the same question to 3 models..."
            className="min-h-[60px] text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleVote();
            }}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {VOTE_MODELS.map((vm) => (
              <Badge key={vm.id} variant="outline" className="text-[10px]">
                {vm.provider}
              </Badge>
            ))}
          </div>
          <Button
            onClick={handleVote}
            disabled={voting || !prompt.trim() || !apiKey}
            size="sm"
            className="gap-1.5"
          >
            {voting ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Voting...
              </>
            ) : (
              "Vote"
            )}
          </Button>
        </div>

        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              {results.map((r, i) => (
                <div
                  key={r.modelId}
                  className={`relative rounded-lg border p-3 text-xs ${
                    i === 0 && !r.error
                      ? "border-emerald-400/30 bg-emerald-400/5"
                      : "border-border/60"
                  }`}
                >
                  {i === 0 && !r.error && (
                    <div className="absolute -top-2 -right-2">
                      <Badge className="bg-emerald-500 text-[9px]">
                        <Trophy className="size-2.5 mr-1" />
                        Fastest
                      </Badge>
                    </div>
                  )}
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-semibold">{r.modelLabel}</span>
                    <Badge variant="outline" className="text-[9px]">
                      {r.provider}
                    </Badge>
                    <span className="ml-auto flex items-center gap-1 font-mono text-muted-foreground/60">
                      <Clock className="size-2.5" />
                      {r.latency}ms
                    </span>
                    <span className="flex items-center gap-1 font-mono text-muted-foreground/60">
                      <DollarSign className="size-2.5" />
                      $0.00
                    </span>
                  </div>
                  {r.error ? (
                    <p className="text-destructive">{r.error}</p>
                  ) : (
                    <div className="relative">
                      <p className="whitespace-pre-wrap text-muted-foreground line-clamp-6">
                        {r.response}
                      </p>
                      <button
                        onClick={() => copyResponse(r.response, i)}
                        className="absolute top-0 right-0 rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        {copiedIdx === i ? (
                          <Check className="size-3 text-emerald-400" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
