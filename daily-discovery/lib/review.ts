// Editorial review: one call checks the article against the research material and proposes
// targeted corrections; code applies them. A substantive issue whose correction can't be
// applied stays unresolved, and the article can't be approved.

import { StageOutput } from "./schemas";
import { structured } from "./claude";
import { stages } from "./config";
import { worstCaseCachedUsd, worstCaseUsd, type CostTracker } from "./cost";
import type { EditorialReview, ResearchPack, ReviewIssue } from "./types";
import { sharedContext, type DraftArticle } from "./writer";



const SYSTEM = `You are the research editor of a general-interest educational magazine. Check a feature against the research material it was written from, the way a careful magazine fact-checker would.

Check the things that matter: facts, names, dates, numbers, scientific explanations, causal claims, and interpretations. Flag:
- factual_error: contradicts the sources.
- unsupported: a specific fact (date, figure, name, quotation, event) that the sources don't contain. This includes invented scene-setting in narrative passages: dialogue, thoughts, feelings, motives, weather, sounds or other atmospheric detail the sources don't record.
- misleading: true pieces framed so the reader takes away something the sources don't support, including overstated certainty about disputed points.
- omission: leaving out something the sources show is essential, such that the piece misleads.

Allow reasonable explanation, general context, and clearly framed inference; don't demand a quotation for every sentence, and don't flag style. For each issue, rewrite the whole paragraph so the fix reads as if the writer made it: no repeated phrases, no seams, same voice and rhythm, changing only what accuracy requires. Report at most one issue per paragraph; if a paragraph has several problems, fix them all in one revised_paragraph. Also flag attribution to websites ("Wikipedia says") as misleading and rewrite it per the style guide. If the article is sound, return no issues.`;

/** Worst case for the fact-check. `cached`: the shared context is already cached for this model. */
export function reviewWorstCase(pack: ResearchPack, articleChars = 12000, cached = true): number {
  const ctx = sharedContext(pack).length;
  const total = SYSTEM.length + ctx + articleChars + 6000;
  return cached ? worstCaseCachedUsd(stages.review.model, total, ctx, stages.review.maxTokens) : worstCaseUsd(stages.review.model, total, stages.review.maxTokens);
}

export function paragraphsByLocation(a: DraftArticle): Map<string, string> {
  const m = new Map<string, string>([
    ["title", a.title],
    ["subtitle", a.subtitle],
  ]);
  a.introduction.forEach((p, i) => m.set(`intro-${i + 1}`, p));
  a.sections.forEach((s, i) => s.paragraphs.forEach((p, j) => m.set(`s${i + 1}-${j + 1}`, p)));
  return m;
}

function articleForReview(a: DraftArticle): string {
  return [...paragraphsByLocation(a)].map(([loc, p]) => `[${loc}] ${p}`).join("\n\n");
}

/** Match the excerpt tolerantly: any whitespace run, and straight or curly quotes/apostrophes. */
function excerptPattern(excerpt: string): RegExp | null {
  const t = excerpt.trim();
  if (t.length < 3) return null;
  const esc = t
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+")
    .replace(/['‘’]/g, "['‘’]")
    .replace(/["“”]/g, '["“”]')
    .replace(/[-–—]/g, "[-–—]");
  return new RegExp(esc);
}

function setParagraph(a: DraftArticle, loc: string, text: string) {
  if (loc === "title") a.title = text;
  else if (loc === "subtitle") a.subtitle = text;
  else if (loc.startsWith("intro-")) a.introduction[Number(loc.slice(6)) - 1] = text;
  else {
    const m = loc.match(/^s(\d+)-(\d+)$/);
    if (m) a.sections[Number(m[1]) - 1].paragraphs[Number(m[2]) - 1] = text;
  }
}

/** Apply each correction where its excerpt is found; returns the corrected article and issues marked applied/unapplied. */
export function applyCorrections(article: DraftArticle, issues: ReviewIssue[]): { article: DraftArticle; issues: ReviewIssue[] } {
  const out: DraftArticle = structuredClone(article);
  const marked = issues.map((issue) => {
    const paras = paragraphsByLocation(out);
    const pattern = excerptPattern(issue.excerpt);
    // Prefer the stated location; fall back to wherever the excerpt actually occurs.
    const candidates = [issue.location, ...[...paras.keys()].filter((k) => k !== issue.location)];
    for (const loc of candidates) {
      const text = paras.get(loc);
      if (text === undefined || !pattern) continue;
      const m = text.match(pattern);
      if (!m) continue;
      if (issue.revised_paragraph !== undefined && (issue.revised_paragraph.trim() || loc.startsWith("intro-") || loc.startsWith("s"))) {
        setParagraph(out, loc, issue.revised_paragraph.trim());
        return { ...issue, location: loc, applied: true };
      }
      const replacement = issue.type === "omission" ? `${m[0]} ${issue.correction.trim()}` : issue.correction.trim();
      const updated = (text.slice(0, m.index) + replacement + text.slice(m.index! + m[0].length)).replace(/\s{2,}/g, " ").trim();
      setParagraph(out, loc, updated);
      return { ...issue, location: loc, applied: true };
    }
    return { ...issue, applied: false };
  });
  // Drop paragraphs that a deletion emptied.
  out.introduction = out.introduction.filter((p) => p.trim());
  out.sections = out.sections.map((s) => ({ ...s, paragraphs: s.paragraphs.filter((p) => p.trim()) })).filter((s) => s.paragraphs.length);
  return { article: out, issues: marked };
}

export async function reviewArticle(opts: {
  article: DraftArticle;
  pack: ResearchPack;
  tracker: CostTracker;
}): Promise<{ article: DraftArticle; review: EditorialReview }> {
  const result = await structured({
    stage: "review",
    settings: stages.review,
    schema: StageOutput,
    field: "review",
    system: SYSTEM,
    context: sharedContext(opts.pack),
    prompt: `<article>\n${articleForReview(opts.article)}\n</article>`,
    tracker: opts.tracker,
  });
  const { article, issues } = applyCorrections(opts.article, result.issues);
  const unresolved = issues.filter((i) => i.severity === "substantive" && !i.applied);
  return {
    article,
    review: { issues, source_assessment: result.source_assessment, summary: result.summary, passed: unresolved.length === 0 },
  };
}
