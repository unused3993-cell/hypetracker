import { z } from "zod";
import { structured, type ModelSettings } from "./claude";
import { stages } from "./config";
import type { CostTracker } from "./cost";
import type { ContentType, ResearchPack } from "./types";

export const WORD_RANGE = { min: 1000, max: 1500 } as const;

const ArticleSchema = z.object({
  title: z.string().describe("Compelling, accurate headline. No clickbait, no colon-subtitle."),
  subtitle: z.string().describe("One sentence explaining the subject."),
  introduction: z.array(z.string()).describe("Opening paragraph(s)"),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        paragraphs: z.array(z.string()),
        source_ids: z.array(z.string()).describe("IDs (S1, S2, ...) of the sources this section draws on"),
      }),
    )
    .describe("The body, in as many headed sections as the piece needs"),
  related_topics: z.array(z.string()).describe("Exactly three specific subjects for future exploration"),
  uncertainties: z.array(z.string()).describe("Points the sources disagree on or leave open, one sentence each, for a reader's note. Empty if none."),
});

export type DraftArticle = z.infer<typeof ArticleSchema>;

const SYSTEM = `You write for Daily Discovery, a magazine that helps curious adults learn one genuinely interesting thing a day. Aim for the register of a fine long-form magazine feature: intelligent but accessible, clear and conversational, engaging without sensationalism, substantive without being academic.

You are given research material: excerpts from the sources gathered for this piece. Read it as a journalist would. Build an original feature from it, not a summary of each source:
- Find the story or the question at its heart and open where it is most alive.
- For stories, give narrative, context and why it mattered. For explanations, show how and why things work, so the reader could explain it to a friend.
- Let the material decide the shape. Use headings where they help a reader; vary section length; no template.
- Be concrete: names, places, dates, numbers and mechanisms, from the sources.

Accuracy:
- Base factual statements on the research material. You may explain, connect and interpret, but frame inferences as such ("which suggests...", "historians read this as...").
- Don't add specific facts — dates, figures, names, quotations — that aren't in the material. If something important is missing, write around it rather than filling it in from memory.
- Where sources disagree or are uncertain, say so plainly.
- Weigh sources: prefer scholarly, institutional and primary material over weaker pages, and ignore anything that looks unreliable.
- Quote only words that appear in the material, and attribute them.

Avoid: generic AI openings ("Imagine...", "Have you ever wondered...", "In the annals of history..."), more than one rhetorical question, clickbait, closing morals or summaries ("In conclusion...", "It reminds us that..."), padding, and lists of facts in place of an argument.`;

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
}): Promise<DraftArticle> {
  const prompt = `Write today's discovery.

Topic: ${input.topic}
Content type: ${input.contentType.toUpperCase()}
What the reader should understand by the end: ${input.angle}
Length: roughly ${WORD_RANGE.min}-${WORD_RANGE.max} words of body text where the material warrants it; substance matters more than length.

<research>
${researchForModel(input.pack)}
</research>`;

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
