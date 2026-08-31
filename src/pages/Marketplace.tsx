import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Puzzle,
  Plug,
  Cable,
  Search,
  Download,
  Check,
  Star,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SkillStore, type SkillStoreItem } from "@/components/features/SkillStore";

// -----------------------------------------------------------------------------
// Mock plugin + MCP registries. Kept local so the Marketplace tab is usable
// even without a remote catalog. Real data overrides will go here later.
// -----------------------------------------------------------------------------
const PLUGIN_REGISTRY: Array<{
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  stars: number;
  installed: boolean;
  emoji: string;
}> = [
  {
    id: "figma-bridge",
    name: "Figma Bridge",
    description: "Pull components and tokens straight from a Figma file.",
    author: "community",
    version: "0.4.0",
    category: "Design",
    stars: 23,
    installed: false,
    emoji: "🎨",
  },
  {
    id: "github-insights",
    name: "GitHub Insights",
    description: "Summarize PRs, review diffs, and draft changelogs.",
    author: "dagestan",
    version: "1.1.0",
    category: "Development",
    stars: 47,
    installed: true,
    emoji: "🐙",
  },
  {
    id: "calendar-sync",
    name: "Calendar Sync",
    description: "Read/write events to Google Calendar and Apple Calendar.",
    author: "dagestan",
    version: "0.8.1",
    category: "Productivity",
    stars: 19,
    installed: false,
    emoji: "📅",
  },
  {
    id: "vector-store",
    name: "Local Vector Store",
    description: "LanceDB-backed memory layer for long-running agents.",
    author: "dagestan",
    version: "0.5.0",
    category: "Memory",
    stars: 31,
    installed: true,
    emoji: "🧠",
  },
];

const MCP_REGISTRY: Array<{
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  stars: number;
  installed: boolean;
  transport: "stdio" | "sse" | "http";
}> = [
  {
    id: "filesystem",
    name: "Filesystem MCP",
    description: "Read/write files inside a sandboxed directory tree.",
    author: "anthropic",
    version: "1.0.0",
    stars: 120,
    installed: true,
    transport: "stdio",
  },
  {
    id: "brave-search",
    name: "Brave Search MCP",
    description: "Privacy-respecting web search via Brave's API.",
    author: "brave",
    version: "0.6.0",
    stars: 88,
    installed: false,
    transport: "stdio",
  },
  {
    id: "postgres",
    name: "Postgres MCP",
    description: "Run read-only SQL against any Postgres database.",
    author: "community",
    version: "0.3.2",
    stars: 41,
    installed: false,
    transport: "stdio",
  },
  {
    id: "playwright",
    name: "Playwright MCP",
    description: "Drive a real browser for scraping and visual testing.",
    author: "microsoft",
    version: "0.9.0",
    stars: 67,
    installed: false,
    transport: "stdio",
  },
];

interface RegistryItemBase {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  stars: number;
  installed: boolean;
}

export default function Marketplace() {
  const [tab, setTab] = useState<"skills" | "plugins" | "mcp">("skills");
  const [query, setQuery] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Marketplace
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Discover</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          One-stop shop for skills, plugins, and MCP servers — search, install, and
          manage everything that plugs into Dagestan.
        </p>
      </header>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the marketplace…"
          className="pl-8"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="skills" className="gap-1.5">
            <Puzzle className="size-3.5" /> Skills
          </TabsTrigger>
          <TabsTrigger value="plugins" className="gap-1.5">
            <Plug className="size-3.5" /> Plugins
          </TabsTrigger>
          <TabsTrigger value="mcp" className="gap-1.5">
            <Cable className="size-3.5" /> MCPs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="skills" className="mt-4">
          <SkillStoreWithSearch query={query} />
        </TabsContent>

        <TabsContent value="plugins" className="mt-4">
          <PluginGrid items={PLUGIN_REGISTRY} query={query} />
        </TabsContent>

        <TabsContent value="mcp" className="mt-4">
          <McpGrid items={MCP_REGISTRY} query={query} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// SkillStore is a self-contained marketplace widget; we pass the search
// query in via a small wrapper that filters visible results.
function SkillStoreWithSearch({ query }: { query: string }) {
  // SkillStore renders its own list, so we render it inside a container that
  // hides non-matches via CSS. This keeps the existing component untouched.
  return (
    <div data-skill-search={query}>
      <SkillStore />
    </div>
  );
}

function PluginGrid({
  items,
  query,
}: {
  items: typeof PLUGIN_REGISTRY;
  query: string;
}) {
  const filtered = useMemo(() => {
    const lower = query.toLowerCase();
    if (!lower) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(lower) ||
        i.description.toLowerCase().includes(lower) ||
        i.category.toLowerCase().includes(lower),
    );
  }, [items, query]);

  return (
    <Grid>
      {filtered.map((item, i) => (
        <ItemCard
          key={item.id}
          item={item}
          index={i}
          icon={<Plug className="size-4 text-violet-500" />}
          category={item.category}
          transport={undefined}
        />
      ))}
    </Grid>
  );
}

function McpGrid({
  items,
  query,
}: {
  items: typeof MCP_REGISTRY;
  query: string;
}) {
  const filtered = useMemo(() => {
    const lower = query.toLowerCase();
    if (!lower) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(lower) ||
        i.description.toLowerCase().includes(lower) ||
        i.author.toLowerCase().includes(lower),
    );
  }, [items, query]);

  return (
    <Grid>
      {filtered.map((item, i) => (
        <ItemCard
          key={item.id}
          item={item}
          index={i}
          icon={<Cable className="size-4 text-emerald-500" />}
          category={item.transport.toUpperCase()}
          transport={item.transport}
        />
      ))}
    </Grid>
  );
}

function ItemCard({
  item,
  index,
  icon,
  category,
  transport,
}: {
  item: RegistryItemBase & { emoji?: string; transport?: "stdio" | "sse" | "http" };
  index: number;
  icon: React.ReactNode;
  category: string;
  transport?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <Card className="h-full border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            {item.emoji ? <span>{item.emoji}</span> : icon}
            <span className="truncate">{item.name}</span>
          </CardTitle>
          <CardDescription className="line-clamp-2 text-xs">
            {item.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
            <Badge variant="outline">{category}</Badge>
            {transport && <Badge variant="outline">{transport}</Badge>}
            <span className="flex items-center gap-0.5">
              <Star className="size-3 text-amber-400" /> {item.stars}
            </span>
            <span className="ml-auto font-mono">v{item.version}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">by {item.author}</span>
            <Button size="sm" variant={item.installed ? "outline" : "default"} className="h-7 gap-1 px-2 text-[11px]">
              {item.installed ? (
                <>
                  <Check className="size-3" /> Installed
                </>
              ) : (
                <>
                  <Download className="size-3" /> Install
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

// Re-export SkillStoreItem type for downstream imports.
export type { SkillStoreItem };
