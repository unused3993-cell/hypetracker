// Editorial workflow: topic → research (~5 reputable sources, real text) → write → editorial
// review with targeted corrections → hold for an editor's approval.

import { describeError } from "./claude";
import { config, stages } from "./config";
import { CostTracker, worstCaseUsd } from "./cost";
import { createDiscoveryRow, listHistory, listInterests, updateDiscovery } from "./db";
import { DEFAULT_INTERESTS, planCategory } from "./interests";
import { selectPassages } from "./passages";
import { retrieveSources, type ResearchQuery } from "./retrieval";
import { reviewArticle, reviewWorstCase } from "./review";
import { articleWordCount, readingTimeMinutes } from "./text";
import { generateCandidates, type Candidate } from "./topics";
import type { ArticleContent, ContentType, EditorialReview, GenerationStatus, LogEntry, ResearchPack, Source, ValidationIssue, ValidationReport } from "./types";
import { validateDraft } from "./validate";
import { critiqueArticle, rewriteArticle, sharedContext, WORD_RANGE, writeArticle, type Critique, type DraftArticle } from "./writer";
import { worstCaseCachedUsd } from "./cost";

const DISCLAIMER =
  "Checked by an editorial-review model against the retrieved sources; corrections it proposed were applied. This is automated review, not professional fact-checking; an editor approves each article before publication.";
export const PRICING_NOTE =
  "Costs are computed from token usage reported by the API, priced with the table in lib/config.ts (Anthropic documentation as of 2026-10-06). Check against Console billing.";

type Note = (message: string, data?: unknown) => void;

/** Money to hold back during topic choice and research so a sourced topic can always be written AND reviewed. */
function writingReserve(): number {
  return worstCaseUsd(stages.write.model, config.research.maxPassageChars + 6000, stages.write.maxTokens) + worstCaseUsd(stages.review.model, config.research.maxPassageChars + 18000, stages.review.maxTokens);
}

/** Gather sources and select the material the writer will read. Null if there isn't enough. */
export async function gatherResearch(query: ResearchQuery, tracker: CostTracker, note: Note, opts: { forceWebSearch?: boolean } = {}): Promise<ResearchPack | null> {
  const retrieval = await retrieveSources(query, tracker, writingReserve(), true, opts.forceWebSearch ?? false);
  for (const line of retrieval.log) note(line);
  const passages = selectPassages(retrieval.sources, `${query.topic} ${query.angle} ${query.searchTerms.join(" ")}`);
  const used = new Set(passages.map((p) => p.source_id));
  const chars = passages.reduce((n, p) => n + p.text.length, 0);
  note(
    `${retrieval.sources.filter((s) => s.content_status === "retrieved").length}/${retrieval.sources.length} sources retrieved; material from ${used.size} sources, ${chars.toLocaleString()} chars`,
    retrieval.sources.map((s) => ({ id: s.id, url: s.url, origin: s.origin, status: s.content_status, detail: s.detail, chars: s.text?.length ?? 0, used: used.has(s.id) })),
  );
  if (used.size < 3 || chars < config.research.minMaterialChars) {
    note("REJECTED: not enough substantive source material for a feature");
    return null;
  }
  return { sources: retrieval.sources, passages };
}

export interface Produced {
  draft: DraftArticle;
  critique: Critique | null;
  rewrite: DraftArticle | null;
  article: DraftArticle;
  review: EditorialReview;
}

/** Write and review one article from a research pack. */
export async function produceArticle(opts: { query: ResearchQuery; contentType: ContentType; pack: ResearchPack; tracker: CostTracker; note: Note; writer?: typeof stages.write; rewriter?: typeof stages.rewrite }): Promise<Produced> {
  const write = (retryNote?: string) =>
    writeArticle({
      topic: opts.query.topic,
      angle: opts.query.angle,
      contentType: opts.contentType,
      pack: opts.pack,
      tracker: opts.tracker,
      reserveUsd: reviewWorstCase(opts.pack),
      settings: opts.writer,
      retryNote,
    });
  let draft = await write();
  // A model occasionally returns only an opening. Ask once more for the complete piece.
  const words = (d: DraftArticle) => articleWordCount({ introduction: d.introduction, sections: d.sections.map((s) => ({ ...s, source_ids: [] })) });
  if (draft.sections.length === 0 || words(draft) < WORD_RANGE.min * 0.6) {
    opts.note(`draft incomplete (${words(draft)} words, ${draft.sections.length} sections); asking the writer for the full piece`);
    draft = await write(`Your previous attempt returned only ${words(draft)} words. Write the complete article, about ${WORD_RANGE.min}-${WORD_RANGE.max} words, with the body of the story in "sections".`);
  }
  opts.note(`draft: "${draft.title}" (${words(draft)} words). Plan: ${draft.plan}`);

  // Edit and rewrite. Optional: skipped if they can't fit under the cap with review reserved.
  const ctx = sharedContext(opts.pack).length;
  const editWorst = worstCaseCachedUsd(stages.edit.model, ctx + 20000, stages.edit.model === (opts.writer ?? stages.write).model ? ctx : 0, stages.edit.maxTokens);
  const rewriter = opts.rewriter ?? stages.rewrite;
  const rewriteWorst = worstCaseCachedUsd(rewriter.model, ctx + 30000, rewriter.model === (opts.writer ?? stages.write).model ? ctx : 0, rewriter.maxTokens);
  let critique: Critique | null = null;
  let rewrite: DraftArticle | null = null;
  let toReview = draft;
  if (opts.tracker.canAfford(editWorst + rewriteWorst, reviewWorstCase(opts.pack))) {
    critique = await critiqueArticle({ draft, pack: opts.pack, tracker: opts.tracker, reserveUsd: rewriteWorst + reviewWorstCase(opts.pack) });
    opts.note(`editor: ${critique.findings.length} finding(s). Spine: ${critique.spine}`, critique);
    rewrite = await rewriteArticle({ topic: opts.query.topic, draft, critique, pack: opts.pack, tracker: opts.tracker, reserveUsd: reviewWorstCase(opts.pack), settings: rewriter });
    if (rewrite.sections.length && words(rewrite) >= WORD_RANGE.min * 0.6) {
      toReview = rewrite;
      opts.note(`rewrite: "${rewrite.title}" (${words(rewrite)} words)`);
    } else opts.note(`rewrite incomplete (${words(rewrite)} words); keeping the draft`);
  } else opts.note("edit and rewrite skipped: not enough budget left under the cap");

  const { article, review } = await reviewArticle({ article: toReview, pack: opts.pack, tracker: opts.tracker });
  const sub = review.issues.filter((i) => i.severity === "substantive");
  opts.note(
    `fact-check: ${review.issues.length} issue(s), ${sub.length} substantive, ${review.issues.filter((i) => i.applied).length} corrected; ${review.passed ? "passed" : "UNRESOLVED substantive issues"}. ${review.summary}`,
    review.issues,
  );
  return { draft, critique, rewrite, article, review };
}

/** Section sources validated against the pack, plus the public source list. */
export function attribution(article: DraftArticle, pack: ResearchPack): { content: ArticleContent; sources: Source[] } {
  const known = new Map(pack.sources.filter((s) => s.content_status === "retrieved").map((s) => [s.id, s]));
  const sections = article.sections.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs, source_ids: [...new Set(s.source_ids)].filter((id) => known.has(id)) }));
  const ids = new Set(sections.flatMap((s) => s.source_ids));
  // Every source the writer read is credited, even if no section named it.
  for (const p of pack.passages) ids.add(p.source_id);
  const sources = [...ids]
    .filter((id) => known.has(id))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    .map((id) => {
      const s = known.get(id)!;
      return { id, title: s.title, url: s.url, link_status: "ok" as const, link_detail: `retrieved ${s.retrieved_at?.slice(0, 10) ?? ""}` };
    });
  return { content: { introduction: article.introduction, sections }, sources };
}

export interface GenerationResult {
  id: string;
  status: GenerationStatus;
  title: string | null;
  costUsd: number;
  error?: string;
}

export async function generateDiscovery(onLog?: (e: LogEntry) => void, options: { topicOverride?: ResearchQuery & { contentType?: ContentType } } = {}): Promise<GenerationResult> {
  const id = await createDiscoveryRow();
  const tracker = new CostTracker(config.budget.maxUsd, config.budget.targetUsd);
  const log: LogEntry[] = [];
  let step = "setup";
  let pack: ResearchPack | null = null;
  const note: Note = (message, data) => {
    const entry: LogEntry = { at: new Date().toISOString(), step, message, ...(data === undefined ? {} : { data }) };
    log.push(entry);
    onLog?.(entry);
  };
  const checkpoint = () => updateDiscovery(id, { generation_log: log, usage: tracker.report(PRICING_NOTE) }).catch(() => {});

  try {
    note(`budget $${config.budget.maxUsd.toFixed(2)} max; writer ${stages.write.model}, reviewer ${stages.review.model}`);

    // 1. Topic
    step = "topic";
    let interests = await listInterests();
    if (interests.length === 0) interests = DEFAULT_INTERESTS;
    const history = (await listHistory()).filter((h) => h.id !== id && (h.topic || h.title));
    const plan = planCategory(interests, history);
    let shortlist: Candidate[];
    if (options.topicOverride) {
      const t = options.topicOverride;
      shortlist = [{ topic: t.topic, angle: t.angle, search_terms: t.searchTerms, content_type: t.contentType ?? "story", subcategory: plan.subcategories[0]?.subcategory ?? "", why_interesting: "", likely_sources: "", relevance: 5, substance: 5, curiosity: 5, source_availability: 5, novelty: 5, score: 0, similarity: 0, similar_to: null }];
      note(`topic override: ${t.topic}`);
    } else {
      note(`category: ${plan.category} (${plan.reason})`);
      const candidates = await generateCandidates(plan, history, history, tracker);
      shortlist = candidates.filter((c) => c.similarity < config.duplicateThreshold);
      note(`${candidates.length} candidates, ${shortlist.length} not duplicates`, candidates.map((c) => ({ topic: c.topic, score: Number(c.score.toFixed(1)) })));
      if (shortlist.length === 0) throw new Error("Every candidate topic duplicated an earlier discovery.");
    }
    await checkpoint();

    // 2. Research
    let chosen: Candidate | null = null;
    let query: ResearchQuery | null = null;
    for (const candidate of shortlist.slice(0, config.maxTopicAttempts)) {
      step = "research";
      note(`researching: ${candidate.topic}`);
      await updateDiscovery(id, { topic: candidate.topic, category: plan.category, subcategory: candidate.subcategory, content_type: candidate.content_type });
      query = { topic: candidate.topic, angle: candidate.angle, searchTerms: candidate.search_terms?.length ? candidate.search_terms : [candidate.topic] };
      pack = await gatherResearch(query, tracker, note);
      if (pack) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen || !pack || !query) throw new Error(`No topic had enough source material after ${config.maxTopicAttempts} attempt(s). See the log.`);
    await updateDiscovery(id, { evidence: pack, generation_log: log, usage: tracker.report(PRICING_NOTE) });

    // 3–4. Write, then editorial review with targeted corrections
    step = "write";
    const { article, review } = await produceArticle({ query, contentType: chosen.content_type, pack, tracker, note });

    // 5. Status (never auto-publish)
    step = "save";
    const pastTitles = history.map((h) => h.title).filter((t): t is string => !!t);
    const structure = validateDraft(article, pastTitles, config.duplicateThreshold);
    const issues: ValidationIssue[] = [...structure.issues];
    const unresolved = review.issues.filter((i) => i.severity === "substantive" && !i.applied);
    if (unresolved.length) issues.push({ level: "error", code: "unresolved_factual_issues", message: `${unresolved.length} substantive issue(s) could not be corrected automatically.` });
    const structuralErrors = structure.issues.filter((i) => i.level === "error");
    const status: GenerationStatus = structuralErrors.some((i) => i.code === "duplicate_topic") ? "failed" : review.passed && structuralErrors.length === 0 ? "verified" : "needs_review";
    note(`status: ${status}; ${structure.wordCount} words; cost $${tracker.spent.toFixed(4)}`);

    const { content, sources } = attribution(article, pack);
    const validation: ValidationReport = { issues, research_notes: article.uncertainties.slice(0, 6), review, disclaimer: DISCLAIMER };
    await updateDiscovery(id, {
      title: article.title.trim(),
      subtitle: article.subtitle.trim(),
      category: plan.category,
      subcategory: chosen.subcategory,
      content_type: chosen.content_type,
      topic: chosen.topic,
      content,
      word_count: structure.wordCount,
      reading_time_minutes: readingTimeMinutes(structure.wordCount),
      sources,
      related_topics: article.related_topics.map((t) => t.trim()).filter(Boolean).slice(0, 3),
      validation,
      evidence: pack,
      usage: tracker.report(PRICING_NOTE),
      generation_log: log,
      generation_status: status,
      error: status === "failed" ? structuralErrors.map((e) => e.message).join(" ") : null,
      published_at: null,
    });
    return { id, status, title: article.title, costUsd: tracker.spent };
  } catch (err) {
    const message = `[${step}] ${describeError(err)}`;
    note(`FAILED: ${message}`);
    console.error(`Discovery ${id} failed:`, err);
    await updateDiscovery(id, { generation_status: "failed", error: message, generation_log: log, usage: tracker.report(PRICING_NOTE), ...(pack ? { evidence: pack } : {}) }).catch((e) =>
      console.error("Could not record failure:", e),
    );
    return { id, status: "failed", title: null, costUsd: tracker.spent, error: message };
  }
}
