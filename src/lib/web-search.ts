// ---------------------------------------------------------------------------
// web-search.ts — Agent-Reach inspired multi-source web search.
// Combines Exa semantic search + Jina Reader content extraction + RSS feeds.
// Replaces the old inline Exa-only search with a full research engine.
// ---------------------------------------------------------------------------

import type { Source } from "./site-icons";

/** Semantic web search via Exa API. */
export async function exaSearch(
  query: string,
  options: {
    apiKey: string;
    numResults?: number;
    includeDomains?: string[];
    excludeDomains?: string[];
  },
): Promise<Source[]> {
  const { apiKey, numResults = 5, includeDomains, excludeDomains } = options;

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query.slice(0, 400),
        numResults,
        ...(includeDomains ? { includeDomains } : {}),
        ...(excludeDomains ? { excludeDomains } : {}),
      }),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      results?: { title?: string; url: string; text?: string }[];
    };

    return (data.results ?? []).map((r) => ({
      title: r.title || r.url,
      url: r.url,
      snippet: (r.text ?? "").slice(0, 300),
    }));
  } catch {
    return [];
  }
}

/** Fetch and extract readable content from any URL via Jina Reader API. */
export async function jinaRead(
  url: string,
  options?: { apiKey?: string },
): Promise<{ title: string; content: string; url: string } | null> {
  try {
    const headers: Record<string, string> = {};
    if (options?.apiKey) {
      headers["Authorization"] = `Bearer ${options.apiKey}`;
    }

    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: "text/markdown",
        "X-Return-Format": "markdown",
        ...headers,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const text = await res.text();
    // Extract title from first heading
    const titleMatch = text.match(/^#\s+(.+)/m);
    const title = titleMatch?.[1] || new URL(url).hostname;

    return {
      title,
      content: text.slice(0, 8000), // Cap at 8KB
      url,
    };
  } catch {
    return null;
  }
}

/** Fetch and parse RSS/Atom feeds into structured entries. */
export async function fetchRSSFeed(
  feedUrl: string,
  options?: { limit?: number },
): Promise<{ title: string; link: string; description: string; pubDate: string }[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: { Accept: "application/rss+xml, application/atom+xml, text/xml" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/xml");

    // Try RSS items first, then Atom entries
    const items = doc.querySelectorAll("item");
    const entries = doc.querySelectorAll("entry");
    const nodes = items.length > 0 ? items : entries;

    const limit = options?.limit ?? 10;
    const results: { title: string; link: string; description: string; pubDate: string }[] = [];

    for (let i = 0; i < Math.min(nodes.length, limit); i++) {
      const node = nodes[i];
      const title = node.querySelector("title")?.textContent?.trim() || "";
      const link = node.querySelector("link")?.textContent?.trim()
        || node.querySelector("link")?.getAttribute("href")
        || "";
      const description = (node.querySelector("description")?.textContent?.trim()
        || node.querySelector("summary")?.textContent?.trim()
        || node.querySelector("content")?.textContent?.trim()
        || "").slice(0, 500);
      const pubDate = node.querySelector("pubDate")?.textContent?.trim()
        || node.querySelector("published")?.textContent?.trim()
        || node.querySelector("updated")?.textContent?.trim()
        || "";

      results.push({ title, link, description, pubDate });
    }

    return results;
  } catch {
    return [];
  }
}

/** Multi-source deep search: queries Exa, reads top results via Jina, returns synthesized results. */
export async function deepSearch(
  query: string,
  options: {
    exaApiKey?: string;
    numResults?: number;
    includeDomains?: string[];
    fetchContent?: boolean; // whether to fetch full content via Jina
  },
): Promise<{
  sources: Source[];
  fullContent: { title: string; content: string; url: string }[];
}> {
  const { exaApiKey, numResults = 5, includeDomains, fetchContent = false } = options;

  let sources: Source[] = [];

  // Step 1: Semantic search
  if (exaApiKey) {
    sources = await exaSearch(query, {
      apiKey: exaApiKey,
      numResults,
      includeDomains,
    });
  }

  // Step 2: Optionally fetch full content of top results via Jina Reader
  let fullContent: { title: string; content: string; url: string }[] = [];
  if (fetchContent && sources.length > 0) {
    // Fetch top 3 results in parallel
    const topUrls = sources.slice(0, 3);
    const results = await Promise.allSettled(
      topUrls.map((s) => jinaRead(s.url)),
    );

    fullContent = results
      .filter((r): r is PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof jinaRead>>>> => 
        r.status === "fulfilled" && r.value !== null
      )
      .map((r) => r.value);
  }

  return { sources, fullContent };
}

/** Detect platform-specific domains from a user query. */
export function detectQueryDomains(query: string): string[] | undefined {
  const q = query.toLowerCase();
  const domains: Record<string, string[]> = {
    youtube: ["youtube.com", "youtu.be"],
    tiktok: ["tiktok.com"],
    instagram: ["instagram.com"],
    facebook: ["facebook.com"],
    github: ["github.com", "raw.githubusercontent.com"],
    reddit: ["reddit.com"],
    twitter: ["x.com", "twitter.com"],
    linkedin: ["linkedin.com"],
  };

  for (const [key, doms] of Object.entries(domains)) {
    if (q.includes(key)) return doms;
  }
  return undefined;
}
