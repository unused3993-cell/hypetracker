import { z } from "zod";
import { structured } from "./claude";
import { WORD_TARGET } from "./text";
import type { ClaimFlag, ContentType, Source } from "./types";

const ArticleSchema = z.object({
  title: z.string().describe("Compelling, accurate headline. No clickbait, no colon-subtitle."),
  subtitle: z.string().describe("One sentence explaining the subject."),
  introduction: z.array(z.string()).describe("1-2 opening paragraphs that establish the subject"),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        paragraphs: z.array(z.string()),
        source_ids: z.array(z.string()).describe("IDs (e.g. S3) of the research sources this section's claims rest on"),
      }),
    )
    .describe("3-5 sections with subheadings"),
  related_topics: z.array(z.string()).describe("Exactly three specific subjects for future exploration"),
});

export type DraftArticle = z.infer<typeof ArticleSchema>;

const SYSTEM = `You are a senior writer for Daily Discovery, an editorial app that helps curious adults learn one genuinely interesting thing a day. Think of the register of a good long-form magazine science or history piece, compressed.

Voice: intelligent but accessible; clear and conversational; engaging without sensationalism; rigorous; substantive without being academic.

Never:
- open with a generic AI introduction ("Imagine...", "Have you ever wondered...", "In the annals of history...", "X is a fascinating topic")
- stack rhetorical questions (at most one in the whole piece)
- use clickbait, artificial drama, or superlatives the evidence doesn't support
- end with a repetitive summary or moral ("In conclusion...", "It reminds us that...")
- pad with a superficial list of facts
- speculate beyond the research

For STORIES prioritize narrative, context, and why it mattered. For EXPLANATIONS prioritize mechanisms and causal relationships — the reader should be able to explain the "how/why" to a friend afterwards.

Accuracy rules (non-negotiable):
- Use ONLY facts contained in the research notes. If a detail is not in the notes, leave it out.
- Do not invent quotations. Quote only words that appear as quotations in the notes.
- Where the notes mark something as disputed or uncertain, say so plainly in the text (e.g. "historians disagree", "estimates range from...").
- Do not repeat anything listed under "Myths to avoid" as fact.
- Every section must list the source IDs its claims rest on, and only IDs from the provided source list.`;

export async function writeArticle(input: {
  topic: string;
  angle: string;
  contentType: ContentType;
  dossier: string;
  sources: Source[];
  revision?: { previous: DraftArticle; wordCount: number; flags: ClaimFlag[]; otherIssues: string[] };
}): Promise<DraftArticle> {
  const sourceList = input.sources.map((s) => `${s.id}: ${s.title} — ${s.url}`).join("\n");
  let prompt = `Write today's discovery.

Topic: ${input.topic}
Content type: ${input.contentType.toUpperCase()}
Angle (what the reader should understand by the end): ${input.angle}

Length: ${WORD_TARGET.min}-${WORD_TARGET.max} words of body text (introduction + section paragraphs, headings excluded). Aim for about 750.

<research_notes>
${input.dossier}
</research_notes>

<sources>
${sourceList}
</sources>`;

  if (input.revision) {
    const { previous, wordCount, flags, otherIssues } = input.revision;
    const problems = [
      ...flags.map((f) => `- [${f.verdict}] "${f.claim}" — ${f.note}`),
      ...otherIssues.map((i) => `- ${i}`),
    ];
    prompt += `

This is a REVISION. The previous draft (${wordCount} body words) had these problems:
${problems.join("\n")}

Fix every problem: remove or correct unsupported claims, add hedging where uncertainty was not acknowledged, and adjust length if needed. Keep what was good.

<previous_draft>
${JSON.stringify(previous, null, 2)}
</previous_draft>`;
  }

  return structured({ step: input.revision ? "revision" : "writing", schema: ArticleSchema, system: SYSTEM, prompt, effort: "high" });
}

// ---------------------------------------------------------------------------
// Claim review: a second, independent pass comparing the draft to the research notes.
// This catches some unsupported claims; it is not a fact-check.
// ---------------------------------------------------------------------------

const ReviewSchema = z.object({
  flags: z.array(
    z.object({
      claim: z.string().describe("The exact sentence or phrase from the article"),
      verdict: z.enum(["unsupported", "partially_supported", "contradicted", "uncertainty_not_acknowledged"]),
      note: z.string().describe("What the research notes actually say, or what is missing"),
    }),
  ),
  summary: z.string().describe("One or two sentences on overall fidelity to the research"),
});

export async function reviewClaims(article: DraftArticle, dossier: string): Promise<z.infer<typeof ReviewSchema>> {
  return structured({
    step: "claim review",
    schema: ReviewSchema,
    effort: "medium",
    system: `You are a meticulous research editor. Compare an article against the research notes it was supposed to be based on.
Check every specific factual claim: names, dates, numbers, places, quotations, causal claims, and superlatives ("first", "largest", "only").
Flag a claim if the notes do not support it, only partly support it, contradict it, or mark it as disputed while the article states it as settled.
Do not flag style, framing, or general background knowledge that is uncontroversial and not specific (e.g. "Japan is an island nation").
Return an empty flags list if everything specific is supported.`,
    prompt: `<research_notes>
${dossier}
</research_notes>

<article>
${JSON.stringify(article, null, 2)}
</article>`,
  });
}
