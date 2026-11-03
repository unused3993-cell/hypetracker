import { config } from "./config";
import { describeError } from "./claude";
import { createDiscoveryRow, listHistory, listInterests, updateDiscovery } from "./db";
import { DEFAULT_INTERESTS, planCategory } from "./interests";
import { researchTopic, type ResearchResult } from "./research";
import { readingTimeMinutes } from "./text";
import { generateCandidates, type Candidate } from "./topics";
import { checkLinks, validateDraft } from "./validate";
import type { ClaimFlag, GenerationStatus, LogEntry, ValidationIssue, ValidationReport } from "./types";
import { reviewClaims, writeArticle, type DraftArticle } from "./writer";

const DISCLAIMER =
  "Automated checks only: structure, length, sourcing, link reachability, duplicates, and an AI comparison of the article against its own research notes. Passing these checks does not mean the article has been fact-checked.";

const SERIOUS_FLAGS = new Set<ClaimFlag["verdict"]>(["unsupported", "contradicted", "uncertainty_not_acknowledged"]);

export interface GenerationResult {
  id: string;
  status: GenerationStatus;
  title: string | null;
  error?: string;
}

export async function generateDiscovery(onLog?: (e: LogEntry) => void): Promise<GenerationResult> {
  const id = await createDiscoveryRow();
  const log: LogEntry[] = [];
  let step = "setup";
  const note = (message: string, data?: unknown) => {
    const entry: LogEntry = { at: new Date().toISOString(), step, message, ...(data === undefined ? {} : { data }) };
    log.push(entry);
    onLog?.(entry);
  };
  const checkpoint = () => updateDiscovery(id, { generation_log: log }).catch(() => {});

  try {
    // 1. Plan the category -------------------------------------------------
    step = "plan";
    let interests = await listInterests();
    if (interests.length === 0) {
      note("interests table is empty; using built-in default profile");
      interests = DEFAULT_INTERESTS;
    }
    // Exclude this run's own row and abandoned rows that never got a topic.
    const history = (await listHistory()).filter((h) => h.id !== id && (h.topic || h.title));
    const plan = planCategory(interests, history);
    note(`category: ${plan.category} (${plan.reason})`);
    await checkpoint();

    // 2. Candidate pool ----------------------------------------------------
    step = "select";
    const candidates = await generateCandidates(plan, history, history);
    const shortlist = candidates.filter((c) => c.similarity < config.duplicateThreshold);
    note(
      `generated ${candidates.length} candidates; ${candidates.length - shortlist.length} dropped as too similar to past topics`,
      candidates.map((c) => ({
        topic: c.topic,
        subcategory: c.subcategory,
        type: c.content_type,
        score: Number(c.score.toFixed(2)),
        similar_to: c.similarity >= 0.25 ? c.similar_to : undefined,
      })),
    );
    if (shortlist.length === 0) throw new Error("Every candidate topic duplicated an earlier discovery.");
    await checkpoint();

    // 3. Research, falling back to the next candidate if sources are insufficient
    step = "research";
    let chosen: Candidate | null = null;
    let research: ResearchResult | null = null;
    for (const candidate of shortlist.slice(0, config.maxTopicAttempts)) {
      note(`researching: ${candidate.topic}`);
      await updateDiscovery(id, { topic: candidate.topic, category: plan.category, subcategory: candidate.subcategory, content_type: candidate.content_type, generation_log: log });
      const r = await researchTopic(candidate);
      note(`${r.sufficient ? "sufficient" : "REJECTED"}: ${r.reason}`, {
        searches: r.searches,
        retrieved_urls: r.retrievedCount,
        sources_used: r.sources.map((s) => s.url),
      });
      if (r.sufficient) {
        chosen = candidate;
        research = r;
        break;
      }
    }
    if (!chosen || !research)
      throw new Error(`None of the top ${config.maxTopicAttempts} topics had sufficient credible sources. See the log for each rejection.`);
    await checkpoint();

    // 4. Write → validate → review → (revise once) --------------------------
    const pastTitles = history.map((h) => h.title).filter((t): t is string => !!t);
    step = "write";
    let draft: DraftArticle = await writeArticle({
      topic: chosen.topic,
      angle: chosen.angle,
      contentType: chosen.content_type,
      dossier: research.dossier,
      sources: research.sources,
    });
    let checked = validateDraft(draft, research.sources, pastTitles, config.duplicateThreshold);
    note(`draft: "${draft.title}" — ${checked.wordCount} words`, checked.issues);
    await checkpoint();

    step = "review";
    let review = await reviewClaims(draft, research.dossier);
    note(`claim review: ${review.flags.length} flag(s). ${review.summary}`, review.flags);

    let revisions = 0;
    const needsRevision = () =>
      review.flags.some((f) => SERIOUS_FLAGS.has(f.verdict)) ||
      checked.issues.some((i) => i.level === "error" && i.code !== "duplicate_topic") ||
      checked.issues.some((i) => i.code === "word_count");

    if (needsRevision()) {
      step = "revise";
      revisions = 1;
      draft = await writeArticle({
        topic: chosen.topic,
        angle: chosen.angle,
        contentType: chosen.content_type,
        dossier: research.dossier,
        sources: research.sources,
        revision: {
          previous: draft,
          wordCount: checked.wordCount,
          flags: review.flags,
          otherIssues: checked.issues.map((i) => i.message),
        },
      });
      checked = validateDraft(draft, research.sources, pastTitles, config.duplicateThreshold);
      note(`revised: "${draft.title}" — ${checked.wordCount} words`, checked.issues);
      step = "review";
      review = await reviewClaims(draft, research.dossier);
      note(`claim review after revision: ${review.flags.length} flag(s). ${review.summary}`, review.flags);
    }
    await checkpoint();

    // 5. Link check ---------------------------------------------------------
    step = "links";
    const checkedSources = await checkLinks(checked.sources);
    const broken = checkedSources.filter((s) => s.link_status === "broken");
    note(
      `link check: ${checkedSources.filter((s) => s.link_status === "ok").length} ok, ${checkedSources.filter((s) => s.link_status === "unverified").length} unverified, ${broken.length} broken`,
      checkedSources.map((s) => ({ url: s.url, status: s.link_status, detail: s.link_detail })),
    );
    // Broken links are removed from the published source list (and section references).
    const sources = checkedSources.filter((s) => s.link_status !== "broken");
    const kept = new Set(sources.map((s) => s.id));
    const content = {
      ...checked.content,
      sections: checked.content.sections.map((s) => ({ ...s, source_ids: s.source_ids.filter((sid) => kept.has(sid)) })),
    };
    const issues: ValidationIssue[] = [...checked.issues];
    for (const b of broken) issues.push({ level: "warning", code: "broken_link", message: `Removed unreachable source ${b.url} (${b.link_detail}).` });
    if (sources.length < 2) issues.push({ level: "error", code: "insufficient_working_sources", message: `Only ${sources.length} source link(s) are reachable.` });
    else if (sources.length < 3 && !issues.some((i) => i.code === "few_sources"))
      issues.push({ level: "warning", code: "few_sources", message: `Only ${sources.length} working source(s) remain after the link check.` });
    for (const s of content.sections)
      if (broken.length && s.source_ids.length === 0) issues.push({ level: "warning", code: "unsourced_section", message: `Section "${s.heading}" lost all its sources to broken links.` });
    const remaining = review.flags.filter((f) => SERIOUS_FLAGS.has(f.verdict));
    if (remaining.length) issues.push({ level: "warning", code: "unsupported_claims", message: `${remaining.length} claim(s) flagged as unsupported, contradicted, or missing uncertainty.` });

    // 6. Decide status and save --------------------------------------------
    step = "save";
    const errors = issues.filter((i) => i.level === "error");
    const status: GenerationStatus = errors.length
      ? "failed"
      : remaining.length || issues.some((i) => ["word_count", "unsourced_section", "few_sources"].includes(i.code))
        ? "needs_review"
        : "ready";
    note(`status: ${status}`);

    const validation: ValidationReport = {
      issues,
      claim_review: review,
      research_notes: research.disputedPoints,
      research_dossier: research.dossier,
      revisions,
      disclaimer: DISCLAIMER,
    };
    await updateDiscovery(id, {
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim(),
      category: plan.category,
      subcategory: chosen.subcategory,
      content_type: chosen.content_type,
      topic: chosen.topic,
      content,
      word_count: checked.wordCount,
      reading_time_minutes: readingTimeMinutes(checked.wordCount),
      sources,
      related_topics: draft.related_topics.map((t) => t.trim()).filter(Boolean).slice(0, 3),
      validation,
      generation_log: log,
      generation_status: status,
      error: errors.length ? errors.map((e) => e.message).join(" ") : null,
      published_at: status === "ready" ? new Date().toISOString() : null,
    });
    return { id, status, title: draft.title, ...(errors.length ? { error: errors.map((e) => e.message).join(" ") } : {}) };
  } catch (err) {
    const message = `[${step}] ${describeError(err)}`;
    note(`FAILED: ${message}`);
    console.error(`Discovery ${id} failed:`, err);
    await updateDiscovery(id, { generation_status: "failed", error: message, generation_log: log }).catch((e) =>
      console.error("Could not record failure:", e),
    );
    return { id, status: "failed", title: null, error: message };
  }
}
