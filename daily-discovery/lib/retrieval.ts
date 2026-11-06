// Source retrieval without a model: Wikipedia (and the pages it cites) and OpenAlex abstracts,
// fetched and parsed in code. Anthropic web search is a capped fallback used when free sources
// don't yield enough substantive full-text material.

import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, assertNotRefused, baseParams } from "./claude";
import { config, stages } from "./config";
import { worstCaseUsd, type CostTracker } from "./cost";
import { decodeEntities, extractReadableText } from "./html";
import { normalizeUrl, topicTokens } from "./text";
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
/** arXiv PDF links → the HTML full text (newer papers) or the abstract page. */
export function arxivAlternates(url: string): string[] | null {
  const m = url.match(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:pdf|abs|html)\/([\w.\/-]+?)(?:v\d+)?(?:\.pdf)?$/i);
  return m ? [`https://arxiv.org/html/${m[1]}`, `https://arxiv.org/abs/${m[1]}`] : null;
}

export async function fetchPage(url: string, origin: SourceOrigin, titleHint = ""): Promise<Omit<SourceRecord, "id">> {
  const alternates = arxivAlternates(url);
  if (alternates) {
    let last: Omit<SourceRecord, "id"> | null = null;
    for (const alt of alternates) {
      last = await fetchHtml(alt, origin, titleHint);
      if (last.content_status === "retrieved") return last;
    }
    return last!;
  }
  return fetchHtml(url, origin, titleHint);
}

async function fetchHtml(url: string, origin: SourceOrigin, titleHint: string): Promise<Omit<SourceRecord, "id">> {
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
    if (text.length < 400) return { ...base, title: title || base.title, content_status: "fetch_failed", detail: "too little readable text (paywall, or rendered by JavaScript?)" };
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

// Link targets that are rarely readable articles: catalogues, bibliographic databases, book
// scans, paywalls, social media. (Live test: Zenodo, ADS, Semantic Scholar and PubMed all
// blocked the crawler or returned no article text.)
const SKIP_REFERENCE_HOSTS = /(^|\.)((wikipedia|wikimedia|wikidata|wiktionary|wikisource)\.org|books\.google\.[a-z.]+|worldcat\.org|jstor\.org|doi\.org|amazon\.[a-z.]+|google\.[a-z.]+|youtube\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|viaf\.org|id\.loc\.gov|isni\.org|d-nb\.info|catalogue\.bnf\.fr|openlibrary\.org|zenodo\.org|adsabs\.harvard\.edu|semanticscholar\.org|pubmed\.ncbi\.nlm\.nih\.gov|researchgate\.net|academia\.edu|hathitrust\.org)$/i;

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
    if (!/^https?:/.test(url) || !host || SKIP_REFERENCE_HOSTS.test(host) || (/\.pdf($|[?#])/i.test(url) && !arxivAlternates(url))) continue;
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
  /** OpenAlex embeds Unpaywall's open-access data; no separate Unpaywall call or email is needed. */
  best_oa_location?: { landing_page_url?: string | null; pdf_url?: string | null } | null;
  open_access?: { is_oa?: boolean; oa_url?: string | null } | null;
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
  const works = (r?.results ?? []).filter((w) => w.abstract_inverted_index && w.display_name);
  return Promise.all(
    works.map(async (w) => {
      const authors = (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean).slice(0, 3).join(", ");
      const venue = w.primary_location?.source?.display_name;
      const abstract = decodeEntities(rebuildAbstract(w.abstract_inverted_index!)).normalize("NFKC");
      const record: Omit<SourceRecord, "id"> = {
        url: w.doi ?? w.primary_location?.landing_page_url ?? w.id,
        title: `${w.display_name}${authors ? ` — ${authors}` : ""}${w.publication_year ? ` (${w.publication_year})` : ""}${venue ? `, ${venue}` : ""}`,
        origin: "openalex",
        content_status: "retrieved",
        detail: "abstract only (via OpenAlex)",
        retrieved_at: new Date().toISOString(),
        text: `${w.display_name}\n\n${abstract}`,
      };
      // Open-access full text, when the free copy is a readable web page (PDFs are still skipped).
      const oaPage = w.best_oa_location?.landing_page_url ?? w.open_access?.oa_url;
      if (oaPage && !/\.pdf($|[?#])/i.test(oaPage)) {
        const page = await fetchPage(oaPage, "openalex");
        if (page.content_status === "retrieved" && (page.text?.length ?? 0) > 3000) {
          record.text = `${w.display_name}\n\n${abstract}\n\n${excerptRelevant(page.text!, queryText(q), config.research.maxBookChars)}`;
          record.detail = `open-access full text (${hostOf(page.url)}, via OpenAlex/Unpaywall)`;
        }
      }
      return record;
    }),
  );
}

// ── Long texts: keep only the relevant parts ───────────────────────────────

const queryText = (q: ResearchQuery) => `${q.topic} ${q.angle} ${q.searchTerms.join(" ")}`;

/**
 * Books run to hundreds of thousands of characters; keep the chunks that mention the topic,
 * in their original order, joined with an elision mark. Returns "" if nothing is relevant.
 */
export function excerptRelevant(text: string, query: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const terms = topicTokens(query);
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: { i: number; text: string; score: number }[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf && buf.length + p.length > 1500) {
      chunks.push({ i: chunks.length, text: buf, score: 0 });
      buf = "";
    }
    buf = buf ? `${buf}\n\n${p}` : p;
  }
  if (buf) chunks.push({ i: chunks.length, text: buf, score: 0 });
  for (const c of chunks) {
    const toks = topicTokens(c.text);
    for (const t of terms) if (toks.has(t)) c.score++;
  }
  const best = chunks.filter((c) => c.score >= 2).sort((a, b) => b.score - a.score);
  const kept: typeof chunks = [];
  let used = 0;
  for (const c of best) {
    if (used + c.text.length > maxChars) continue;
    kept.push(c);
    used += c.text.length;
  }
  return kept
    .sort((a, b) => a.i - b.i)
    .map((c) => c.text)
    .join("\n\n[…]\n\n");
}

/** Plain-text books wrap lines at ~70 characters; rejoin lines within paragraphs. */
export function unwrapPlainText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.replace(/-\n(?=[a-z])/g, "").replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await get(url, "text/plain");
    if (!res.ok) return null;
    return (await res.text()).slice(0, 8_000_000);
  } catch {
    return null;
  }
}

function bookRecord(url: string, title: string, origin: SourceOrigin, raw: string, q: ResearchQuery, detail: string): Omit<SourceRecord, "id"> | null {
  const excerpt = excerptRelevant(unwrapPlainText(raw).normalize("NFKC"), queryText(q), config.research.maxBookChars);
  if (excerpt.length < 1500) return null; // the book barely mentions the topic
  return { url, title, origin, content_status: "retrieved", detail, retrieved_at: new Date().toISOString(), text: excerpt };
}

// ── Project Gutenberg (via the free Gutendex API) ──────────────────────────

interface GutendexBook {
  id: number;
  title: string;
  authors?: { name: string }[];
  formats?: Record<string, string>;
}

export async function gutenbergSources(q: ResearchQuery): Promise<Omit<SourceRecord, "id">[]> {
  const r = await getJson<{ results?: GutendexBook[] }>(`https://gutendex.com/books/?search=${encodeURIComponent(q.searchTerms[0] ?? q.topic)}`);
  for (const book of (r?.results ?? []).slice(0, 3)) {
    const formats = book.formats ?? {};
    const textUrl = Object.entries(formats).find(([type, u]) => type.startsWith("text/plain") && !u.endsWith(".zip"))?.[1];
    if (!textUrl) continue;
    const raw = await getText(textUrl);
    if (!raw) continue;
    // Strip the Project Gutenberg licence header and footer.
    const start = raw.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
    const end = raw.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i);
    const body = raw.slice(start >= 0 ? raw.indexOf("\n", start) + 1 : 0, end > 0 ? end : undefined);
    const author = book.authors?.[0]?.name;
    const rec = bookRecord(`https://www.gutenberg.org/ebooks/${book.id}`, `${book.title}${author ? ` — ${author}` : ""} (Project Gutenberg)`, "gutenberg", body, q, "public-domain book; relevant excerpts");
    if (rec) return [rec];
  }
  return [];
}

// ── Internet Archive (public-domain texts) ─────────────────────────────────

interface ArchiveDoc {
  identifier: string;
  title?: string;
  creator?: string | string[];
  year?: string | number;
}

export async function internetArchiveSources(q: ResearchQuery): Promise<Omit<SourceRecord, "id">[]> {
  // Exclude lending-library copies, whose full text can't be downloaded.
  const query = `(${q.searchTerms[0] ?? q.topic}) AND mediatype:texts AND NOT collection:inlibrary AND NOT collection:printdisabled`;
  const r = await getJson<{ response?: { docs?: ArchiveDoc[] } }>(
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&rows=4&output=json`,
  );
  for (const doc of (r?.response?.docs ?? []).slice(0, 4)) {
    const raw = await getText(`https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(doc.identifier)}_djvu.txt`);
    if (!raw) continue;
    const creator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator;
    const rec = bookRecord(
      `https://archive.org/details/${doc.identifier}`,
      `${doc.title ?? doc.identifier}${creator ? ` — ${creator}` : ""}${doc.year ? ` (${doc.year})` : ""} (Internet Archive)`,
      "internet_archive",
      raw,
      q,
      "public-domain book (OCR text); relevant excerpts",
    );
    if (rec) return [rec];
  }
  return [];
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
  const system = `You find reputable, substantive web pages for a magazine feature. Run at most ${max} searches. Prefer museums, universities, scholarly and scientific organisations, primary-source archives, and established reference or science-journalism publishers, in pages that can be read freely as HTML (avoid PDFs, paywalls, and login walls). Avoid content farms, forums, and AI-written pages. Reply with one line per page you recommend: URL — why it is reputable.`;
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

/** Retrieved sources with substantial text (abstracts don't count). */
const fullText = (sources: Omit<SourceRecord, "id">[]) =>
  sources.filter((s) => s.content_status === "retrieved" && (s.origin !== "openalex" || s.detail?.startsWith("open-access")) && (s.text?.length ?? 0) >= 2000).length;

export async function retrieveSources(q: ResearchQuery, tracker: CostTracker, reserveUsd: number, allowWebSearch = true, forceWebSearch = false): Promise<RetrievalResult> {
  const log: string[] = [];
  const all: Omit<SourceRecord, "id">[] = [];

  const wp = await wikipediaSources(q);
  if (wp.article) all.push(wp.article);
  log.push(wp.article ? `Wikipedia: ${wp.article.title}; ${wp.references.length} cited sites` : "Wikipedia: no article found");

  const [refs, oa, gutenberg, archive] = await Promise.all([
    inBatches(wp.references.slice(0, config.research.maxReferencePages), 4, (u) => fetchPage(u, "wikipedia_reference")),
    openAlexSources(q),
    gutenbergSources(q),
    internetArchiveSources(q),
  ]);
  all.push(...refs, ...oa, ...gutenberg, ...archive);
  log.push(`Wikipedia references: ${refs.filter((r) => r.content_status === "retrieved").length}/${refs.length} retrieved`);
  log.push(`OpenAlex: ${oa.length} papers (${oa.filter((s) => s.detail?.startsWith("open-access")).length} with open-access full text)`);
  log.push(`Books: ${gutenberg.length ? gutenberg[0].title : "no relevant Project Gutenberg text"}; ${archive.length ? archive[0].title : "no relevant Internet Archive text"}`);

  let usedWebSearch = false;
  if (allowWebSearch && (forceWebSearch || fullText(all) < config.research.targetSources)) {
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
    pages.forEach((p, i) => {
      if (toFetch[i].excerpts.length) p.excerpts = toFetch[i].excerpts;
    });
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
