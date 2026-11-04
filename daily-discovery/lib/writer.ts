import { z } from "zod";
import { structured, type ModelSettings } from "./claude";
import { stages } from "./config";
import type { CostTracker } from "./cost";
import { WORD_TARGET } from "./text";
import type { ContentType, EvidenceLedger } from "./types";

const ArticleSchema = z.object({
  title: z.string().describe("Compelling, accurate headline. No clickbait, no colon-subtitle."),
  subtitle: z.string().describe("One sentence explaining the subject."),
  introduction: z.array(z.string()).describe("Opening paragraph(s)"),
  sections: z
    .array(z.object({ heading: z.string(), paragraphs: z.array(z.string()) }))
    .describe("The body, in as many headed sections as the piece needs"),
  related_topics: z.array(z.string()).describe("Exactly three specific subjects for future exploration"),
  claim_map: z
    .array(
      z.object({
        location: z.string().describe('Paragraph: "intro-1", "intro-2", "s1-1" (section 1, paragraph 1), "s2-3", ...'),
        anchor: z.string().describe("The first 6-10 words of the sentence, copied exactly"),
        claim_ids: z.array(z.string()),
      }),
    )
    .describe("Internal only, never shown to readers: one entry per sentence that states a fact, listing the claims it rests on"),
});

export type DraftArticle = z.infer<typeof ArticleSchema>;

const SYSTEM = `You write for Daily Discovery, a publication that helps curious adults learn one genuinely interesting thing a day. Aim for the register of a fine long-form magazine piece, compressed: intelligent but accessible, clear and conversational, engaging without sensationalism, substantive without being academic.

Shape the piece around the material, not a template. Open where the story or the idea is most alive. Use section headings where they help a reader find their way; let some sections run long and others short. For stories, give narrative, context and why it mattered. For explanations, give mechanisms and causes, so the reader could explain the how and why to a friend.

Avoid: generic AI openings ("Imagine...", "Have you ever wondered...", "In the annals of history..."), more than one rhetorical question, clickbait or manufactured drama, superlatives the evidence doesn't support, closing morals or summaries ("In conclusion...", "It reminds us that..."), and lists of facts in place of an argument.

Evidence rules — these are checked, sentence by sentence, after you write:
- Every factual statement must rest on the numbered claims provided. You may combine, order and paraphrase claims, and draw connections between them, but do not add names, dates, numbers, places, causes, firsts, or characterisations that the claims don't contain. That includes background facts you are confident about.
- Sentences that frame, transition or pose the question without asserting facts need no claim.
- Present disputed and uncertain claims as such ("historians disagree", "estimates range from").
- Quote directly only from the supplied quotations, word for word, and name who said or wrote it only if a claim says so.
- In claim_map, list every sentence that states a fact with the claim IDs it rests on. Readers never see this map; it is used to check your work.`;

export function ledgerForWriter(ledger: EvidenceLedger): string {
  const sources = new Map(ledger.sources.map((s) => [s.id, s]));
  const usable = ledger.claims.filter((c) => c.usable);
  const lines = usable.map((c) => {
    const quotes = c.evidence
      .filter((e) => e.verified)
      .map((e) => `    "${e.quote}" — ${e.source_id} (${sources.get(e.source_id)?.authority ?? "unrated"})`)
      .join("\n");
    const flag = c.status === "supported" ? "" : ` [${c.status.toUpperCase()}${c.note ? `: ${c.note}` : ""}]`;
    return `${c.id}. ${c.statement}${flag}\n${quotes}`;
  });
  const conflicts = ledger.conflicts.map((c) => `- ${c.summary} (claims ${c.claim_ids.join(", ")})`).join("\n");
  const sourceList = [...new Set(usable.flatMap((c) => c.evidence.filter((e) => e.verified).map((e) => e.source_id)))]
    .map((id) => sources.get(id)!)
    .map((s) => `${s.id}: ${s.title} (${s.authority ?? "unrated"})`)
    .join("\n");
  return `<claims>\n${lines.join("\n\n")}\n</claims>\n\n<conflicts>\n${conflicts || "None recorded."}\n</conflicts>\n\n<sources>\n${sourceList}\n</sources>`;
}

export interface RevisionRequest {
  previous: DraftArticle;
  problems: string[];
}

export async function writeArticle(input: {
  topic: string;
  angle: string;
  contentType: ContentType;
  ledger: EvidenceLedger;
  tracker: CostTracker;
  reserveUsd: number;
  revision?: RevisionRequest;
  /** Override the configured writer model (used by the model comparison script). */
  settings?: ModelSettings;
}): Promise<DraftArticle> {
  let prompt = `Write today's discovery.

Topic: ${input.topic}
Content type: ${input.contentType.toUpperCase()}
What the reader should understand by the end: ${input.angle}
Length: ${WORD_TARGET.min}-${WORD_TARGET.max} words of body text; about 750 is ideal.

${ledgerForWriter(input.ledger)}`;

  if (input.revision) {
    prompt += `

REVISION. A fact-checker found these problems in your previous draft:
${input.revision.problems.map((p) => `- ${p}`).join("\n")}

Rewrite the article so every problem is fixed: cut or correct unsupported statements, restore hedging, and keep everything that was good. Return the complete article and a complete claim_map.

<previous_draft>
${JSON.stringify({ ...input.revision.previous, claim_map: undefined })}
</previous_draft>`;
  }

  return structured({
    stage: input.revision ? "revise" : "write",
    settings: input.settings ?? stages.write,
    schema: ArticleSchema,
    system: SYSTEM,
    prompt,
    tracker: input.tracker,
    reserveUsd: input.reserveUsd,
  });
}
