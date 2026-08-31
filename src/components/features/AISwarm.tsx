/**
 * AI Swarm — Multi-Agent Parallel Task System
 *
 * User describes a task → Dagestan splits it into subtasks →
 * multiple AI agents work in parallel → results merge into one answer.
 *
 * Uses the existing streaming API to run N concurrent requests
 * with different system prompts (researcher, coder, writer, reviewer).
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Zap, Users, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { streamChat, type ApiMessage } from "@/lib/ai-client";
import { getApiKeys } from "@/lib/store";

type AgentRole = "researcher" | "coder" | "writer" | "reviewer" | "planner";

interface Agent {
  id: string;
  role: AgentRole;
  label: string;
  icon: string;
  color: string;
  prompt: string;
  status: "idle" | "running" | "done" | "error";
  result: string;
}

interface SwarmTask {
  id: string;
  input: string;
  agents: Agent[];
  phase: "idle" | "planning" | "executing" | "merging" | "done";
  mergedResult: string;
  startTime: number;
}

const AGENT_TEMPLATES: Record<AgentRole, { label: string; icon: string; color: string; systemPrompt: string }> = {
  planner: {
    label: "Planner",
    icon: "📋",
    color: "text-sky-500",
    systemPrompt: "You are a task planner. Break down the user's request into 2-4 clear, actionable subtasks. Be specific and concise. Output a numbered list.",
  },
  researcher: {
    label: "Researcher",
    icon: "🔍",
    color: "text-emerald-500",
    systemPrompt: "You are a research specialist. Analyze the task, gather relevant facts, and provide well-sourced findings. Be thorough but concise.",
  },
  coder: {
    label: "Coder",
    icon: "💻",
    color: "text-violet-500",
    systemPrompt: "You are a senior software engineer. Write clean, efficient code for the given task. Include comments and handle edge cases.",
  },
  writer: {
    label: "Writer",
    icon: "✍️",
    color: "text-amber-500",
    systemPrompt: "You are a professional writer. Create clear, engaging content for the given task. Focus on readability and structure.",
  },
  reviewer: {
    label: "Reviewer",
    icon: "🔎",
    color: "text-rose-500",
    systemPrompt: "You are a quality reviewer. Review the work done by other agents, identify issues, suggest improvements, and provide a final quality score.",
  },
};

/**
 * Split a user task into subtasks using the Planner agent.
 */
async function planTask(
  task: string,
  provider: string,
  model: string,
): Promise<string[]> {
  const keys = getApiKeys();
  const apiKey = keys[provider as keyof typeof keys];
  if (!apiKey) throw new Error("No API key");

  const messages: ApiMessage[] = [
    { role: "system", content: AGENT_TEMPLATES.planner.systemPrompt },
    { role: "user", content: task },
  ];

  let result = "";
  for await (const delta of streamChat({ provider, model, messages })) {
    result += delta;
  }

  // Extract numbered items
  const lines = result.split("\n").filter((l) => /^\d+[.)]\s/.test(l.trim()));
  return lines.length > 0 ? lines.map((l) => l.replace(/^\d+[.)]\s*/, "").trim()) : [task];
}

/**
 * Run a single agent on a subtask.
 */
async function runAgent(
  agent: Agent,
  subtask: string,
  provider: string,
  model: string,
  onProgress: (text: string) => void,
): Promise<string> {
  const keys = getApiKeys();
  const apiKey = keys[provider as keyof typeof keys];
  if (!apiKey) throw new Error("No API key");

  const messages: ApiMessage[] = [
    { role: "system", content: agent.prompt },
    { role: "user", content: subtask },
  ];

  let result = "";
  for await (const delta of streamChat({ provider, model, messages })) {
    result += delta;
    onProgress(result);
  }
  return result;
}

/**
 * Merge all agent results into a final answer.
 */
async function mergeResults(
  task: string,
  agentResults: { role: AgentRole; result: string }[],
  provider: string,
  model: string,
): Promise<string> {
  const keys = getApiKeys();
  const apiKey = keys[provider as keyof typeof keys];
  if (!apiKey) throw new Error("No API key");

  const summary = agentResults
    .map((r) => `## ${AGENT_TEMPLATES[r.role].label}\n${r.result}`)
    .join("\n\n---\n\n");

  const messages: ApiMessage[] = [
    {
      role: "system",
      content: "You are a synthesis expert. Merge the following agent outputs into one coherent, comprehensive response. Remove redundancy, resolve conflicts, and present the best version. Use markdown formatting.",
    },
    { role: "user", content: `Original task: ${task}\n\nAgent outputs:\n${summary}` },
  ];

  let result = "";
  for await (const delta of streamChat({ provider, model, messages })) {
    result += delta;
  }
  return result;
}

// ── React Component ──────────────────────────────────────────────────────────

interface SwarmProps {
  provider: string;
  model: string;
  onResult?: (result: string) => void;
}

export function AISwarm({ provider, model, onResult }: SwarmProps) {
  const [task, setTask] = useState("");
  const [swarm, setSwarm] = useState<SwarmTask | null>(null);
  const [busy, setBusy] = useState(false);

  const startSwarm = useCallback(async () => {
    if (!task.trim() || busy) return;
    setBusy(true);

    const swarmTask: SwarmTask = {
      id: `swarm-${Date.now()}`,
      input: task,
      agents: [],
      phase: "planning",
      mergedResult: "",
      startTime: Date.now(),
    };
    setSwarm(swarmTask);

    try {
      // Phase 1: Plan
      const subtasks = await planTask(task, provider, model);

      // Create agents for each subtask
      const roles: AgentRole[] = ["researcher", "coder", "writer", "reviewer"];
      const agents: Agent[] = subtasks.slice(0, 4).map((st, i) => ({
        id: `agent-${i}`,
        role: roles[i % roles.length],
        label: AGENT_TEMPLATES[roles[i % roles.length]].label,
        icon: AGENT_TEMPLATES[roles[i % roles.length]].icon,
        color: AGENT_TEMPLATES[roles[i % roles.length]].color,
        prompt: AGENT_TEMPLATES[roles[i % roles.length]].systemPrompt,
        status: "idle" as const,
        result: "",
      }));

      setSwarm((prev) => prev ? { ...prev, agents, phase: "executing" } : null);

      // Phase 2: Execute agents in parallel
      const agentPromises = agents.map((agent, i) => {
        const subtask = subtasks[i] || task;
        return runAgent(
          { ...agent, prompt: agent.prompt },
          subtask,
          provider,
          model,
          (progress) => {
            setSwarm((prev) => {
              if (!prev) return null;
              const updated = [...prev.agents];
              updated[i] = { ...updated[i], result: progress, status: "running" };
              return { ...prev, agents: updated };
            });
          },
        ).then((result) => {
          setSwarm((prev) => {
            if (!prev) return null;
            const updated = [...prev.agents];
            updated[i] = { ...updated[i], result, status: "done" };
            return { ...prev, agents: updated };
          });
          return { role: agent.role, result };
        }).catch((err) => {
          setSwarm((prev) => {
            if (!prev) return null;
            const updated = [...prev.agents];
            updated[i] = { ...updated[i], status: "error", result: `Error: ${err.message}` };
            return { ...prev, agents: updated };
          });
          return { role: agent.role, result: `Error: ${err.message}` };
        });
      });

      const results = await Promise.all(agentPromises);

      // Phase 3: Merge
      setSwarm((prev) => prev ? { ...prev, phase: "merging" } : null);
      const merged = await mergeResults(task, results, provider, model);

      setSwarm((prev) => prev ? { ...prev, phase: "done", mergedResult: merged } : null);
      onResult?.(merged);
    } catch (err) {
      setSwarm((prev) => prev ? { ...prev, phase: "done", mergedResult: `Swarm error: ${(err as Error).message}` } : null);
    } finally {
      setBusy(false);
    }
  }, [task, provider, model, busy, onResult]);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="size-4 text-primary" />
          AI Swarm
          <Badge variant="outline" className="text-[9px]">Multi-Agent</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Describe a complex task — AI Swarm will split it across multiple agents working in parallel..."
          className="min-h-[80px] text-sm"
        />

        <Button
          onClick={startSwarm}
          disabled={!task.trim() || busy}
          className="w-full gap-2"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          {busy ? "Swarm running..." : "Launch Swarm"}
        </Button>

        {/* Agent status */}
        <AnimatePresence>
          {swarm && swarm.agents.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">Phase:</span>
                <Badge variant="outline" className="text-[9px]">
                  {swarm.phase === "planning" && "📋 Planning..."}
                  {swarm.phase === "executing" && "⚡ Executing..."}
                  {swarm.phase === "merging" && "🔗 Merging..."}
                  {swarm.phase === "done" && "✅ Done"}
                </Badge>
                <span className="ml-auto font-mono text-[10px]">
                  {Math.round((Date.now() - swarm.startTime) / 1000)}s
                </span>
              </div>

              {swarm.agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-2 rounded-lg border border-border/60 p-2"
                >
                  <span className="text-sm">{agent.icon}</span>
                  <span className={`text-xs font-medium ${agent.color}`}>{agent.label}</span>
                  <span className="ml-auto">
                    {agent.status === "idle" && <span className="text-[10px] text-muted-foreground">waiting</span>}
                    {agent.status === "running" && <Loader2 className="size-3 animate-spin text-primary" />}
                    {agent.status === "done" && <Check className="size-3 text-emerald-500" />}
                    {agent.status === "error" && <span className="text-[10px] text-destructive">error</span>}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Merged result */}
        {swarm?.phase === "done" && swarm.mergedResult && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="size-3 text-primary" />
              <span className="text-xs font-semibold text-primary">Swarm Result</span>
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{swarm.mergedResult}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
