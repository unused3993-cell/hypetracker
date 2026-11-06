import { z } from "zod";
import { structured, type ModelSettings } from "./claude";
import { stages } from "./config";
import type { CostTracker } from "./cost";
import type { ContentType, ResearchPack } from "./types";

export const WORD_RANGE = { min: 1100, max: 1600 } as const;

const ArticleSchema = z.object({
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

export type DraftArticle = z.infer<typeof ArticleSchema>;

const SYSTEM = `You are a staff writer at Daily Discovery. You write long-form narrative nonfiction in the tradition of the best literary magazine journalism: one continuous, coherent story told by a writer with a point of view, never a report assembled from facts.

Craft:
- Build a single narrative line. Find the human or dramatic thread in the material (a person, a decision, a moment, an object) and carry the reader through it from beginning to end. Each paragraph should follow from the one before. Weave context, background and explanation into the story at the moment the reader needs them; don't park them in separate blocks.
- Open on a precise, concrete scene or detail taken from the sources, not a thesis, a question or a sweeping generalisation. Earn the significance rather than announcing it.
- Write with authority, restraint and dry wit. Choose the exact noun and the active verb. Vary sentence length: let a long, layered sentence give way to a short one. Use irony sparingly, never at the expense of accuracy.
- Let people and their choices carry the piece, characterised through what they did, said and wrote as the sources record it.
- Explain mechanisms and causes clearly, inside the flow of the story.
- End on a resonant image, fact or turn that reframes what came before. Never end with a summary, a moral or a lesson.
- Write the full piece: the opening goes in "introduction", and the rest of the story (most of the words) goes in "sections". Most pieces need no subheadings. When the story moves to a new time or place, begin a new section with an empty heading: an unmarked break. Give a section a heading only for a genuinely distinct movement, and use no more than three.
- Avoid generic openings ("Imagine...", "In the annals of history..."), rhetorical questions, listicle rhythm, clichés ("little did they know", "the rest is history"), throat-clearing, hype, and adjectives doing the work of evidence.

Accuracy (a fact-checker reviews every sentence against the sources afterwards):
- Narrative must never become fiction. Every scene, detail, number, name, date, quotation, motive and feeling must come from the research material. Do not invent dialogue, thoughts, weather, sounds or atmosphere to make a scene vivid: if the sources don't describe it, don't describe it. Restraint is part of the style.
- Interpret and connect freely, but mark inference as inference ("it seems likely", "historians have read this as").
- Where sources disagree or are uncertain, make that tension part of the story instead of smoothing it over.
- Quote only words that appear in the material, and attribute them.
- Prefer scholarly, institutional and primary material over weaker pages; ignore anything that looks unreliable.`;

/** The research material as the writer and reviewer see it, grouped by source. */
export function researchForModel(pack: ResearchPack): string {
  const bySource = new Map<string, string[]>();
  for (const p of pack.passages) bySource.set(p.source_id, [...(bySource.get(p.source_id) ?? []), p.text]);
  return [...bySource.entries()]
    .map(([id, texts]) => {
      const s = pack.sources.find((x) => x.id === id)!;
      const kind = s.origin === "openalex" ? "scholarly abstract" : s.origin === "wikipedia" ? "encyclopedia" : "web page";
      return `<source id="${id}" title="${s.title.replace(/"/g, "'")}" url="${s.url}" kind="${kind}">\n${texts.join("\n\n[…]\n\n")}\n</source>`;
    })
    .join("\n\n");
}

export async function writeArticle(input: {
  topic: string;
  angle: string;
  contentType: ContentType;
  pack: ResearchPack;
  tracker: CostTracker;
  reserveUsd: number;
  /** Override the configured writer model (e.g. to compare Opus and Sonnet). */
  settings?: ModelSettings;
  /** Set when a previous attempt came back incomplete. */
  retryNote?: string;
}): Promise<DraftArticle> {
  const prompt = `Write today's discovery.

Topic: ${input.topic}
Content type: ${input.contentType.toUpperCase()}
What the reader should understand by the end: ${input.angle}
Length: roughly ${WORD_RANGE.min}-${WORD_RANGE.max} words of body text where the material warrants it; substance matters more than length.

<research>
${researchForModel(input.pack)}
</research>${input.retryNote ? `\n\nIMPORTANT: ${input.retryNote}` : ""}`;

  return structured({
    stage: "write",
    settings: input.settings ?? stages.write,
    schema: ArticleSchema,
    system: SYSTEM,
    prompt,
    tracker: input.tracker,
    reserveUsd: input.reserveUsd,
  });
}
