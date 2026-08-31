import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Store, Download, Star, TrendingUp, Search, Sparkles, Users, Package } from "lucide-react";
import {
  type GeneratedSkill,
  loadGeneratedSkills,
} from "@/lib/skill-generator";

interface MarketplaceSkill extends GeneratedSkill {
  downloads: number;
  rating: number;
  author: string;
  tags: string[];
  featured: boolean;
}

// Pre-built community skills
const COMMUNITY_SKILLS: MarketplaceSkill[] = [
  {
    id: "community-git-helper",
    name: "Git Helper",
    tagline: "Smart git commands and workflows",
    description: "Helps with git workflows, branching strategies, rebasing, and resolving merge conflicts.",
    systemPrompt: "GIT MODE: Help with git operations. Explain commands before running. Warn about destructive operations. Suggest best practices for commit messages and branching.",
    category: "auto-advanced",
    icon: "GitBranch",
    accent: "text-orange-400",
    source: "auto-generated",
    createdAt: Date.now() - 86400000 * 7,
    executionCount: 245,
    successRate: 98.5,
    improvementLog: [],
    downloads: 1847,
    rating: 4.8,
    author: "dagestan-ai",
    tags: ["git", "version-control", "developer"],
    featured: true,
  },
  {
    id: "community-prompt-engineer",
    name: "Prompt Engineer",
    tagline: "Optimize prompts for any model",
    description: "Analyzes and improves prompts for better AI responses. Includes chain-of-thought, few-shot, and system prompt optimization.",
    systemPrompt: "PROMPT OPTIMIZATION: When asked to improve a prompt, analyze its structure, identify weaknesses, and provide an optimized version with explanations of each change.",
    category: "auto-creative",
    icon: "Wand2",
    accent: "text-purple-400",
    source: "auto-generated",
    createdAt: Date.now() - 86400000 * 3,
    executionCount: 512,
    successRate: 96.2,
    improvementLog: [],
    downloads: 3201,
    rating: 4.9,
    author: "dagestan-ai",
    tags: ["prompts", "optimization", "ai"],
    featured: true,
  },
  {
    id: "community-api-designer",
    name: "API Designer",
    tagline: "RESTful & GraphQL API design",
    description: "Designs APIs with proper endpoints, status codes, authentication, and documentation. Supports OpenAPI/Swagger generation.",
    systemPrompt: "API DESIGN: When designing APIs, follow RESTful conventions. Include: endpoint paths, HTTP methods, request/response schemas, error handling, authentication, and pagination.",
    category: "auto-advanced",
    icon: "Workflow",
    accent: "text-cyan-400",
    source: "auto-generated",
    createdAt: Date.now() - 86400000 * 5,
    executionCount: 189,
    successRate: 94.7,
    improvementLog: [],
    downloads: 1203,
    rating: 4.6,
    author: "community",
    tags: ["api", "rest", "graphql", "backend"],
    featured: false,
  },
  {
    id: "community-test-writer",
    name: "Test Writer",
    tagline: "Unit & integration test generation",
    description: "Generates comprehensive test suites including edge cases, mocking, and assertions. Supports Jest, Vitest, pytest, and more.",
    systemPrompt: "TEST WRITING: When writing tests, cover: happy path, edge cases, error conditions, and boundary values. Use descriptive test names. Include setup and teardown.",
    category: "auto-advanced",
    icon: "FlaskConical",
    accent: "text-green-400",
    source: "auto-generated",
    createdAt: Date.now() - 86400000 * 2,
    executionCount: 334,
    successRate: 97.1,
    improvementLog: [],
    downloads: 2567,
    rating: 4.7,
    author: "dagestan-ai",
    tags: ["testing", "unit-tests", "quality"],
    featured: true,
  },
  {
    id: "community-docs-writer",
    name: "Documentation Writer",
    tagline: "Auto-generate README & docs",
    description: "Creates comprehensive documentation from code including API docs, README files, and architecture diagrams.",
    systemPrompt: "DOCUMENTATION: When writing docs, include: overview, installation, usage examples, API reference, configuration, troubleshooting, and contributing guide.",
    category: "auto-core",
    icon: "BookOpen",
    accent: "text-blue-400",
    source: "auto-generated",
    createdAt: Date.now() - 86400000 * 4,
    executionCount: 156,
    successRate: 93.8,
    improvementLog: [],
    downloads: 987,
    rating: 4.5,
    author: "community",
    tags: ["documentation", "readme", "docs"],
    featured: false,
  },
  {
    id: "community-refactor",
    name: "Code Refactorer",
    tagline: "Clean code transformation",
    description: "Refactors code for better readability, performance, and maintainability. Applies SOLID principles and design patterns.",
    systemPrompt: "REFACTORING: When refactoring, identify code smells, apply SOLID principles, extract functions, reduce complexity, and maintain behavior. Explain each change.",
    category: "auto-advanced",
    icon: "RefreshCw",
    accent: "text-teal-400",
    source: "auto-generated",
    createdAt: Date.now() - 86400000,
    executionCount: 278,
    successRate: 95.3,
    improvementLog: [],
    downloads: 1654,
    rating: 4.7,
    author: "dagestan-ai",
    tags: ["refactoring", "clean-code", "patterns"],
    featured: false,
  },
];

export function SkillMarketplace() {
  const [mySkills, setMySkills] = useState<GeneratedSkill[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "featured" | "mine">("all");
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMySkills(loadGeneratedSkills());
    const installed = new Set(loadGeneratedSkills().map((s) => s.id));
    COMMUNITY_SKILLS.forEach((s) => {
      if (installed.has(s.id)) installed.add(s.id);
    });
     
    setInstalledIds(installed);
  }, []);

  const handleInstall = useCallback((skill: MarketplaceSkill) => {
    const existing = loadGeneratedSkills();
    const newSkill: GeneratedSkill = {
      ...skill,
      createdAt: Date.now(),
      executionCount: 0,
      improvementLog: [],
    };
    const updated = [...existing, newSkill];
    localStorage.setItem("dagestan.generated-skills", JSON.stringify(updated));
    setMySkills(updated);
    setInstalledIds((prev) => new Set([...prev, skill.id]));
  }, []);

  const allSkills = [...COMMUNITY_SKILLS, ...mySkills.map((s) => ({ ...s, downloads: 0, rating: 0, author: "you", tags: [], featured: false } as MarketplaceSkill))];
  const filtered = allSkills.filter((skill) => {
    if (filter === "featured" && !skill.featured) return false;
    if (filter === "mine" && skill.author !== "you") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        skill.name.toLowerCase().includes(q) ||
        skill.tagline.toLowerCase().includes(q) ||
        skill.tags.some((t) => t.includes(q))
      );
    }
    return true;
  });

  const featuredCount = COMMUNITY_SKILLS.filter((s) => s.featured).length;
  const totalDownloads = COMMUNITY_SKILLS.reduce((sum, s) => sum + s.downloads, 0);

  return (
    <div className="space-y-4">
      {/* Marketplace Header Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-center">
          <Package className="w-5 h-5 mx-auto mb-1 text-cyan-400" />
          <p className="text-lg font-bold text-cyan-400">{COMMUNITY_SKILLS.length}</p>
          <p className="text-[10px] text-zinc-500 uppercase">Community Skills</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-center">
          <Star className="w-5 h-5 mx-auto mb-1 text-amber-400" />
          <p className="text-lg font-bold text-amber-400">{featuredCount}</p>
          <p className="text-[10px] text-zinc-500 uppercase">Featured</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-center">
          <Download className="w-5 h-5 mx-auto mb-1 text-emerald-400" />
          <p className="text-lg font-bold text-emerald-400">{totalDownloads.toLocaleString()}</p>
          <p className="text-[10px] text-zinc-500 uppercase">Total Installs</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
        </div>
        <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          {(["all", "featured", "mine"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Skills Grid */}
      <div className="space-y-2">
        <AnimatePresence>
          {filtered.map((skill) => (
            <motion.div
              key={skill.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 ${skill.accent}`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold">{skill.name}</h4>
                    {skill.featured && (
                      <span className="px-1.5 py-0.5 bg-amber-950 text-amber-400 text-[10px] rounded-full font-medium">
                        Featured
                      </span>
                    )}
                    {skill.author === "you" && (
                      <span className="px-1.5 py-0.5 bg-cyan-950 text-cyan-400 text-[10px] rounded-full font-medium">
                        Yours
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{skill.tagline}</p>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{skill.description}</p>

                  {/* Tags */}
                  {skill.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {skill.tags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 bg-zinc-800 text-zinc-500 text-[10px] rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-zinc-500">
                    {skill.downloads > 0 && (
                      <span className="flex items-center gap-1">
                        <Download className="w-3 h-3" />
                        {skill.downloads.toLocaleString()}
                      </span>
                    )}
                    {skill.rating > 0 && (
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-400" />
                        {skill.rating}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      {skill.successRate.toFixed(0)}% success
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {skill.author}
                    </span>
                  </div>
                </div>

                {/* Install button */}
                <div className="shrink-0">
                  {installedIds.has(skill.id) ? (
                    <span className="flex items-center gap-1 px-3 py-1.5 bg-emerald-950 text-emerald-400 text-xs rounded-lg">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                      Installed
                    </span>
                  ) : (
                    <button
                      onClick={() => handleInstall(skill)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium rounded-lg transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Install
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="text-center py-8 text-zinc-500">
            <Store className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No skills found</p>
            <p className="text-xs mt-1">Try a different search or filter</p>
          </div>
        )}
      </div>
    </div>
  );
}
