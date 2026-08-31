import { useState, useRef } from "react";
import { Upload, FileText, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import * as db from "@/lib/db";

interface ImportedMessage {
  role: "user" | "assistant";
  content: string;
  model?: string;
}

interface ImportResult {
  name: string;
  messages: ImportedMessage[];
  source: "chatgpt" | "claude" | "dagestan" | "unknown";
}

function detectSource(data: unknown): ImportResult["source"] {
  if (!data || typeof data !== "object") return "unknown";
  const obj = data as Record<string, unknown>;

  // Dagestan format
  if (obj.exportDate && Array.isArray(obj.chats)) return "dagestan";

  // ChatGPT format (mapping/chat data)
  if (obj.mapping || obj.conversation_id) return "chatgpt";

  // Claude format
  if (obj.chat_messages || obj.name === "claude") return "claude";

  // Array of messages
  if (Array.isArray(data)) {
    const first = data[0] as Record<string, unknown> | undefined;
    if (first?.role && first?.content) return "chatgpt";
  }

  return "unknown";
}

function parseImport(data: unknown): ImportResult {
  const source = detectSource(data);

  switch (source) {
    case "dagestan": {
      const d = data as { chats?: { title?: string; messages?: { role: string; content: string }[] }[] };
      const chat = d.chats?.[0];
      return {
        name: chat?.title || "Imported Chat",
        messages: (chat?.messages || []).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        source,
      };
    }

    case "chatgpt": {
      const d = data as Record<string, unknown>;
      let title = "ChatGPT Import";
      let messages: ImportedMessage[] = [];

      if (d.title) title = d.title as string;

      // Handle mapping format
      if (d.mapping && typeof d.mapping === "object") {
        const mapping = d.mapping as Record<string, { message?: { author?: { role: string }; content?: { parts?: string[] } } }>;
        for (const node of Object.values(mapping)) {
          if (node.message?.author?.role && node.message?.content?.parts) {
            const role = node.message.author.role;
            if (role === "user" || role === "assistant") {
              messages.push({
                role,
                content: node.message.content.parts.join(""),
              });
            }
          }
        }
      }

      // Handle simple array format
      if (Array.isArray(data)) {
        messages = data.map((m: Record<string, unknown>) => ({
          role: (m.role as "user" | "assistant") || "user",
          content: (m.content as string) || "",
        }));
      }

      return { name: title, messages, source };
    }

    case "claude": {
      const d = data as { chat_messages?: { sender: string; text: string }[]; name?: string };
      return {
        name: d.name || "Claude Import",
        messages: (d.chat_messages || []).map((m) => ({
          role: m.sender === "human" ? "user" : "assistant",
          content: m.text,
        })),
        source,
      };
    }

    default:
      // Try to parse as simple JSON array
      if (Array.isArray(data)) {
        return {
          name: "Imported Chat",
          messages: data.map((m: Record<string, unknown>) => ({
            role: ((m.role as string) === "assistant" ? "assistant" : "user") as "user" | "assistant",
            content: (m.content as string) || (m.text as string) || "",
          })),
          source: "unknown",
        };
      }
      return { name: "Imported Chat", messages: [], source: "unknown" };
  }
}

export function ImportChat() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setError(null);
    setResult(null);
    setImported(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const parsed = parseImport(data);
        if (parsed.messages.length === 0) {
          setError("No messages found in the file");
          return;
        }
        setResult(parsed);
      } catch {
        setError("Invalid JSON file. Please export from ChatGPT, Claude, or Dagestan.");
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!result) return;

    // Create a new chat with the imported messages
    const chatId = db.createChat(result.name, "imported", "unknown");
    for (const msg of result.messages) {
      db.addMessage(chatId, msg.role, msg.content, msg.model);
    }

    setImported(true);
  };

  const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
    chatgpt: { label: "ChatGPT", color: "bg-emerald-400/10 text-emerald-600 dark:text-emerald-300" },
    claude: { label: "Claude", color: "bg-orange-400/10 text-orange-600 dark:text-orange-300" },
    dagestan: { label: "Dagestan", color: "bg-cyan-400/10 text-cyan-600 dark:text-cyan-300" },
    unknown: { label: "Unknown", color: "bg-muted text-muted-foreground" },
  };

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Upload className="size-4 text-primary" />
          Import Chat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Import conversations from ChatGPT, Claude, or Dagestan export files.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => fileRef.current?.click()}
        >
          <FileText className="size-3.5" />
          Select JSON file
        </Button>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{result.name}</span>
              <Badge variant="outline" className={`text-[9px] ${SOURCE_LABELS[result.source]?.color}`}>
                {SOURCE_LABELS[result.source]?.label}
              </Badge>
              <Badge variant="outline" className="text-[9px]">
                {result.messages.length} messages
              </Badge>
            </div>

            <div className="max-h-32 overflow-auto rounded-lg border border-border/60 bg-secondary/30 p-2 text-[11px] text-muted-foreground">
              {result.messages.slice(0, 6).map((m, i) => (
                <div key={i} className="mb-1">
                  <span className="font-semibold">{m.role === "user" ? "You" : "AI"}:</span>{" "}
                  {m.content.slice(0, 100)}{m.content.length > 100 ? "..." : ""}
                </div>
              ))}
              {result.messages.length > 6 && (
                <p className="text-muted-foreground/60">...and {result.messages.length - 6} more</p>
              )}
            </div>

            {imported ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-2 text-xs text-emerald-600 dark:text-emerald-300">
                <Check className="size-3.5" />
                Imported! Check your chat sidebar.
              </div>
            ) : (
              <Button size="sm" className="w-full" onClick={handleImport}>
                Import {result.messages.length} messages
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
