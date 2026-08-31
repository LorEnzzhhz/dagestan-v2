// ---------------------------------------------------------------------------
// memory.ts — Persistent memory system. Stores facts extracted from
// conversations so the AI remembers context across sessions.
// ---------------------------------------------------------------------------

import { migrateKey } from "./store";

const STORAGE_KEY = migrateKey("prism.memory", "dagestan.memory");
const MAX_MEMORIES = 100;
const MAX_MEMORY_LENGTH = 200;

export interface Memory {
  id: string;
  fact: string;
  category: "preference" | "project" | "topic" | "person" | "technical" | "context";
  createdAt: number;
  lastUsed: number;
  useCount: number;
  source: string; // which chatId this was extracted from
}

function load(): Memory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(memories: Memory[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
  } catch {
    // storage full
  }
}

/** Add a fact to memory if it's not already stored. */
export function remember(fact: string, category: Memory["category"], source: string): void {
  const trimmed = fact.trim().slice(0, MAX_MEMORY_LENGTH);
  if (!trimmed) return;

  const memories = load();

  // Deduplicate: check if similar fact already exists
  const existing = memories.find(
    (m) => m.fact.toLowerCase() === trimmed.toLowerCase() || 
           similarity(m.fact, trimmed) > 0.7
  );

  if (existing) {
    // Update instead of duplicating
    existing.lastUsed = Date.now();
    existing.useCount++;
    existing.fact = trimmed; // update to latest wording
    save(memories);
    return;
  }

  // Add new memory
  memories.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fact: trimmed,
    category,
    createdAt: Date.now(),
    lastUsed: Date.now(),
    useCount: 1,
    source,
  });

  // Enforce max limit — drop oldest, least-used
  if (memories.length > MAX_MEMORIES) {
    memories.sort((a, b) => {
      // Sort by recency * frequency score
      const scoreA = a.useCount * Math.log(a.lastUsed);
      const scoreB = b.useCount * Math.log(b.lastUsed);
      return scoreA - scoreB;
    });
    memories.splice(0, memories.length - MAX_MEMORIES);
  }

  save(memories);
}

/** Get the top N most relevant memories for a query. */
export function getRelevantMemories(query: string, limit = 5): Memory[] {
  const memories = load();
  if (!memories.length) return [];

  const q = query.toLowerCase();

  // Score each memory by relevance to the query
  const scored = memories.map((m) => {
    let score = 0;
    const fact = m.fact.toLowerCase();

    // Exact keyword match bonus
    const words = q.split(/\s+/);
    for (const w of words) {
      if (w.length > 2 && fact.includes(w)) score += 2;
    }

    // Category bonus for technical/preference queries
    if (q.match(/code|bug|error|fix|implement/) && m.category === "technical") score += 3;
    if (q.match(/prefer|like|use|style/) && m.category === "preference") score += 3;
    if (q.match(/project|build|app/) && m.category === "project") score += 3;
    if (q.match(/who|person|name/) && m.category === "person") score += 3;

    // Recency bonus (recent memories are more relevant)
    const age = Date.now() - m.lastUsed;
    score += Math.max(0, 5 - age / (24 * 60 * 60 * 1000)); // 5 points for fresh, 0 after 5 days

    // Usage bonus
    score += Math.min(m.useCount, 5);

    return { memory: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.memory);
}

/** Get all memories, optionally filtered by category. */
export function getAllMemories(category?: Memory["category"]): Memory[] {
  const memories = load();
  if (category) return memories.filter((m) => m.category === category);
  return [...memories].sort((a, b) => b.lastUsed - a.lastUsed);
}

/** Delete a specific memory by ID. */
export function deleteMemory(id: string): void {
  const memories = load().filter((m) => m.id !== id);
  save(memories);
}

/** Clear all memories. */
export function clearAllMemories(): void {
  save([]);
}

/** Build a context string from relevant memories to inject into the system prompt. */
export function buildMemoryContext(query: string): string {
  const relevant = getRelevantMemories(query, 5);
  if (!relevant.length) return "";

  const lines = relevant.map((m) => {
    const cat = m.category === "preference" ? "Preference" 
              : m.category === "project" ? "Project" 
              : m.category === "technical" ? "Technical"
              : m.category === "person" ? "Person"
              : m.category === "topic" ? "Topic"
              : "Context";
    return `- [${cat}] ${m.fact}`;
  });

  return `USER MEMORY (what I remember about you):\n${lines.join("\n")}`;
}

/** Simple word-level similarity (Jaccard-ish). */
function similarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.max(wordsA.size, wordsB.size, 1);
}

/** Extract facts from a conversation turn using simple heuristics. */
export function extractFactsFromTurn(
  userMessage: string,
): { fact: string; category: Memory["category"] }[] {
  const facts: { fact: string; category: Memory["category"] }[] = [];
  const text = userMessage.toLowerCase();

  // Detect preferences
  if (text.match(/i (prefer|like|love|hate|always use|never use|usually)/)) {
    facts.push({ fact: userMessage.trim().slice(0, MAX_MEMORY_LENGTH), category: "preference" });
  }

  // Detect project mentions
  if (text.match(/(my project|my app|my website|my code|my repo|building|working on)/)) {
    facts.push({ fact: userMessage.trim().slice(0, MAX_MEMORY_LENGTH), category: "project" });
  }

  // Detect technical context
  if (text.match(/(i use|i'm using|my stack|typescript|react|python|node|docker|linux)/)) {
    facts.push({ fact: userMessage.trim().slice(0, MAX_MEMORY_LENGTH), category: "technical" });
  }

  // Detect names/people
  if (text.match(/(my name is|call me|i am|my friend|i know)/)) {
    facts.push({ fact: userMessage.trim().slice(0, MAX_MEMORY_LENGTH), category: "person" });
  }

  return facts;
}
