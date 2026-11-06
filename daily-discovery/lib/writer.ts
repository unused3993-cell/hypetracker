import { z } from "zod";
import { readFileSync } from "node:fs";
import path from "node:path";
import { structured, type ModelSettings } from "./claude";
import { stages } from "./config";
import type { CostTracker } from "./cost";
import type { ContentType, ResearchPack } from "./types";

export const WORD_RANGE = { min: 1100, max: 1600 } as const;

const ArticleSchema = z.object({
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

export type DraftArticle = z.infer<typeof ArticleSchema>;

const SYSTEM = `You are a staff writer at BAER. Write the piece according to the BAER house style guide above: choose a form and a spine before drafting, and follow every rule in it.

Accuracy (a fact-checker reviews every sentence against the research afterwards):
- Every scene, detail, number, name, date, quotation, motive and feeling must come from the research material. Do not invent dialogue, thoughts, weather, sounds or atmosphere.
- Mark inference as inference. Make disagreement between sources part of the story.
- Quote only words that appear in the material, and attribute them to people or documents, never to websites.
- Prefer scholarly, institutional and primary material; ignore anything that looks unreliable.

Output: state your plan in "plan" first. The opening goes in "introduction"; the rest of the story (most of the words) goes in "sections". Use an empty heading for an unmarked break.`;

let guide: string | null = null;
/** The BAER house style guide (content/style-guide.md). */
export function styleGuide(): string {
  guide ??= readFileSync(path.join(process.cwd(), "content", "style-guide.md"), "utf8");
  return guide;
}

/**
 * Material shared by the writer, editor, rewriter and fact-checker, identical across calls so
 * it is cached after the first one (per model).
 */
export function sharedContext(pack: ResearchPack): string {
  return `<style_guide>\n${styleGuide()}\n</style_guide>\n\n<research>\n${researchForModel(pack)}\n</research>`;
}

/** The research material as the writer and reviewer see it, grouped by source. */
export function researchForModel(pack: ResearchPack): string {
  const bySource = new Map<string, string[]>();
  for (const p of pack.passages) bySource.set(p.source_id, [...(bySource.get(p.source_id) ?? []), p.text]);
  return [...bySource.entries()]
    .map(([id, texts]) => {
      const s = pack.sources.find((x) => x.id === id)!;
      const kind =
        s.origin === "openalex"
          ? s.detail?.startsWith("open-access") ? "scholarly article" : "scholarly abstract"
          : s.origin === "gutenberg" || s.origin === "internet_archive"
            ? "public-domain book: a period or primary source; its scholarship may be outdated"
            : s.origin === "wikipedia"
              ? "encyclopedia"
              : "web page";
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

The style guide and the research material are above.${input.retryNote ? `\n\nIMPORTANT: ${input.retryNote}` : ""}`;

  return structured({
    stage: "write",
    settings: input.settings ?? stages.write,
    schema: ArticleSchema,
    system: SYSTEM,
    context: sharedContext(input.pack),
    prompt,
    tracker: input.tracker,
    reserveUsd: input.reserveUsd,
  });
}

const EDITOR = `You are the editor at BAER. Judge the draft against the BAER house style guide above, working through the editor's checklist at its end. Be specific and demanding: quote the draft and give a concrete fix for each point. Judge craft, structure and voice; also flag accuracy risks an editor would catch, using the research above. Then write a revision plan: the new form and spine if the draft's are weak, the new opening, the order of movements, what to cut, where the climax goes, and the ending.`;

const CritiqueSchema = z.object({
  spine: z.string().describe("The form and spine the piece should have, in the guide's one-sentence formula"),
  findings: z
    .array(z.object({ checklist_item: z.string(), quote: z.string().describe("Exact words from the draft"), fix: z.string() }))
    .describe("Every problem found, most important first"),
  revision_plan: z.string().describe("Instructions for the rewrite, in order"),
});
export type Critique = z.infer<typeof CritiqueSchema>;

export function articleText(a: DraftArticle): string {
  const body = a.sections.map((s) => `${s.heading ? `## ${s.heading}` : "* * *"}\n\n${s.paragraphs.join("\n\n")}`).join("\n\n");
  return `# ${a.title}\n${a.subtitle}\n\n${a.introduction.join("\n\n")}\n\n${body}`;
}

export async function critiqueArticle(input: { draft: DraftArticle; pack: ResearchPack; tracker: CostTracker; reserveUsd: number }): Promise<Critique> {
  return structured({
    stage: "edit",
    settings: stages.edit,
    schema: CritiqueSchema,
    system: EDITOR,
    context: sharedContext(input.pack),
    prompt: `<draft>\n${articleText(input.draft)}\n</draft>`,
    tracker: input.tracker,
    reserveUsd: input.reserveUsd,
  });
}

export async function rewriteArticle(input: { topic: string; draft: DraftArticle; critique: Critique; pack: ResearchPack; tracker: CostTracker; reserveUsd: number; settings?: ModelSettings }): Promise<DraftArticle> {
  const notes = input.critique.findings.map((f, i) => `${i + 1}. [${f.checklist_item}] "${f.quote}" → ${f.fix}`).join("\n");
  return structured({
    stage: "rewrite",
    settings: input.settings ?? stages.rewrite,
    schema: ArticleSchema,
    system: `${SYSTEM}\n\nThis is a rewrite. Write the whole piece afresh from the research, following the editor's plan; don't patch the draft sentence by sentence. Keep what works, and keep the length at roughly ${WORD_RANGE.min}-${WORD_RANGE.max} words.`,
    context: sharedContext(input.pack),
    prompt: `Topic: ${input.topic}\n\n<draft>\n${articleText(input.draft)}\n</draft>\n\n<editor>\nSpine: ${input.critique.spine}\n\nFindings:\n${notes}\n\nRevision plan:\n${input.critique.revision_plan}\n</editor>`,
    tracker: input.tracker,
    reserveUsd: input.reserveUsd,
  });
}
