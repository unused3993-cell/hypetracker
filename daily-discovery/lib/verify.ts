// Independent factual verification: a different model reads the finished article and the
// evidence (claims WITH their verified quotes), lists every material factual assertion
// itself — not trusting the writer's claim map — and judges whether the quoted evidence
// actually supports each one. Code then cross-checks the IDs it cites.

import { z } from "zod";
import { structured } from "./claude";
import { stages } from "./config";
import { worstCaseUsd, type CostTracker } from "./cost";
import { normalize } from "./quotes";
import type { AssertionCheck, ClaimMapEntry, EvidenceLedger, VerificationRound } from "./types";
import type { DraftArticle } from "./writer";

const VERDICTS = ["supported", "partially_supported", "unsupported", "contradicted", "misleading_context", "overstated", "uncertainty_not_acknowledged"] as const;

const VerifySchema = z.object({
  assertions: z.array(
    z.object({
      location: z.string().describe('Paragraph label, e.g. "intro-1" or "s2-3"'),
      assertion: z.string().describe("The factual assertion, quoted or closely paraphrased from the article"),
      claim_ids: z.array(z.string()).describe("Evidence claims that bear on it (empty if none)"),
      verdict: z.enum(VERDICTS),
      note: z.string().describe("For anything but 'supported': what the evidence actually says, or what is missing"),
    }),
  ),
  summary: z.string(),
});

const SYSTEM = `You are the fact-checker for an editorial publication. You receive an article and the only evidence the writer was allowed to use: numbered claims, each with exact quotations from its sources and each source's authority.

Identify every material factual assertion in the article yourself: names, dates, numbers, places, events, attributions, causes and effects, characterisations ("the first", "the largest", "widely accepted"), and background statements, including things you believe are common knowledge. Sentences that only frame or transition need no check.

For each assertion, judge it against the QUOTATIONS, not just the claim summaries:
- supported: the quotations establish it as stated.
- partially_supported: part of it is supported, part is not.
- unsupported: no quotation supports it (even if you believe it is true).
- contradicted: a quotation says otherwise.
- misleading_context: individually supported facts are combined or framed to imply something the evidence doesn't.
- overstated: the evidence supports a weaker or more hedged version.
- uncertainty_not_acknowledged: the evidence marks it disputed or uncertain but the article states it as settled.

The writer's claim map is included as a hint and may be wrong. Be strict: a publication's credibility depends on it.`;

export function paragraphsByLocation(a: DraftArticle): Map<string, string> {
  const m = new Map<string, string>();
  a.introduction.forEach((p, i) => m.set(`intro-${i + 1}`, p));
  a.sections.forEach((s, i) => s.paragraphs.forEach((p, j) => m.set(`s${i + 1}-${j + 1}`, p)));
  return m;
}

function evidenceForVerifier(ledger: EvidenceLedger): string {
  const sources = new Map(ledger.sources.map((s) => [s.id, s]));
  return ledger.claims
    .filter((c) => c.usable)
    .map((c) => {
      const quotes = c.evidence
        .filter((e) => e.verified)
        .map((e) => `    ${e.source_id} (${sources.get(e.source_id)?.authority ?? "unrated"}): "${e.quote}"`)
        .join("\n");
      return `${c.id} [${c.status}${c.note ? `: ${c.note}` : ""}] ${c.statement}\n${quotes}`;
    })
    .join("\n");
}

function articleForVerifier(a: DraftArticle): string {
  const out = [`TITLE: ${a.title}`, `SUBTITLE: ${a.subtitle}`];
  for (const [loc, p] of paragraphsByLocation(a)) out.push(`[${loc}] ${p}`);
  return out.join("\n\n");
}

/** Worst-case cost of one verification, for reserving budget before writing. */
export function verifyWorstCase(ledger: EvidenceLedger, articleChars = 9000): number {
  const chars = SYSTEM.length + evidenceForVerifier(ledger).length + articleChars + 4000;
  return worstCaseUsd(stages.verify.model, chars, stages.verify.maxTokens);
}

/** Mechanical checks on the writer's claim map. */
export function checkClaimMap(a: DraftArticle, ledger: EvidenceLedger): string[] {
  const issues: string[] = [];
  const claims = new Map(ledger.claims.map((c) => [c.id, c]));
  const paras = paragraphsByLocation(a);
  for (const e of a.claim_map) {
    for (const id of e.claim_ids) {
      const c = claims.get(id);
      if (!c) issues.push(`${e.location}: cites claim ${id}, which does not exist`);
      else if (!c.usable) issues.push(`${e.location}: cites claim ${id}, which was excluded (${c.exclusion_reason})`);
    }
    const p = paras.get(e.location);
    if (!p) issues.push(`claim map refers to ${e.location}, which is not a paragraph`);
    else if (e.anchor && !normalize(p).includes(normalize(e.anchor).replace(/[.,;:]+$/, ""))) issues.push(`${e.location}: anchor "${e.anchor}" not found in the paragraph`);
  }
  return issues;
}

export async function verifyArticle(opts: {
  article: DraftArticle;
  ledger: EvidenceLedger;
  round: number;
  tracker: CostTracker;
}): Promise<VerificationRound> {
  const map = opts.article.claim_map.map((e) => `${e.location} "${e.anchor}" → ${e.claim_ids.join(", ") || "(none)"}`).join("\n");
  const result = await structured({
    stage: opts.round === 1 ? "verify" : "reverify",
    settings: stages.verify,
    schema: VerifySchema,
    system: SYSTEM,
    prompt: `<evidence>\n${evidenceForVerifier(opts.ledger)}\n</evidence>\n\n<article>\n${articleForVerifier(opts.article)}\n</article>\n\n<writer_claim_map>\n${map}\n</writer_claim_map>`,
    tracker: opts.tracker,
  });

  // A "supported" verdict that leans on a claim the code excluded (or invented) doesn't count.
  const claims = new Map(opts.ledger.claims.map((c) => [c.id, c]));
  const assertions: AssertionCheck[] = result.assertions.map((a) => {
    const bad = a.claim_ids.filter((id) => !claims.get(id)?.usable);
    if (a.verdict === "supported" && (a.claim_ids.length === 0 || bad.length === a.claim_ids.length)) {
      return { ...a, verdict: "unsupported", note: `Marked supported, but cites no usable evidence claim${bad.length ? ` (${bad.join(", ")})` : ""}.` };
    }
    return a;
  });
  const mapIssues = checkClaimMap(opts.article, opts.ledger);
  const blocking = mapIssues.filter((i) => /does not exist|was excluded/.test(i));
  return {
    round: opts.round,
    assertions,
    summary: result.summary,
    passed: assertions.every((a) => a.verdict === "supported") && blocking.length === 0,
    map_issues: mapIssues,
  };
}

/** Problems to hand back to the writer. Partially supported counts as a problem. */
export function revisionProblems(round: VerificationRound): string[] {
  return [
    ...round.assertions.filter((a) => a.verdict !== "supported").map((a) => `[${a.location}] ${a.verdict.replace(/_/g, " ")}: "${a.assertion}" — ${a.note}`),
    ...round.map_issues.filter((i) => /does not exist|was excluded/.test(i)),
  ];
}

/** Section-level source IDs derived from supported assertions — for the reader view. */
export function sectionSources(a: DraftArticle, round: VerificationRound, ledger: EvidenceLedger): string[][] {
  const claims = new Map(ledger.claims.map((c) => [c.id, c]));
  return a.sections.map((_, i) => {
    const ids = new Set<string>();
    for (const as of round.assertions) {
      if (!as.location.startsWith(`s${i + 1}-`) || as.verdict !== "supported") continue;
      for (const cid of as.claim_ids) for (const e of claims.get(cid)?.evidence ?? []) if (e.verified) ids.add(e.source_id);
    }
    return [...ids].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)));
  });
}
