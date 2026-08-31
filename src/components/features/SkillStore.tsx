import { useState } from "react";
import { motion } from "framer-motion"
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Download, Check, Star, ExternalLink, Search } from "lucide-react"

export interface SkillStoreItem {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  stars: number;
  installed: boolean;
  icon: string;
  tags: string[];
}

const STORE_SKILLS: SkillStoreItem[] = [
  {
    id: "web-search-pro",
    name: "Web Search Pro",
    description: "Advanced multi-source web search with Jina Reader content extraction and citation tracking.",
    author: "dagestan",
    version: "1.2.0",
    category: "Research",
    stars: 42,
    installed: true,
    icon: "🔍",
    tags: ["search", "web", "research"],
  },
  {
    id: "code-interpreter",
    name: "Code Interpreter",
    description: "Run Python, JavaScript, and Bash code in a sandboxed environment with full output capture.",
    author: "dagestan",
    version: "1.0.0",
    category: "Development",
    stars: 38,
    installed: false,
    icon: "💻",
    tags: ["code", "python", "sandbox"],
  },
  {
    id: "deep-reasoner",
    name: "Deep Reasoner",
    description: "Extended chain-of-thought reasoning with step-by-step problem decomposition.",
    author: "dagestan",
    version: "1.1.0",
    category: "Reasoning",
    stars: 56,
    installed: false,
    icon: "🧠",
    tags: ["reasoning", "thinking", "logic"],
  },
  {
    id: "image-gen",
    name: "Image Generator",
    description: "Generate images from text prompts using DALL-E, Stable Diffusion, or Flux.",
    author: "community",
    version: "0.9.0",
    category: "Creative",
    stars: 31,
    installed: false,
    icon: "🎨",
    tags: ["image", "generation", "creative"],
  },
  {
    id: "pdf-reader",
    name: "PDF Analyzer",
    description: "Upload and analyze PDF documents with AI-powered extraction and Q&A.",
    author: "dagestan",
    version: "1.0.0",
    category: "Productivity",
    stars: 27,
    installed: false,
    icon: "📄",
    tags: ["pdf", "document", "analysis"],
  },
  {
    id: "voice-chat",
    name: "Voice Chat",
    description: "Real-time voice conversations with AI using Whisper STT and TTS engines.",
    author: "community",
    version: "0.8.0",
    category: "Communication",
    stars: 44,
    installed: false,
    icon: "🎤",
    tags: ["voice", "speech", "audio"],
  },
  {
    id: "git-helper",
    name: "Git Helper",
    description: "AI-powered Git operations: commits, branches, merges, and conflict resolution.",
    author: "dagestan",
    version: "1.0.0",
    category: "Development",
    stars: 33,
    installed: false,
    icon: "🔀",
    tags: ["git", "version-control", "dev"],
  },
  {
    id: "data-viz",
    name: "Data Visualizer",
    description: "Create charts, graphs, and visualizations from data with natural language.",
    author: "community",
    version: "1.1.0",
    category: "Analytics",
    stars: 29,
    installed: false,
    icon: "📊",
    tags: ["data", "charts", "visualization"],
  },
  {
    id: "translator-pro",
    name: "Translator Pro",
    description: "Context-aware translation across 100+ languages with tone preservation.",
    author: "dagestan",
    version: "1.0.0",
    category: "Productivity",
    stars: 35,
    installed: false,
    icon: "🌍",
    tags: ["translation", "languages", "i18n"],
  },
  {
    id: "security-audit",
    name: "Security Auditor",
    description: "Scan code for vulnerabilities, suggest fixes, and enforce security best practices.",
    author: "community",
    version: "0.9.0",
    category: "Security",
    stars: 41,
    installed: false,
    icon: "🛡️",
    tags: ["security", "audit", "vulnerability"],
  }
,
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Privacy-respecting web search via the Brave Search API with snippet extraction.",
    author: "brave",
    version: "1.0.0",
    category: "Research",
    stars: 88,
    installed: false,
    icon: "🦁",
    tags: ["search", "web", "brave"],
  },
  {
    id: "exa-search",
    name: "Exa Neural Search",
    description: "Embeddings-based semantic search engine with content fetching and highlights.",
    author: "exa",
    version: "0.7.0",
    category: "Research",
    stars: 64,
    installed: false,
    icon: "🧪",
    tags: ["search", "semantic", "exa"],
  },
  {
    id: "arxiv",
    name: "arXiv Reader",
    description: "Search and summarize academic papers from arXiv with citation extraction.",
    author: "community",
    version: "0.5.0",
    category: "Research",
    stars: 28,
    installed: false,
    icon: "📚",
    tags: ["arxiv", "papers", "research"],
  },
  {
    id: "wolfram",
    name: "Wolfram Alpha",
    description: "Math, science, and unit-aware computation via Wolfram Alpha's API.",
    author: "wolfram",
    version: "1.0.0",
    category: "Analytics",
    stars: 53,
    installed: false,
    icon: "🧮",
    tags: ["math", "science", "wolfram"],
  },
  {
    id: "weather",
    name: "Weather",
    description: "Current conditions and 7-day forecasts for any location worldwide.",
    author: "dagestan",
    version: "1.0.0",
    category: "Productivity",
    stars: 17,
    installed: false,
    icon: "⛅",
    tags: ["weather", "forecast"],
  },
  {
    id: "calendar-google",
    name: "Google Calendar",
    description: "Read, create, update, and delete events in Google Calendar.",
    author: "google",
    version: "1.2.0",
    category: "Productivity",
    stars: 49,
    installed: false,
    icon: "📅",
    tags: ["calendar", "google", "scheduling"],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Read and write Notion pages, databases, and blocks.",
    author: "notion",
    version: "1.1.0",
    category: "Productivity",
    stars: 71,
    installed: false,
    icon: "🗒️",
    tags: ["notion", "wiki", "docs"],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Post messages, manage channels, and read threads in Slack workspaces.",
    author: "slack",
    version: "1.0.0",
    category: "Communication",
    stars: 36,
    installed: false,
    icon: "💬",
    tags: ["slack", "chat", "team"],
  },
  {
    id: "discord",
    name: "Discord",
    description: "Send messages, manage roles, and interact with Discord servers via bots.",
    author: "discord",
    version: "0.9.0",
    category: "Communication",
    stars: 39,
    installed: false,
    icon: "🎮",
    tags: ["discord", "chat", "community"],
  },
  {
    id: "email-imap",
    name: "Email (IMAP/SMTP)",
    description: "Read, search, and send email via IMAP/SMTP for any provider.",
    author: "dagestan",
    version: "1.0.0",
    category: "Communication",
    stars: 22,
    installed: false,
    icon: "✉️",
    tags: ["email", "imap", "smtp"],
  },
  {
    id: "rss-reader",
    name: "RSS Reader",
    description: "Subscribe to RSS/Atom feeds and summarize new entries on demand.",
    author: "community",
    version: "0.6.0",
    category: "Research",
    stars: 15,
    installed: false,
    icon: "📰",
    tags: ["rss", "feeds", "news"],
  },
  {
    id: "calculator",
    name: "Calculator",
    description: "Precise arithmetic, percentages, and unit conversions.",
    author: "dagestan",
    version: "1.0.0",
    category: "Analytics",
    stars: 11,
    installed: true,
    icon: "🧮",
    tags: ["math", "calc"],
  },
  {
    id: "regex-tester",
    name: "Regex Tester",
    description: "Live regex testing with capture groups and replacements.",
    author: "community",
    version: "0.4.0",
    category: "Development",
    stars: 14,
    installed: false,
    icon: "🔣",
    tags: ["regex", "dev"],
  },
  {
    id: "json-formatter",
    name: "JSON Formatter",
    description: "Pretty-print, validate, and diff JSON payloads.",
    author: "dagestan",
    version: "1.0.0",
    category: "Development",
    stars: 13,
    installed: true,
    icon: "🧾",
    tags: ["json", "dev", "tools"],
  },
  {
    id: "base64",
    name: "Base64 / Codec",
    description: "Encode and decode base64, URL-safe base64, and hex strings.",
    author: "dagestan",
    version: "1.0.0",
    category: "Development",
    stars: 8,
    installed: true,
    icon: "🔐",
    tags: ["encoding", "codec", "dev"],
  },
  {
    id: "qr-code",
    name: "QR Code",
    description: "Generate and decode QR codes from text or images.",
    author: "community",
    version: "0.5.0",
    category: "Creative",
    stars: 19,
    installed: false,
    icon: "🔳",
    tags: ["qr", "barcode", "utility"],
  },
  {
    id: "markdown-preview",
    name: "Markdown Preview",
    description: "Render and live-preview Markdown with GitHub-flavored extensions.",
    author: "dagestan",
    version: "1.0.0",
    category: "Creative",
    stars: 12,
    installed: true,
    icon: "📝",
    tags: ["markdown", "docs", "preview"],
  },
  {
    id: "code-formatter",
    name: "Code Formatter",
    description: "Format code in 30+ languages using Prettier, Black, gofmt, and more.",
    author: "community",
    version: "1.0.0",
    category: "Development",
    stars: 26,
    installed: false,
    icon: "✨",
    tags: ["formatter", "lint", "dev"],
  },
  {
    id: "eslint-mcp",
    name: "ESLint MCP",
    description: "Run ESLint rules on any project and surface auto-fixable issues.",
    author: "eslint",
    version: "1.0.0",
    category: "Development",
    stars: 18,
    installed: false,
    icon: "🧹",
    tags: ["eslint", "lint", "mcp"],
  },
  {
    id: "postgres-mcp",
    name: "Postgres MCP",
    description: "Run read-only SQL against any Postgres database with schema discovery.",
    author: "community",
    version: "0.3.2",
    category: "Development",
    stars: 41,
    installed: false,
    icon: "🐘",
    tags: ["postgres", "sql", "mcp"],
  },
  {
    id: "playwright-mcp",
    name: "Playwright MCP",
    description: "Drive a real browser for scraping, screenshots, and visual testing.",
    author: "microsoft",
    version: "0.9.0",
    category: "Development",
    stars: 67,
    installed: false,
    icon: "🎭",
    tags: ["playwright", "browser", "mcp"],
  },
  {
    id: "filesystem-mcp",
    name: "Filesystem MCP",
    description: "Read and write files inside a sandboxed directory tree.",
    author: "anthropic",
    version: "1.0.0",
    category: "Development",
    stars: 120,
    installed: true,
    icon: "📁",
    tags: ["fs", "files", "mcp"],
  },
  {
    id: "vector-store",
    name: "Local Vector Store",
    description: "LanceDB-backed memory layer for long-running agents.",
    author: "dagestan",
    version: "0.5.0",
    category: "Reasoning",
    stars: 31,
    installed: true,
    icon: "🧠",
    tags: ["memory", "vector", "embeddings"],
  },
  {
    id: "stt-whisper",
    name: "Whisper STT",
    description: "Local speech-to-text using Whisper.cpp for fast on-device transcription.",
    author: "openai",
    version: "1.0.0",
    category: "Communication",
    stars: 95,
    installed: false,
    icon: "🎙️",
    tags: ["stt", "whisper", "audio"],
  },
  {
    id: "tts-elevenlabs",
    name: "ElevenLabs TTS",
    description: "High-fidelity text-to-speech with cloning and emotion controls.",
    author: "elevenlabs",
    version: "1.0.0",
    category: "Communication",
    stars: 78,
    installed: false,
    icon: "🗣️",
    tags: ["tts", "voice", "audio"],
  },
  {
    id: "figma-bridge",
    name: "Figma Bridge",
    description: "Pull components and tokens straight from a Figma file.",
    author: "community",
    version: "0.4.0",
    category: "Creative",
    stars: 23,
    installed: false,
    icon: "🎨",
    tags: ["figma", "design", "bridge"],
  },
  {
    id: "github-insights",
    name: "GitHub Insights",
    description: "Summarize PRs, review diffs, and draft changelogs from any repo.",
    author: "dagestan",
    version: "1.1.0",
    category: "Development",
    stars: 47,
    installed: true,
    icon: "🐙",
    tags: ["github", "dev", "review"],
  }

];

const CATEGORIES = ["All", "Research", "Development", "Reasoning", "Creative", "Productivity", "Security", "Analytics", "Communication", "Tools", "Memory", "Audio"];

export function SkillStore() {
  const [installed, setInstalled] = useState<Set<string>>(() =>
    new Set(STORE_SKILLS.filter((s) => s.installed).map((s) => s.id))
  );
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = STORE_SKILLS.filter((skill) => {
    const matchesCategory = selectedCategory === "All" || skill.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.tags.some((t) => t.includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const toggleInstall = (id: string) => {
    setInstalled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-border/70 bg-card py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary/50"
        />
      </div>

      {/* Category filter */}
      <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
              selectedCategory === cat
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Skills grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {filtered.map((skill, i) => {
          const isInstalled = installed.has(skill.id);
          return (
            <motion.div
              key={skill.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card
                className={cn(
                  "border transition-colors",
                  isInstalled
                    ? "border-emerald-400/30 shadow-[0_0_12px_-6px] shadow-emerald-400/20"
                    : "border-border/70 hover:border-primary/30"
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{skill.icon}</span>
                      <div>
                        <CardTitle className="text-sm">{skill.name}</CardTitle>
                        <CardDescription className="text-[10px]">
                          v{skill.version} · by {skill.author}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="size-3 text-amber-400" />
                      <span className="text-[10px] text-muted-foreground">{skill.stars}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {skill.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {skill.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-[9px] font-normal"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={isInstalled ? "outline" : "default"}
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => toggleInstall(skill.id)}
                    >
                      {isInstalled ? (
                        <>
                          <Check className="size-3" />
                          Installed
                        </>
                      ) : (
                        <>
                          <Download className="size-3" />
                          Install
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5 text-xs"
                    >
                      <ExternalLink className="size-3" />
                      Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No skills found matching your search.
        </div>
      )}
    </div>
  );
}
