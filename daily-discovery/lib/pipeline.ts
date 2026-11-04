import { describeError } from "./claude";
import { config, stages } from "./config";
import { BudgetExceeded, CostTracker, worstCaseUsd } from "./cost";
import { createDiscoveryRow, listHistory, listInterests, updateDiscovery } from "./db";
import { uncertaintyNotes } from "./evidence";
import { DEFAULT_INTERESTS, planCategory } from "./interests";
import { researchTopic } from "./research";
import type { ResearchQuery } from "./retrieval";
import { readingTimeMinutes } from "./text";
import { generateCandidates, type Candidate } from "./topics";
import type { EvidenceLedger, GenerationStatus, LogEntry, Source, ValidationIssue, ValidationReport, VerificationRound } from "./types";
import { validateDraft } from "./validate";
import { revisionProblems, sectionSources, verifyArticle, verifyWorstCase } from "./verify";
import { writeArticle, type DraftArticle } from "./writer";

const DISCLAIMER =
  "Every factual statement was checked by a separate model against verbatim source quotations that were mechanically confirmed to exist in the retrieved sources. This is automated verification, not human fact-checking; an editor approves each article before publication.";

const PRICING_NOTE =
  "Costs are computed from token usage reported by the API, priced with the table in lib/config.ts (Anthropic documentation as of 2026-10-06). Check against Console billing.";

export interface GenerationResult {
  id: string;
  status: GenerationStatus;
  title: string | null;
  costUsd: number;
  error?: string;
}

/** Money to hold back during research so a sourced topic can always be written AND verified. */
function writingReserve(): number {
  return worstCaseUsd(stages.write.model, 30000, stages.write.maxTokens) + worstCaseUsd(stages.verify.model, 45000, stages.verify.maxTokens);
}

export async function generateDiscovery(onLog?: (e: LogEntry) => void, options: { topicOverride?: ResearchQuery & { contentType?: "story" | "explanation" } } = {}): Promise<GenerationResult> {
  const id = await createDiscoveryRow();
  const tracker = new CostTracker(config.budget.maxUsd, config.budget.targetUsd);
  const log: LogEntry[] = [];
  let step = "setup";
  let ledger: EvidenceLedger | null = null;
  const note = (message: string, data?: unknown) => {
    const entry: LogEntry = { at: new Date().toISOString(), step, message, ...(data === undefined ? {} : { data }) };
    log.push(entry);
    onLog?.(entry);
  };
  const checkpoint = () => updateDiscovery(id, { generation_log: log, usage: tracker.report(PRICING_NOTE) }).catch(() => {});

  try {
    note(`budget: $${config.budget.maxUsd.toFixed(2)} max, $${config.budget.targetUsd.toFixed(2)} target; models: write ${stages.write.model}, verify ${stages.verify.model}, extract ${stages.extract.model}`);

    // 1. Topic ---------------------------------------------------------------
    step = "plan";
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
      step = "topics";
      const candidates = await generateCandidates(plan, history, history, tracker);
      shortlist = candidates.filter((c) => c.similarity < config.duplicateThreshold);
      note(`${candidates.length} candidates, ${shortlist.length} not duplicates`, candidates.map((c) => ({ topic: c.topic, score: Number(c.score.toFixed(1)) })));
      if (shortlist.length === 0) throw new Error("Every candidate topic duplicated an earlier discovery.");
    }
    await checkpoint();

    // 2. Research & evidence ---------------------------------------------------
    let chosen: Candidate | null = null;
    for (const candidate of shortlist.slice(0, config.maxTopicAttempts)) {
      step = "research";
      note(`researching: ${candidate.topic}`);
      await updateDiscovery(id, { topic: candidate.topic, category: plan.category, subcategory: candidate.subcategory, content_type: candidate.content_type });
      const query: ResearchQuery = { topic: candidate.topic, angle: candidate.angle, searchTerms: candidate.search_terms?.length ? candidate.search_terms : [candidate.topic] };
      const research = await researchTopic(query, tracker, writingReserve());
      for (const line of research.log) note(line.message, line.data);
      if (!research.ledger) continue;
      ledger = research.ledger;
      await updateDiscovery(id, { evidence: ledger, generation_log: log, usage: tracker.report(PRICING_NOTE) });
      if (ledger.sufficient) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen || !ledger?.sufficient) throw new Error(`No topic had enough verifiable evidence after ${config.maxTopicAttempts} attempt(s). See the log.`);

    // 3. Write → verify → (revise → re-verify) ---------------------------------
    const pastTitles = history.map((h) => h.title).filter((t): t is string => !!t);
    step = "write";
    let draft: DraftArticle = await writeArticle({ topic: chosen.topic, angle: chosen.angle, contentType: chosen.content_type, ledger, tracker, reserveUsd: verifyWorstCase(ledger) });
    let structure = validateDraft(draft, pastTitles, config.duplicateThreshold);
    note(`draft: "${draft.title}" — ${structure.wordCount} words`, structure.issues);

    step = "verify";
    const rounds: VerificationRound[] = [await verifyArticle({ article: draft, ledger, round: 1, tracker })];
    note(`verification: ${rounds[0].passed ? "passed" : "failed"} — ${rounds[0].assertions.length} assertions; ${rounds[0].summary}`, rounds[0].assertions.filter((a) => a.verdict !== "supported"));
    await checkpoint();

    let revisions = 0;
    const needsRevision = () =>
      !rounds[rounds.length - 1].passed || structure.issues.some((i) => (i.level === "error" && i.code !== "duplicate_topic") || i.code === "word_count");
    while (needsRevision() && revisions < config.maxRevisions) {
      step = "revise";
      const problems = [...revisionProblems(rounds[rounds.length - 1]), ...structure.issues.filter((i) => i.level === "error" || i.code === "word_count").map((i) => i.message)];
      try {
        const revised = await writeArticle({ topic: chosen.topic, angle: chosen.angle, contentType: chosen.content_type, ledger, tracker, reserveUsd: verifyWorstCase(ledger), revision: { previous: draft, problems } });
        revisions++;
        draft = revised;
        structure = validateDraft(draft, pastTitles, config.duplicateThreshold);
        note(`revision ${revisions}: "${draft.title}" — ${structure.wordCount} words`, structure.issues);
        step = "reverify";
        // Full re-verification: catches anything the revision introduced, not just the fixes.
        rounds.push(await verifyArticle({ article: draft, ledger, round: rounds.length + 1, tracker }));
        const r = rounds[rounds.length - 1];
        note(`re-verification: ${r.passed ? "passed" : "failed"} — ${r.assertions.length} assertions; ${r.summary}`, r.assertions.filter((a) => a.verdict !== "supported"));
      } catch (e) {
        if (!(e instanceof BudgetExceeded)) throw e;
        note(`revision not attempted: ${e.message}`);
        break;
      }
    }

    // 4. Decide status and save (never auto-publish) -------------------------
    step = "save";
    const finalRound = rounds[rounds.length - 1];
    const issues: ValidationIssue[] = [...structure.issues, ...finalRound.map_issues.map((m) => ({ level: "warning" as const, code: "claim_map", message: m }))];
    const failedAssertions = finalRound.assertions.filter((a) => a.verdict !== "supported");
    if (failedAssertions.length) issues.push({ level: "error", code: "factual_verification", message: `${failedAssertions.length} statement(s) not fully supported by the evidence.` });
    if (tracker.stoppedForBudget) issues.push({ level: "warning", code: "budget", message: tracker.stoppedForBudget });
    const structuralErrors = structure.issues.filter((i) => i.level === "error");
    const status: GenerationStatus = structuralErrors.some((i) => i.code === "duplicate_topic")
      ? "failed"
      : finalRound.passed && structuralErrors.length === 0
        ? "verified"
        : "needs_review";
    note(`status: ${status}; cost $${tracker.spent.toFixed(4)}`);

    const perSection = sectionSources(draft, finalRound, ledger);
    const content = { ...structure.content, sections: structure.content.sections.map((s, i) => ({ ...s, source_ids: perSection[i] ?? [] })) };
    const usedIds = new Set(perSection.flat());
    const sources: Source[] = ledger.sources.filter((s) => usedIds.has(s.id)).map((s) => ({ id: s.id, title: s.title, url: s.url, link_status: "ok", link_detail: `retrieved ${s.retrieved_at?.slice(0, 10) ?? ""}` }));

    const validation: ValidationReport = {
      issues,
      research_notes: uncertaintyNotes(ledger),
      verification: rounds,
      claim_map: draft.claim_map,
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
      word_count: structure.wordCount,
      reading_time_minutes: readingTimeMinutes(structure.wordCount),
      sources,
      related_topics: draft.related_topics.map((t) => t.trim()).filter(Boolean).slice(0, 3),
      validation,
      evidence: ledger,
      usage: tracker.report(PRICING_NOTE),
      generation_log: log,
      generation_status: status,
      error: status === "failed" ? structuralErrors.map((e) => e.message).join(" ") : null,
      published_at: null,
    });
    return { id, status, title: draft.title, costUsd: tracker.spent };
  } catch (err) {
    const message = `[${step}] ${describeError(err)}`;
    note(`FAILED: ${message}`);
    console.error(`Discovery ${id} failed:`, err);
    await updateDiscovery(id, { generation_status: "failed", error: message, generation_log: log, usage: tracker.report(PRICING_NOTE), ...(ledger ? { evidence: ledger } : {}) }).catch((e) =>
      console.error("Could not record failure:", e),
    );
    return { id, status: "failed", title: null, costUsd: tracker.spent, error: message };
  }
}
