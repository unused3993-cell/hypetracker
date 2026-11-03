import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, assertNotRefused, baseParams } from "./claude";
import { normalizeUrl } from "./text";
import type { Source } from "./types";
import type { Candidate } from "./topics";

type Block = Anthropic.Beta.BetaContentBlock;

export interface ResearchResult {
  sufficient: boolean;
  reason: string;
  /** Research notes with inline [S#] markers that refer to `sources`. */
  dossier: string;
  /** Only sources the dossier actually draws on (cited or referenced). */
  sources: Source[];
  /** Every URL returned by search/fetch, for logging. */
  retrievedCount: number;
  disputedPoints: string[];
  searches: string[];
}

const SYSTEM = `You are the research desk for Daily Discovery, an editorial app. A writer will produce a 600-900 word article using ONLY your notes, so your notes must be accurate, specific, and traceable.

Research process:
1. Search the web. Prioritize: university and academic sources, museums, scientific organizations, primary historical sources (and translations), encyclopedias with named authors (e.g. Britannica, Stanford Encyclopedia of Philosophy), and reputable publications. Treat blogs, content farms, AI-generated pages, and uncited listicles as unreliable.
2. Fetch the most promising pages to read them properly — do not rely on search snippets for important details.
3. A source existing is not proof it supports a claim. Only record a fact against a source if that page actually states it.
4. Look actively for disputed claims, scholarly disagreement, popular myths, and uncertainty (contested dates, numbers, motives, interpretations).

Write the notes in this exact structure:

## Core facts
Bullet points. Each fact must end with the URL of the page that states it, in parentheses. Include specific names, dates, places, quantities, and mechanisms.

## Narrative / mechanism
A short paragraph-level outline of the story arc (for stories) or the causal chain (for explanations), with URLs in parentheses after each claim.

## Disputed or uncertain
Bullet points describing what is contested or unknown, who holds which view, and source URLs. Write "None found" if genuinely none.

## Myths to avoid
Common but wrong or unsupported claims about this topic, if any.

## Source assessment
One line per source you relied on: URL — what kind of source it is and how reliable.

VERDICT: SUFFICIENT  — or —  VERDICT: INSUFFICIENT: <reason>
Use INSUFFICIENT if you could not find at least three credible, independent sources that substantively cover the topic, or if the topic's core claims turn out to be unsupported or mythical.

Never invent URLs, quotations, dates, or details. Only use URLs that appeared in your search or fetch results.`;

export async function researchTopic(candidate: Candidate): Promise<ResearchResult> {
  const prompt = `Topic: ${candidate.topic}
Content type: ${candidate.content_type}
Intended angle: ${candidate.angle}
Subcategory: ${candidate.subcategory}

Research this topic thoroughly enough for a substantive, accurate article.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  const blocks: Block[] = [];
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 8 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6, max_content_tokens: 25000 },
  ];

  let response: Anthropic.Beta.BetaMessage | null = null;
  for (let turn = 0; turn < 6; turn++) {
    response = await anthropic()
      .beta.messages.stream({ ...baseParams("high"), max_tokens: 48000, system: SYSTEM, tools, messages })
      .finalMessage();
    assertNotRefused(response, "research");
    blocks.push(...response.content);
    if (response.stop_reason !== "pause_turn") break;
    // Server-side tool loop paused; send the partial turn back and the server resumes it.
    messages.push({ role: "assistant", content: response.content });
  }
  if (response?.stop_reason === "pause_turn") throw new Error("research: server tool loop did not finish after 6 continuations.");
  if (response?.stop_reason === "max_tokens") throw new Error("research: notes were cut off at max_tokens.");

  return assembleResearch(blocks);
}

/** Exported for tests: turn raw response blocks into a dossier with a verified source registry. */
export function assembleResearch(blocks: Block[]): ResearchResult {
  const registry = new Map<string, { title: string; url: string }>();
  const searches: string[] = [];
  const remember = (url: string, title: string | null | undefined) => {
    const key = normalizeUrl(url);
    const existing = registry.get(key);
    if (!existing || (!existing.title && title)) registry.set(key, { url, title: title || existing?.title || url });
  };

  for (const b of blocks) {
    if (b.type === "server_tool_use" && b.name === "web_search") {
      const q = (b.input as { query?: string })?.query;
      if (q) searches.push(q);
    }
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) remember(r.url, r.title);
    }
    if (b.type === "web_fetch_tool_result" && b.content.type === "web_fetch_result") {
      remember(b.content.url, b.content.content.title);
    }
  }

  // Stable IDs in retrieval order.
  const ids = new Map<string, string>();
  [...registry.keys()].forEach((key, i) => ids.set(key, `S${i + 1}`));
  const idFor = (url: string) => ids.get(normalizeUrl(url));

  // Build the dossier text: inline automatic citations as [S#], then swap literal URLs for IDs.
  let dossier = "";
  for (const b of blocks) {
    if (b.type !== "text") continue;
    dossier += b.text;
    const cited = new Set<string>();
    for (const c of b.citations ?? []) {
      if (c.type === "web_search_result_location") {
        const id = idFor(c.url);
        if (id) cited.add(id);
      }
    }
    if (cited.size) dossier += ` [${[...cited].join(", ")}]`;
  }

  let unretrieved = 0;
  dossier = dossier.replace(/\(?<?(https?:\/\/[^\s)>\]]+)>?\)?/g, (_m, url: string) => {
    const clean = url.replace(/[.,;:]+$/, "");
    const id = idFor(clean);
    if (id) return `[${id}]`;
    unretrieved++;
    return "[source not retrieved — do not use]";
  });

  const used = new Set(dossier.match(/\bS\d+\b/g) ?? []);
  const sources: Source[] = [...registry.entries()]
    .filter(([key]) => used.has(ids.get(key)!))
    .map(([key, v]) => ({ id: ids.get(key)!, title: v.title, url: v.url }));

  const verdict = dossier.match(/VERDICT:\s*(SUFFICIENT|INSUFFICIENT)\s*:?\s*(.*)/i);
  let sufficient = verdict?.[1]?.toUpperCase() === "SUFFICIENT";
  let reason = verdict ? (verdict[2]?.trim() || verdict[1]) : "researcher gave no verdict";

  const domains = new Set(sources.map((s) => safeHost(s.url)));
  if (sufficient && (sources.length < 3 || domains.size < 2)) {
    sufficient = false;
    reason = `only ${sources.length} retrieved source(s) across ${domains.size} domain(s) are actually used in the notes (need ≥3 across ≥2 domains)`;
  }
  if (unretrieved) reason += ` (${unretrieved} URL(s) in the notes were not in the search results and were removed)`;

  return {
    sufficient,
    reason,
    dossier: dossier.trim(),
    sources,
    retrievedCount: registry.size,
    disputedPoints: extractSection(dossier, "Disputed or uncertain"),
    searches,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function extractSection(text: string, heading: string): string[] {
  const start = text.search(new RegExp(`^#+\\s*${heading}`, "im"));
  if (start < 0) return [];
  const rest = text.slice(start).split("\n").slice(1);
  const out: string[] = [];
  for (const line of rest) {
    if (/^#+\s/.test(line) || /^VERDICT:/i.test(line)) break;
    const item = line.replace(/^\s*[-*•]\s*/, "").trim();
    if (item && !/^none found/i.test(item)) out.push(item);
  }
  return out;
}
