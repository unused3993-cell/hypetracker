import type { z } from "zod";
import { ArticleSchema, CritiqueSchema, StageOutput } from "./schemas";
import { readFileSync } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { structured, type ModelSettings } from "./claude";
import { stages } from "./config";
import type { CostTracker } from "./cost";
import type { ContentType, ResearchPack } from "./types";

export const WORD_RANGE = { min: 1100, max: 1600 } as const;



export type DraftArticle = z.infer<typeof ArticleSchema>;

const SYSTEM = `You are a staff writer at BAER. Write the piece in the voice of the model features above, following the BAER house style guide: choose a form and a spine before drafting, and follow every rule in it.

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
let exemplarText: string | null = null;
/**
 * Published features the editor chose as models of voice and flow (content/exemplars/*.md).
 * They are kept out of git (third-party text) and are optional.
 */
export function exemplars(): string {
  if (exemplarText !== null) return exemplarText;
  const dir = path.join(process.cwd(), "content", "exemplars");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];
  exemplarText = files.length
    ? `<voice_models>\nThese published features are BAER's models for voice, rhythm and flow. Write so a piece would sit naturally beside them: how they open, how each paragraph hands off to the next, how they move between scene, explanation and quotation, their dry asides, their sentence variety. Never copy their wording or facts, and never use their first-person reporting or interviews (see the style guide).\n\n${files.map((f) => `<feature name="${f.replace(/\.md$/, "")}">\n${readFileSync(path.join(dir, f), "utf8").trim()}\n</feature>`).join("\n\n")}\n</voice_models>\n\n`
    : "";
  return exemplarText;
}

export function sharedContext(pack: ResearchPack): string {
  return `${exemplars()}<style_guide>\n${styleGuide()}\n</style_guide>\n\n<research>\n${researchForModel(pack)}\n</research>`;
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
    schema: StageOutput,
    field: "article",
    system: SYSTEM,
    context: sharedContext(input.pack),
    prompt,
    tracker: input.tracker,
    reserveUsd: input.reserveUsd,
  });
}

const EDITOR = `You are the editor at BAER. Your first question: would this draft sit beside the model features above, or does it read like an encyclopedia entry rewritten? Point to the exact passages where it sounds like a report rather than those features, and say how those features would handle the same material. Then judge the draft against the BAER house style guide above, working through the editor's checklist at its end. Be specific and demanding: quote the draft and give a concrete fix for each point. Judge craft, structure and voice; also flag accuracy risks an editor would catch, using the research above. Then write a revision plan: the new form and spine if the draft's are weak, the new opening, the order of movements, what to cut, where the climax goes, and the ending.`;


export type Critique = z.infer<typeof CritiqueSchema>;

export function articleText(a: DraftArticle): string {
  const body = a.sections.map((s) => `${s.heading ? `## ${s.heading}` : "* * *"}\n\n${s.paragraphs.join("\n\n")}`).join("\n\n");
  return `# ${a.title}\n${a.subtitle}\n\n${a.introduction.join("\n\n")}\n\n${body}`;
}

export async function critiqueArticle(input: { draft: DraftArticle; pack: ResearchPack; tracker: CostTracker; reserveUsd: number }): Promise<Critique> {
  return structured({
    stage: "edit",
    settings: stages.edit,
    schema: StageOutput,
    field: "critique",
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
    schema: StageOutput,
    field: "article",
    system: `${SYSTEM}\n\nThis is a rewrite. Write the whole piece afresh from the research, following the editor's plan; don't patch the draft sentence by sentence. Keep what works. The rewrite must be at least ${WORD_RANGE.min} words and at most ${WORD_RANGE.max}, whatever length the editor suggests: when you cut detours, spend the words on the scenes, evidence and climax the editor asked for. Fill source_ids for every section.`,
    context: sharedContext(input.pack),
    prompt: `Topic: ${input.topic}\n\n<draft>\n${articleText(input.draft)}\n</draft>\n\n<editor>\nSpine: ${input.critique.spine}\n\nFindings:\n${notes}\n\nRevision plan:\n${input.critique.revision_plan}\n</editor>`,
    tracker: input.tracker,
    reserveUsd: input.reserveUsd,
  });
}
