// Output schemas for every model stage that reads the shared context (style guide + research).
// They are sent as ONE combined format, identical on every call, because the output format is
// part of the prompt prefix: a different schema per stage would defeat prompt caching. Each
// stage fills only its own field and leaves the others null.

import { z } from "zod";

export const ArticleSchema = z.object({
  plan: z.string().describe("One sentence, written before the article: This is a [form] about [subject], driven by [spine], and it ends when [payoff]."),
  title: z.string().describe("Compelling, accurate headline. No clickbait, no colon-subtitle."),
  subtitle: z.string().describe("One sentence explaining the subject."),
  introduction: z.array(z.string()).describe("Only the opening: one to three paragraphs, beginning on a concrete scene or detail"),
  sections: z
    .array(
      z.object({
        heading: z.string().describe('Usually "" (an unmarked section break); a short heading only for a distinct movement'),
        paragraphs: z.array(z.string()),
        source_ids: z.array(z.string()).describe("IDs (S1, S2, ...) of the sources this section draws on"),
      }),
    )
    .describe("The body: the rest of the story, which is most of the article. At least one section; split only where the story moves to a new time or place"),
  related_topics: z.array(z.string()).describe("Exactly three specific subjects for future exploration"),
  uncertainties: z.array(z.string()).describe("Points the sources disagree on or leave open, one sentence each, for a reader's note. Empty if none."),
});

export const CritiqueSchema = z.object({
  spine: z.string().describe("The form and spine the piece should have, in the guide's one-sentence formula"),
  findings: z
    .array(z.object({ checklist_item: z.string(), quote: z.string().describe("Exact words from the draft"), fix: z.string() }))
    .describe("Every problem found, most important first"),
  revision_plan: z.string().describe("Instructions for the rewrite, in order"),
});

export const ReviewSchema = z.object({
  issues: z.array(
    z.object({
      type: z.enum(["factual_error", "unsupported", "misleading", "omission"]),
      severity: z.enum(["substantive", "minor"]).describe("substantive = would leave a reader believing something false or materially incomplete about something that matters"),
      location: z.string().describe('"title", "subtitle", "intro-1", "s2-3" (section 2, paragraph 3), ...'),
      excerpt: z.string().describe("The problem text, copied exactly from that paragraph (for omissions: the sentence after which the fix belongs)"),
      correction: z.string().describe("The fix in brief: replacement text for the excerpt (empty to delete)"),
      revised_paragraph: z.string().describe('The WHOLE paragraph at that location rewritten with the fix, reading naturally, in the article\'s voice; "" deletes the paragraph. For title/subtitle, the whole new title/subtitle.'),
      explanation: z.string().describe("What the sources say, briefly"),
      source_ids: z.array(z.string()),
    }),
  ),
  source_assessment: z.string().describe("One or two sentences on the quality of the sources and whether they suffice for this piece"),
  summary: z.string(),
});

export const StageOutput = z.object({
  article: ArticleSchema.nullable().describe("Filled by the writer and the rewriter; otherwise null"),
  critique: CritiqueSchema.nullable().describe("Filled by the editor; otherwise null"),
  review: ReviewSchema.nullable().describe("Filled by the fact-checker; otherwise null"),
});
export type StageField = keyof z.infer<typeof StageOutput>;
