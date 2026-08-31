import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { streamChatWithFallback, type ApiMessage } from "@/lib/model-router";
import * as db from "@/lib/db";
import { getDroid } from "@/lib/bridge";
import { buildSystemPrompt, useSkills } from "@/hooks/use-skills";
import { buildMemoryContext, extractFactsFromTurn } from "@/lib/memory";
import { deepSearch, detectQueryDomains } from "@/lib/web-search";
import { buildDeviceContext } from "@/lib/device-info";
import { useChatStore } from "@/stores/chat-store"

type MessageRow = {
  _id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string | null;
  createdAt?: number;
};

const MAX_TOOL_ROUNDS = Infinity;
const RUN_RE = /```[ \t]*run[ \t]*\r?\n([\s\S]*?)```/g;

function extractRunCommands(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(RUN_RE)) {
    const cmd = m[1].trim();
    if (cmd) out.push(cmd);
  }
  return out;
}

function stripRunBlocks(text: string): string {
  return text.replace(RUN_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useChatStream(chatId: string | undefined) {
  const navigate = useNavigate();
  const droid = getDroid();
  const { enabled: skills } = useSkills();
  
  const {
    phase,
    setPhase,
    selection,
    setSelection,
    streamText,
    setStreamText,
    thinkingMode,
    setThinkingMode,
    error,
    setError,
    sources,
    setSources,
  } = useChatStore();

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [devices, setDevices] = useState<db.AgentDevice[]>(() => db.listDevices());
  
  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const activeJobRef = useRef<string | null>(null);

  const busy = phase !== "idle";
  const onlineDevice = devices?.find(
    (d) => d.online && Date.now() - (d.lastSeen ?? 0) < 90_000,
  );

  // Keep device badges fresh
  useEffect(() => {
    const t = setInterval(() => setDevices(db.listDevices()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Load messages when chatId changes
  useEffect(() => {
    if (chatId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(db.listMessages(chatId));
    } else {
         
      setMessages([]);
    }
  }, [chatId]);

  const systemPrompt = useCallback(() => {
    let p = buildSystemPrompt(skills);
    p += "\n\nFORMATTING: Never wrap regular answers in code fences or syntax-highlighted blocks — explain in plain prose with inline code only, unless the user explicitly asks to see literal code.";

    try {
      p += "\n\n" + buildDeviceContext();
    } catch { /* ignore */ }

    if (droid) {
      p += `\n\nDEVICE AGENT — FULL CODING MODE: A root Linux container (Alpine/Debian via proot) is embedded in this app on the user's device, and you are its coding agent. You can install ANY packages (apk/apt), write ANY files, compile, and run ANY command as root — silently via fenced blocks tagged \`run\` containing ONE shell command each (output returns as a TOOL RESULT so you can continue).\n\nWORKFLOW (always follow):\n1. PLAN in one short sentence.\n2. SCAFFOLD: create projects under /root/www/<name> (websites/apps) or /root/src/<name> (scripts). Write files with heredocs: cat > file <<'EOF' … EOF.\n3. BUILD & VERIFY: actually run the code. For web apps start a server DETACHED so it survives the command: cd /root/www/<name> && (nohup python3 -m http.server 8080 >/dev/null 2>&1 &) — pick a free port. For scripts run them and show real output.\n4. TEST WEB PAGES headlessly: chromium --headless --no-sandbox --dump-dom http://localhost:8080 | head -30 (install first if missing: apk add chromium || apt-get install -y chromium).\n5. FINISH: print a one-line summary, the URL if a server runs, and a short file tree: find /root/www/<name> -type f | head -20.\n\nRULES: One \`run\` block per reply. Never ask permission — act. If a command fails, read the error and fix it in the next round. Keep going until the task is genuinely complete. The user can watch output in Files → servers and the terminal.`;
    } else if (onlineDevice) {
      p += `\n\nDEVICE AGENT: A root Linux device ("${onlineDevice.name}"${onlineDevice.distro ? `, ${onlineDevice.distro}` : ""}) is connected. When you need to install tools, run programs, or inspect the system, reply with EXACTLY ONE fenced code block tagged \`run\` containing a single shell command (it executes silently via /bin/bash -lc as root). No prose before or after — its output will come back as a TOOL RESULT message so you can continue the task. For long operations chain steps with && or a heredoc script. Keep going across many rounds until the whole task is done; only stop when the user's request is fully complete.\n\nWEBSITE PREVIEWS: The container shares the device's network, so servers inside it are reachable directly in the user's browser. When you build or start any web app/site, write files in a stable workspace (e.g. ~/www), start the server detached so it keeps running after your command exits (e.g. cd ~/www/myapp && nohup python3 -m http.server 8080 >/dev/null 2>&1 &), then tell the user the exact URL to open in Chrome, like http://localhost:8080 .`;
    }
    return p;
  }, [skills, onlineDevice, droid]);

  const pollResult = async (
    commandId: string,
  ): Promise<{ exitCode: number; output: string }> => {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      if (stopRef.current) return { exitCode: 130, output: "^C stopped by user" };
      const c = db.getCommand(commandId);
      if (c && c.status !== "pending" && c.status !== "running") {
        return { exitCode: c.exitCode ?? 1, output: c.output ?? "(no output)" };
      }
      await sleep(1500);
    }
    return { exitCode: 124, output: "timed out after 3 minutes" };
  };

  const streamTurn = async (cid: string): Promise<string> => {
    const rows = db.listMessages(cid) as MessageRow[];
    const convo: ApiMessage[] = [{ role: "system", content: systemPrompt() }];
    for (const m of rows) {
      if (m.role === "system") continue;
      convo.push({ role: m.role as "user" | "assistant", content: m.content });
    }

    // Inject user memory context
    try {
      const lastUserMsg = [...rows]
        .reverse()
        .find((m) => m.role === "user" && !m.content.startsWith("TOOL RESULT"));
      if (lastUserMsg) {
        const memCtx = buildMemoryContext(lastUserMsg.content);
        if (memCtx) convo.splice(1, 0, { role: "system", content: memCtx });
      }
    } catch { /* ignore */ }

    // Live web search
    if (skills.includes("web") || skills.includes("research")) {
      const lastUser = [...rows]
        .reverse()
        .find((m) => m.role === "user" && !m.content.startsWith("TOOL RESULT"));
      if (lastUser) {
        setPhase("searching");
        try {
          const exaKey = db.getApiKeys().exa;
          const includeDomains = detectQueryDomains(lastUser.content);
          const isDeep = skills.includes("research");

          const { sources: searchSources, fullContent } = await deepSearch(
            lastUser.content,
            {
              exaApiKey: exaKey || undefined,
              numResults: isDeep ? 7 : 5,
              includeDomains,
              fetchContent: isDeep,
            },
          );

          setSources(searchSources);

          if (searchSources.length > 0) {
            let webContext = `LIVE WEB RESULTS (${new Date().toDateString()}):\n${searchSources
              .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
              .join("\n\n")}`;

            if (fullContent.length > 0) {
              webContext += "\n\nFULL PAGE CONTENT:\n";
              for (const fc of fullContent) {
                webContext += `\n--- ${fc.title} (${fc.url}) ---\n${fc.content.slice(0, 2000)}\n`;
              }
            }

            webContext += "\n\nUse these sources where relevant and cite them inline as [1], [2]…";
            convo.splice(1, 0, { role: "system", content: webContext });
          }
        } catch (err) {
          setError((err as Error).message);
        }
      }
    }

    setPhase("streaming");
    setStreamText("");
    const controller = new AbortController();
    abortRef.current = controller;
    let full = "";
    try {
      for await (const delta of streamChatWithFallback({
        provider: selection.provider,
        model: selection.model,
        messages: convo,
        signal: controller.signal,
        thinking: thinkingMode,
      })) {
        full += delta;
        setStreamText(full);
      }
    } finally {
      abortRef.current = null;
    }
    return full;
  };

  const runConversation = async (cid: string) => {
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (stopRef.current) break;

        let rawOut = "";
        try {
          rawOut = await streamTurn(cid);
        } catch (err) {
          if ((err as Error).name === "AbortError" || stopRef.current) break;
          throw err;
        }
        if (stopRef.current) break;

        const deviceReady = Boolean(droid || onlineDevice);
        const cmds = deviceReady ? extractRunCommands(rawOut) : [];
        const cleaned = deviceReady ? stripRunBlocks(rawOut) : rawOut.trim();

        if (cleaned) {
          db.addMessage(cid, "assistant", cleaned, String(selection.provider), selection.model);

          // Extract and store memories
          try {
            const currentMsgs = db.listMessages(cid) as MessageRow[];
            const lastUserMsg = [...currentMsgs]
              .reverse()
              .find((m) => m.role === "user" && !m.content.startsWith("TOOL RESULT"));
            if (lastUserMsg) {
              const facts = extractFactsFromTurn(lastUserMsg.content);
              for (const { fact, category } of facts) {
                const { remember } = await import("@/lib/memory");
                remember(fact, category, cid);
              }
            }
          } catch { /* memory extraction is best-effort */ }
        }

        const cmd = cmds[0];
        if (!cmd) break;

        if (droid) {
          setPhase("running");
          let exitCode = 0;
          let output = "";
          if (droid.submit && droid.job) {
            const jobId = droid.submit(cmd);
            activeJobRef.current = jobId;
            const deadline = Date.now() + 15 * 60_000;
            for (;;) {
              if (stopRef.current) {
                try { droid.killJob?.(jobId); } catch { /* gone */ }
                output = "^C stopped by user";
                break;
              }
              if (Date.now() > deadline) {
                try { droid.killJob?.(jobId); } catch { /* gone */ }
                output = "[timed out after 15 minutes]";
                exitCode = 124;
                break;
              }
              await sleep(700);
              try {
                const st = JSON.parse(droid.job(jobId)) as {
                  done: boolean;
                  exit: number;
                  out: string;
                };
                if (st.done) {
                  exitCode = st.exit;
                  output = st.out || "(no output)";
                  break;
                }
              } catch { /* transient parse — keep polling */ }
            }
            activeJobRef.current = null;
            if (stopRef.current) break;
          } else {
            const syncRaw = droid.run(cmd);
            const m = /^EXIT:(\d+)\n([\s\S]*)$/.exec(syncRaw);
            exitCode = m ? Number(m[1]) : 0;
            output = m ? m[2] : syncRaw;
          }
          db.addMessage(cid, "user", `TOOL RESULT (exit ${exitCode}) for: ${cmd.slice(0, 200)}\n\n${output}`);
          continue;
        }

        if (!onlineDevice) {
          db.addMessage(cid, "assistant",
            "⚠️ I tried to run a command on your device, but **no agent device is online**. Open **Skills → Device agent** and start the runner there, then ask again.",
          );
          break;
        }

        setPhase("running");
        const commandId = db.createCommand(onlineDevice._id, cmd, cid);
        const result = await pollResult(commandId);
        db.addMessage(cid, "user", `TOOL RESULT (exit ${result.exitCode}) for: ${cmd.slice(0, 200)}\n\n${result.output}`);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError" && !stopRef.current) {
        setError((err as Error).message || "Conversation error");
      }
    }
  };

  const stop = useCallback(() => {
    stopRef.current = true;
    try {
      abortRef.current?.abort();
    } catch { /* safe */ }
    abortRef.current = null;
    if (activeJobRef.current) {
      try { droid?.killJob?.(activeJobRef.current); } catch { /* gone */ }
      activeJobRef.current = null;
    }
    try {
      setPhase("idle");
      setStreamText("");
    } catch { /* component unmounted */ }
  }, [droid, setPhase, setStreamText]);

  const beginTurn = useCallback(() => {
    setError(null);
    setSources(null);
    stopRef.current = false;
  }, [setError, setSources]);

  const finishTurn = useCallback(() => {
    try {
      setPhase("idle");
      setStreamText("");
    } catch { /* component may be unmounting */ }
    abortRef.current = null;
  }, [setPhase, setStreamText]);

  const guardTurn = useCallback((err: unknown) => {
    const e = err as Error;
    if (e.name !== "AbortError") setError(e.message || "Something went wrong");
  }, [setError]);

  return {
    // State
    phase,
    setPhase,
    selection,
    setSelection,
    streamText,
    setStreamText,
    thinkingMode,
    setThinkingMode,
    error,
    setError,
    sources,
    setSources,
    messages,
    setMessages,
    devices,
    busy,
    onlineDevice,
    droid,
    skills,
    stopRef,
    activeJobRef,
    
    // Actions
    streamTurn,
    runConversation,
    stop,
    beginTurn,
    finishTurn,
    guardTurn,
    
    // Helpers
    navigate,
  };
}
