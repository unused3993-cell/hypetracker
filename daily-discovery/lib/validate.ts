import { articleWordCount, mostSimilar, WORD_TARGET } from "./text";
import type { ArticleContent, LinkStatus, Source, ValidationIssue } from "./types";
import type { DraftArticle } from "./writer";

const MIN_SOURCES = 3;

/** Structural, sourcing, length, and duplicate checks. Pure — no network. */
export function validateDraft(
  draft: DraftArticle,
  researchSources: Source[],
  pastTitles: string[],
  duplicateThreshold: number,
): { issues: ValidationIssue[]; content: ArticleContent; wordCount: number; sources: Source[] } {
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string) => issues.push({ level: "error", code, message });
  const warn = (code: string, message: string) => issues.push({ level: "warning", code, message });

  // Required fields
  const text = (s: string | undefined) => (s ?? "").trim();
  if (!text(draft.title)) err("missing_title", "Title is empty.");
  if (!text(draft.subtitle)) err("missing_subtitle", "Subtitle is empty.");
  if (!draft.introduction?.some((p) => text(p))) err("missing_introduction", "Introduction is empty.");

  // Structure
  const sections = (draft.sections ?? []).map((s) => ({
    heading: text(s.heading),
    paragraphs: (s.paragraphs ?? []).map(text).filter(Boolean),
    source_ids: [...new Set(s.source_ids ?? [])],
  }));
  if (sections.length < 2) err("too_few_sections", `Body has ${sections.length} section(s); expected at least 2 with subheadings.`);
  if (sections.length > 7) warn("many_sections", `Body has ${sections.length} sections; expected 3-5.`);
  sections.forEach((s, i) => {
    if (!s.heading) err("missing_heading", `Section ${i + 1} has no subheading.`);
    if (s.paragraphs.length === 0) err("empty_section", `Section "${s.heading || i + 1}" has no paragraphs.`);
  });
  if ((draft.subtitle ?? "").split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length > 1)
    warn("subtitle_length", "Subtitle should be a single sentence.");

  // Related topics
  const related = (draft.related_topics ?? []).map(text).filter(Boolean);
  if (related.length !== 3) warn("related_topics_count", `Expected 3 related topics, got ${related.length}.`);

  // Sources: only IDs from the research registry count. Unknown IDs mean the writer invented a reference.
  const byId = new Map(researchSources.map((s) => [s.id, s]));
  const citedIds = new Set(sections.flatMap((s) => s.source_ids));
  const unknown = [...citedIds].filter((id) => !byId.has(id));
  if (unknown.length) warn("unknown_source_ids", `Article referenced source IDs not in the research: ${unknown.join(", ")} (dropped).`);
  const sources = [...citedIds].filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  if (sources.length === 0) err("missing_sources", "Article cites none of the researched sources.");
  else if (sources.length < MIN_SOURCES) warn("few_sources", `Only ${sources.length} source(s) cited; aim for at least ${MIN_SOURCES}.`);
  sections.forEach((s) => {
    if (!s.source_ids.some((id) => byId.has(id))) warn("unsourced_section", `Section "${s.heading}" lists no valid sources.`);
  });

  // Length
  const content: ArticleContent = {
    introduction: (draft.introduction ?? []).map(text).filter(Boolean),
    sections: sections.map((s) => ({ ...s, source_ids: s.source_ids.filter((id) => byId.has(id)) })),
  };
  const wordCount = articleWordCount(content);
  if (wordCount < WORD_TARGET.min || wordCount > WORD_TARGET.max)
    warn("word_count", `Body is ${wordCount} words; target is ${WORD_TARGET.min}-${WORD_TARGET.max}.`);

  // Duplicates
  const dup = mostSimilar(draft.title ?? "", pastTitles);
  if (dup.score >= duplicateThreshold) err("duplicate_topic", `Title is very similar to an earlier discovery: "${dup.match}".`);

  // Cheap red flags for fabrication-prone patterns.
  const allText = [...content.introduction, ...content.sections.flatMap((s) => s.paragraphs)].join("\n");
  const quotes = allText.match(/[“"][^”"]{25,}[”"]/g) ?? [];
  if (quotes.length) warn("contains_quotations", `Contains ${quotes.length} direct quotation(s); confirm they appear in the cited sources.`);
  if (/\b(scientists|historians|experts|researchers) (say|believe|agree)\b/i.test(allText) && sources.length < 2)
    warn("vague_attribution", "Uses vague attribution (\"experts say\") with little sourcing.");
  const rhetorical = (allText.match(/\?/g) ?? []).length;
  if (rhetorical > 2) warn("rhetorical_questions", `Contains ${rhetorical} questions; editorial guidelines discourage rhetorical questions.`);

  return { issues, content, wordCount, sources };
}

/** Check that source URLs resolve. Some reputable sites block bots (403/429) — those are "unverified", not broken. */
export async function checkLinks(sources: Source[], timeoutMs = 12000): Promise<Source[]> {
  return Promise.all(
    sources.map(async (s) => {
      const { status, detail } = await probe(s.url, timeoutMs);
      return { ...s, link_status: status, link_detail: detail };
    }),
  );
}

async function probe(url: string, timeoutMs: number): Promise<{ status: LinkStatus; detail: string }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Mozilla/5.0 (compatible; DailyDiscoveryLinkCheck/0.1)", accept: "text/html,*/*" },
    });
    res.body?.cancel().catch(() => {});
    if (res.ok) return { status: "ok", detail: `HTTP ${res.status}` };
    if ([401, 403, 405, 429, 451].includes(res.status) || res.status >= 500)
      return { status: "unverified", detail: `HTTP ${res.status} (site may block automated checks)` };
    return { status: "broken", detail: `HTTP ${res.status}` };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError") return { status: "unverified", detail: "timed out" };
    return { status: "broken", detail: e instanceof Error ? e.message : String(e) };
  }
}
