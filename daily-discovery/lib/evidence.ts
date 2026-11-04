// Evidence ledger: a cheap model proposes claims with verbatim supporting quotes and rates
// each source; code then verifies every quote against the stored source text and decides,
// claim by claim, whether the evidence is strong enough for the writer to use.

import { z } from "zod";
import { structured } from "./claude";
import { config, stages } from "./config";
import type { CostTracker } from "./cost";
import { findQuote } from "./quotes";
import type { Authority, Claim, Conflict, EvidenceLedger, Passage, SourceRecord } from "./types";

const AUTHORITY = ["primary", "scholarly", "institutional", "reference", "journalism", "popular", "unreliable"] as const;

const ExtractionSchema = z.object({
  sources: z.array(
    z.object({
      source_id: z.string(),
      authority: z.enum(AUTHORITY).describe(
        "primary = original documents/data or first-hand records; scholarly = peer-reviewed or academic publisher; institutional = museum, university, government or scientific body; reference = edited encyclopedia; journalism = established news/magazine publisher; popular = blogs, general-interest sites without editorial standards; unreliable = content farms, AI-written, anonymous or self-promotional",
      ),
      relevance: z.enum(["high", "medium", "low"]),
      note: z.string().describe("One short sentence on why this rating"),
    }),
  ),
  claims: z.array(
    z.object({
      id: z.string().describe("C1, C2, ..."),
      statement: z.string().describe("One self-contained factual claim in plain words"),
      stakes: z.enum(["routine", "precise_or_contested"]).describe(
        "precise_or_contested = exact figures, dates, quotations, superlatives ('first', 'largest'), causal or interpretive claims, or anything sources disagree on; routine = uncontroversial descriptive facts",
      ),
      status: z.enum(["supported", "disputed", "uncertain"]),
      note: z.string().describe("For disputed/uncertain claims: who disagrees or what is unknown. Otherwise empty."),
      evidence: z.array(
        z.object({
          passage_id: z.string(),
          quote: z.string().describe("Copied character-for-character from that passage: one or two whole sentences, at least 8 words. Use ... only to elide words inside a sentence."),
        }),
      ),
    }),
  ),
  conflicts: z.array(
    z.object({
      summary: z.string().describe("What the sources disagree about, and how"),
      claim_ids: z.array(z.string()),
      source_ids: z.array(z.string()),
    }),
  ),
});

const SYSTEM = `You are the evidence desk for Daily Discovery, an editorial publication. A writer will be allowed to use ONLY the claims you list, so list every substantive fact in the passages that is relevant to the topic: events, people, dates, quantities, mechanisms, causes, consequences, and interpretations.

Rules:
- Each claim needs evidence: the passage ID and an exact quote from that passage that states the claim. Quotes are checked mechanically; a quote that is not character-for-character in the passage discards the claim.
- Do not add facts from your own knowledge. If a passage only implies something, do not state it as fact.
- If a claim is stated in several passages, give evidence from each independent source.
- When sources disagree, list each position as its own claim (status "disputed") and describe the disagreement under conflicts.
- Mark claims "uncertain" where a source itself hedges (e.g. "probably", "estimates range").
- Rate every source's authority and relevance from what the passages and title show, not from its web address alone.
Aim for 15-30 claims.`;

export async function extractEvidence(opts: {
  topic: string;
  angle: string;
  sources: SourceRecord[];
  passages: Passage[];
  tracker: CostTracker;
  reserveUsd: number;
}): Promise<z.infer<typeof ExtractionSchema>> {
  const bySource = new Map<string, Passage[]>();
  for (const p of opts.passages) bySource.set(p.source_id, [...(bySource.get(p.source_id) ?? []), p]);
  const blocks = [...bySource.entries()].map(([sid, ps]) => {
    const s = opts.sources.find((x) => x.id === sid)!;
    return `<source id="${sid}" title="${s.title.replace(/"/g, "'")}" url="${s.url}" origin="${s.origin}"${s.detail ? ` note="${s.detail}"` : ""}>\n${ps
      .map((p) => `<passage id="${p.id}">\n${p.text}\n</passage>`)
      .join("\n")}\n</source>`;
  });
  return structured({
    stage: "extract",
    settings: stages.extract,
    schema: ExtractionSchema,
    system: SYSTEM,
    prompt: `Topic: ${opts.topic}\nAngle: ${opts.angle}\n\n${blocks.join("\n\n")}`,
    tracker: opts.tracker,
    reserveUsd: opts.reserveUsd,
  });
}

const STRONG = new Set<Authority>(["primary", "scholarly", "institutional"]);
const ACCEPTABLE = new Set<Authority>([...STRONG, "reference", "journalism"]);

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * Credibility depends on who says it and what is being claimed:
 * - routine claims need one acceptable source (or two independent popular ones);
 * - precise or contested claims need a primary/scholarly/institutional source, or two
 *   acceptable sources on different sites.
 * Unreliable or low-relevance sources never count.
 */
export function assessClaim(claim: Claim, sources: Map<string, SourceRecord>): { usable: boolean; reason?: string } {
  const verified = claim.evidence.filter((e) => e.verified);
  if (verified.length === 0) return { usable: false, reason: "no supporting quote was found in the stored source text" };
  const counted = verified
    .map((e) => sources.get(e.source_id))
    .filter((s): s is SourceRecord => !!s && s.authority !== "unreliable" && s.relevance !== "low");
  if (counted.length === 0) return { usable: false, reason: "only unreliable or low-relevance sources support it" };
  const strong = counted.filter((s) => STRONG.has(s.authority!));
  const acceptable = counted.filter((s) => ACCEPTABLE.has(s.authority!));
  const sites = (xs: SourceRecord[]) => new Set(xs.map((s) => host(s.url))).size;
  if (claim.stakes === "precise_or_contested") {
    if (strong.length || sites(acceptable) >= 2) return { usable: true };
    return { usable: false, reason: "precise or contested claim needs a primary, scholarly or institutional source, or two independent sources" };
  }
  if (acceptable.length || sites(counted) >= 2) return { usable: true };
  return { usable: false, reason: "supported only by a single popular source" };
}

export function buildLedger(
  sources: SourceRecord[],
  passages: Passage[],
  extraction: z.infer<typeof ExtractionSchema>,
): EvidenceLedger {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  for (const r of extraction.sources) {
    const s = sourceById.get(r.source_id);
    if (s) Object.assign(s, { authority: r.authority, relevance: r.relevance, credibility_note: r.note });
  }
  const passageById = new Map(passages.map((p) => [p.id, p]));

  const claims: Claim[] = extraction.claims.map((c, i) => {
    const evidence = c.evidence.map((e) => {
      const p = passageById.get(e.passage_id);
      const s = p ? sourceById.get(p.source_id) : undefined;
      const match = s?.text ? findQuote(s.text, e.quote, config.evidence.minQuoteChars) : null;
      return { passage_id: e.passage_id, source_id: p?.source_id ?? "?", quote: e.quote, verified: !!match, ...(match ? { location: match } : {}) };
    });
    const claim: Claim = {
      id: c.id || `C${i + 1}`,
      statement: c.statement,
      stakes: c.stakes,
      status: c.status,
      ...(c.note ? { note: c.note } : {}),
      evidence,
      usable: false,
    };
    const a = assessClaim(claim, sourceById);
    claim.usable = a.usable;
    if (a.reason) claim.exclusion_reason = a.reason;
    return claim;
  });

  const conflicts: Conflict[] = extraction.conflicts.map((c) => ({ summary: c.summary, claim_ids: c.claim_ids, source_ids: c.source_ids }));
  const { sufficient, reason } = sufficiency(claims, sourceById);
  return { sources, passages, claims, conflicts, sufficient, sufficiency_reason: reason };
}

export function sufficiency(claims: Claim[], sources: Map<string, SourceRecord>): { sufficient: boolean; reason: string } {
  const usable = claims.filter((c) => c.usable);
  const backing = new Set(usable.flatMap((c) => c.evidence.filter((e) => e.verified).map((e) => e.source_id)));
  const backingSources = [...backing].map((id) => sources.get(id)).filter((s): s is SourceRecord => !!s);
  const sites = new Set(backingSources.map((s) => host(s.url))).size;
  const independent = backingSources.filter((s) => s.origin !== "wikipedia").length;
  const { minUsableClaims, minSources, minDomains } = config.evidence;
  const facts = `${usable.length}/${claims.length} claims usable, from ${backing.size} sources on ${sites} sites (${independent} non-encyclopedia)`;
  if (usable.length < minUsableClaims) return { sufficient: false, reason: `too few usable claims: ${facts}` };
  if (backing.size < minSources || sites < minDomains) return { sufficient: false, reason: `too few independent sources: ${facts}` };
  if (independent < 1) return { sufficient: false, reason: `relies only on an encyclopedia: ${facts}` };
  return { sufficient: true, reason: facts };
}

/** Points readers should know are disputed or uncertain. */
export function uncertaintyNotes(ledger: EvidenceLedger): string[] {
  const notes = ledger.conflicts.map((c) => c.summary);
  for (const c of ledger.claims)
    if (c.usable && c.status !== "supported" && c.note && !notes.some((n) => n.includes(c.note!))) notes.push(c.note);
  return notes.slice(0, 6);
}
