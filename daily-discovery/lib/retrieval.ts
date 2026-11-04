// Source retrieval without a model: Wikipedia (and the pages it cites) and OpenAlex abstracts,
// fetched and parsed in code. Anthropic web search is a capped fallback used only when free
// sources don't give enough independent, non-encyclopedic material.

import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, assertNotRefused, baseParams } from "./claude";
import { config, stages } from "./config";
import { worstCaseUsd, type CostTracker } from "./cost";
import { decodeEntities, extractReadableText } from "./html";
import { normalizeUrl } from "./text";
import type { SourceOrigin, SourceRecord } from "./types";

export interface ResearchQuery {
  topic: string;
  angle: string;
  searchTerms: string[];
}

type FetchLike = typeof fetch;
let httpFetch: FetchLike = (...args) => fetch(...args);
/** Tests swap in fixture responses. */
export function setFetchForTests(f: FetchLike | null) {
  httpFetch = f ?? ((...args) => fetch(...args));
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

async function get(url: string, accept: string): Promise<Response> {
  return httpFetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(config.research.fetchTimeoutMs),
    headers: { "user-agent": config.research.userAgent, accept },
  });
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await get(url, "application/json");
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

// ── Web pages ──────────────────────────────────────────────────────────────

/** Fetch one page and keep its readable text. Never throws; failures are recorded on the source. */
export async function fetchPage(url: string, origin: SourceOrigin, titleHint = ""): Promise<Omit<SourceRecord, "id">> {
  const base = { url, title: titleHint || url, origin };
  if (/\.pdf($|[?#])/i.test(url)) return { ...base, content_status: "skipped", detail: "PDF (not supported yet)" };
  try {
    const res = await get(url, "text/html,application/xhtml+xml");
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) return { ...base, content_status: "fetch_failed", detail: `HTTP ${res.status}` };
    if (type.includes("pdf")) return { ...base, content_status: "skipped", detail: "PDF (not supported yet)" };
    if (!type.includes("html")) return { ...base, content_status: "skipped", detail: `unsupported content type ${type || "unknown"}` };
    const html = (await res.text()).slice(0, 3_000_000);
    const { title, text } = extractReadableText(html);
    if (text.length < 500) return { ...base, title: title || base.title, content_status: "fetch_failed", detail: "too little readable text (paywall, or rendered by JavaScript?)" };
    return {
      ...base,
      url: res.url || url,
      title: title || base.title,
      content_status: "retrieved",
      detail: `HTTP ${res.status}`,
      retrieved_at: new Date().toISOString(),
      text: text.slice(0, config.research.maxSourceChars),
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return { ...base, content_status: "fetch_failed", detail: name === "TimeoutError" ? "timed out" : e instanceof Error ? e.message : String(e) };
  }
}

async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

// ── Wikipedia ──────────────────────────────────────────────────────────────

const WP = "https://en.wikipedia.org/w/api.php";

// Link targets that are rarely readable HTML articles (catalogues, book scans, paywalls, social).
const SKIP_REFERENCE_HOSTS = /(^|\.)((wikipedia|wikimedia|wikidata|wiktionary|wikisource)\.org|books\.google\.[a-z.]+|worldcat\.org|jstor\.org|doi\.org|amazon\.[a-z.]+|google\.[a-z.]+|youtube\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|viaf\.org|id\.loc\.gov|isni\.org|d-nb\.info|catalogue\.bnf\.fr|openlibrary\.org)$/i;

export async function wikipediaSources(q: ResearchQuery): Promise<{ article: Omit<SourceRecord, "id"> | null; references: string[] }> {
  let title: string | null = null;
  for (const term of q.searchTerms) {
    const r = await getJson<{ query?: { search?: { title: string }[] } }>(
      `${WP}?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(term)}`,
    );
    title = r?.query?.search?.[0]?.title ?? null;
    if (title) break;
  }
  if (!title) return { article: null, references: [] };

  const ex = await getJson<{ query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string; missing?: string }> } }>(
    `${WP}?action=query&prop=extracts|info&explaintext=1&exsectionformat=wiki&inprop=url&redirects=1&format=json&titles=${encodeURIComponent(title)}`,
  );
  const page = ex?.query?.pages ? Object.values(ex.query.pages)[0] : undefined;
  if (!page?.extract) return { article: null, references: [] };
  const text = page.extract
    .replace(/^=+\s*(.+?)\s*=+$/gm, "## $1")
    .replace(/\n{3,}/g, "\n\n")
    .normalize("NFKC")
    .slice(0, config.research.maxSourceChars);
  const article: Omit<SourceRecord, "id"> = {
    url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    title: `${page.title} — Wikipedia`,
    origin: "wikipedia",
    content_status: "retrieved",
    retrieved_at: new Date().toISOString(),
    text,
  };

  const links = await getJson<{ parse?: { externallinks?: string[] } }>(
    `${WP}?action=parse&prop=externallinks&format=json&redirects=1&page=${encodeURIComponent(page.title)}`,
  );
  const seenHosts = new Set<string>();
  const references: string[] = [];
  for (const raw of links?.parse?.externallinks ?? []) {
    const url = raw.startsWith("//") ? `https:${raw}` : raw;
    const host = hostOf(url);
    if (!/^https?:/.test(url) || !host || SKIP_REFERENCE_HOSTS.test(host) || /\.pdf($|[?#])/i.test(url)) continue;
    if (seenHosts.has(host)) continue; // one page per site keeps sources independent
    seenHosts.add(host);
    references.push(url);
  }
  return { article, references };
}

// ── OpenAlex (scholarly abstracts) ─────────────────────────────────────────

interface OpenAlexWork {
  id: string;
  doi?: string | null;
  display_name?: string;
  publication_year?: number;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { landing_page_url?: string | null; source?: { display_name?: string } | null } | null;
}

export function rebuildAbstract(index: Record<string, number[]>): string {
  const words: string[] = [];
  for (const [w, positions] of Object.entries(index)) for (const p of positions) words[p] = w;
  return words.filter(Boolean).join(" ");
}

export async function openAlexSources(q: ResearchQuery, limit = 3): Promise<Omit<SourceRecord, "id">[]> {
  const mailto = config.research.openAlexMailto ? `&mailto=${encodeURIComponent(config.research.openAlexMailto)}` : "";
  const r = await getJson<{ results?: OpenAlexWork[] }>(
    `https://api.openalex.org/works?per-page=${limit}&filter=has_abstract:true&search=${encodeURIComponent(q.searchTerms[0] ?? q.topic)}${mailto}`,
  );
  return (r?.results ?? [])
    .filter((w) => w.abstract_inverted_index && w.display_name)
    .map((w) => {
      const authors = (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean).slice(0, 3).join(", ");
      const venue = w.primary_location?.source?.display_name;
      const abstract = decodeEntities(rebuildAbstract(w.abstract_inverted_index!)).normalize("NFKC");
      return {
        url: w.doi ?? w.primary_location?.landing_page_url ?? w.id,
        title: `${w.display_name}${authors ? ` — ${authors}` : ""}${w.publication_year ? ` (${w.publication_year})` : ""}${venue ? `, ${venue}` : ""}`,
        origin: "openalex" as const,
        content_status: "retrieved" as const,
        detail: "abstract only (via OpenAlex)",
        retrieved_at: new Date().toISOString(),
        text: `${w.display_name}\n\n${abstract}`,
      };
    });
}

// ── Anthropic web search (capped fallback) ─────────────────────────────────

let lastSearch: Anthropic.Beta.BetaMessage | null = null;
/** The most recent raw search response, for inspecting the API's actual format. */
export const lastSearchResponse = () => lastSearch;

/**
 * Ask a cheap model to run a few searches; we keep the result URLs (and any cited excerpts)
 * and fetch the pages ourselves. Search results carry no readable page text, only
 * encrypted content, so they are never evidence by themselves.
 */
export async function webSearchFallback(q: ResearchQuery, exclude: Set<string>, tracker: CostTracker, reserveUsd: number) {
  const s = stages.search;
  const max = config.research.maxSearches;
  const system = `You find authoritative web pages for a fact-checked article. Run at most ${max} searches. Prefer museums, universities, scholarly and scientific organisations, primary-source archives and established reference or news publishers. Avoid content farms, forums, and AI-written pages. Reply with one line per page you recommend: URL — why it is authoritative.`;
  const prompt = `Topic: ${q.topic}\nAngle: ${q.angle}\nSuggested queries: ${q.searchTerms.join(" | ")}`;
  // Each search adds result content to the model's context; budget ~8K tokens per search.
  const worst = worstCaseUsd(s.model, system.length + prompt.length, s.maxTokens, max, max * 8000);
  tracker.authorize("search", s.model, worst, reserveUsd);

  const tool = { type: config.research.searchTool, name: "web_search" as const, max_uses: max } as Anthropic.Beta.BetaToolUnion;
  const response = await anthropic()
    .beta.messages.stream({ ...baseParams(s), system, tools: [tool], messages: [{ role: "user", content: prompt }] })
    .finalMessage();
  tracker.record("search", s.model, response.usage, response.model);
  lastSearch = response;
  assertNotRefused(response, "search");

  const found = new Map<string, { url: string; title: string; excerpts: string[] }>();
  for (const b of response.content) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) {
        const key = normalizeUrl(r.url);
        if (!found.has(key)) found.set(key, { url: r.url, title: r.title, excerpts: [] });
      }
    }
    if (b.type === "text") {
      for (const c of b.citations ?? []) {
        if (c.type === "web_search_result_location") found.get(normalizeUrl(c.url))?.excerpts.push(c.cited_text);
      }
    }
  }
  // Pages the model recommended in its text come first.
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
  const recommended = [...found.values()].sort((a, b) => Number(text.includes(b.url)) - Number(text.includes(a.url)));
  return recommended.filter((r) => !exclude.has(normalizeUrl(r.url)));
}

// ── Orchestration ──────────────────────────────────────────────────────────

export interface RetrievalResult {
  sources: SourceRecord[];
  usedWebSearch: boolean;
  log: string[];
}

/** Count retrieved sources that are not encyclopedias (independent, citable material). */
const independent = (sources: Omit<SourceRecord, "id">[]) =>
  sources.filter((s) => s.content_status === "retrieved" && s.origin !== "wikipedia").length;

export async function retrieveSources(q: ResearchQuery, tracker: CostTracker, reserveUsd: number, allowWebSearch = true, forceWebSearch = false): Promise<RetrievalResult> {
  const log: string[] = [];
  const all: Omit<SourceRecord, "id">[] = [];

  const wp = await wikipediaSources(q);
  if (wp.article) all.push(wp.article);
  log.push(wp.article ? `Wikipedia: ${wp.article.title}; ${wp.references.length} cited sites` : "Wikipedia: no article found");

  const refs = await inBatches(wp.references.slice(0, config.research.maxReferencePages), 4, (u) => fetchPage(u, "wikipedia_reference"));
  all.push(...refs);
  log.push(`Wikipedia references: ${refs.filter((r) => r.content_status === "retrieved").length}/${refs.length} retrieved`);

  const oa = await openAlexSources(q);
  all.push(...oa);
  log.push(`OpenAlex: ${oa.length} abstracts`);

  let usedWebSearch = false;
  if (allowWebSearch && (forceWebSearch || independent(all) < 3)) {
    usedWebSearch = true;
    const known = new Map(all.map((s) => [normalizeUrl(s.url), s]));
    const found = await webSearchFallback(q, new Set(), tracker, reserveUsd);
    // Results we already hold: keep their search excerpts on the existing record.
    for (const r of found) {
      const existing = known.get(normalizeUrl(r.url));
      if (existing && r.excerpts.length) existing.excerpts = [...(existing.excerpts ?? []), ...r.excerpts];
    }
    const results = found.filter((r) => !known.has(normalizeUrl(r.url)));
    const toFetch = results.slice(0, config.research.maxSearchPages);
    const pages = await inBatches(toFetch, 4, (r) => fetchPage(r.url, "web_search", r.title));
    pages.forEach((p, i) => (p.excerpts = toFetch[i].excerpts.length ? toFetch[i].excerpts : undefined));
    all.push(...pages);
    for (const r of results.slice(config.research.maxSearchPages)) {
      all.push({ url: r.url, title: r.title, origin: "web_search", content_status: "search_result_only", detail: "search result; page not fetched", excerpts: r.excerpts.length ? r.excerpts : undefined });
    }
    log.push(`Web search fallback: ${results.length} results, ${pages.filter((p) => p.content_status === "retrieved").length}/${pages.length} pages retrieved`);
  }

  const seen = new Set<string>();
  const sources: SourceRecord[] = [];
  for (const s of all) {
    const key = normalizeUrl(s.url);
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ ...s, id: `S${sources.length + 1}` });
  }
  return { sources, usedWebSearch, log };
}
