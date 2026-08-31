import { useState, useCallback } from "react";
import { BookOpen, Save, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";


const TEMPLATES = [
  {
    name: "Default",
    prompt: "You are Dagestan, a sharp, warm, no-fluff assistant. Format answers in Markdown. Use code blocks with language tags for code.",
  },
  {
    name: "Code Expert",
    prompt: "You are a senior software engineer. Always provide production-ready code with error handling, types, and comments. Prefer modern patterns. When reviewing code, focus on security, performance, and maintainability.",
  },
  {
    name: "Writing Coach",
    prompt: "You are an elite writing coach. Help improve writing by: 1) Identifying the core message, 2) Strengthening structure, 3) Cutting filler words, 4) Matching the target voice. Always provide a revised version.",
  },
  {
    name: "Math Tutor",
    prompt: "You are a patient math tutor. Explain concepts step-by-step with LaTeX. Use real-world examples. Always verify your answer. If the student is wrong, guide them to the right answer without just giving it.",
  },
  {
    name: "Security Auditor",
    prompt: "You are a security auditor. Review code and systems for vulnerabilities. Check for: SQL injection, XSS, CSRF, auth bypass, secrets in code, insecure defaults. Rate severity (Critical/High/Medium/Low) and provide fixes.",
  },
  {
    name: "Startup Advisor",
    prompt: "You are a startup advisor with 10+ years experience. Give practical, actionable advice. Focus on: MVP scope, user acquisition, monetization, tech decisions. Be direct — no corporate fluff.",
  },
];

interface SystemPromptEditorProps {
  chatId?: string;
  currentPrompt?: string;
  onSave?: (prompt: string) => void;
}

export function SystemPromptEditor({ chatId, currentPrompt, onSave }: SystemPromptEditorProps) {
  const [prompt, setPrompt] = useState(currentPrompt || TEMPLATES[0].prompt);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(() => {
    if (onSave) {
      onSave(prompt);
    } else {
      // Save to localStorage
      const key = chatId ? `dagestan.systemPrompt.${chatId}` : "dagestan.systemPrompt.default";
      try {
        localStorage.setItem(key, prompt);
      } catch { /* private mode */ }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [prompt, chatId, onSave]);

  const handleReset = useCallback(() => {
    setPrompt(TEMPLATES[0].prompt);
  }, []);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BookOpen className="size-4 text-primary" />
          System Prompt
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => setPrompt(t.prompt)}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                prompt === t.prompt
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[100px] font-mono text-xs"
          placeholder="Enter a custom system prompt..."
        />

        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            {prompt.length.toLocaleString()} characters · ~{Math.ceil(prompt.length / 4).toLocaleString()} tokens
          </p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 gap-1" onClick={handleReset}>
              <RotateCcw className="size-3" />
              Reset
            </Button>
            <Button size="sm" className="h-7 gap-1" onClick={handleSave}>
              {saved ? (
                <>
                  <Sparkles className="size-3" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="size-3" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
