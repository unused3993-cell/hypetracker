import { articleWordCount, mostSimilar, WORD_TARGET } from "./text";
import type { ArticleContent, ValidationIssue } from "./types";

export interface DraftShape {
  title: string;
  subtitle: string;
  introduction: string[];
  sections: { heading: string; paragraphs: string[] }[];
  related_topics: string[];
}

/**
 * Structural, length and duplicate checks. Pure — no network. Factual checks live in verify.ts.
 * Structure is deliberately loose: any number of headed sections; only empty parts are errors.
 */
export function validateDraft(
  draft: DraftShape,
  pastTitles: string[],
  duplicateThreshold: number,
): { issues: ValidationIssue[]; content: ArticleContent; wordCount: number } {
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string) => issues.push({ level: "error", code, message });
  const warn = (code: string, message: string) => issues.push({ level: "warning", code, message });
  const text = (s: string | undefined) => (s ?? "").trim();

  if (!text(draft.title)) err("missing_title", "Title is empty.");
  if (!text(draft.subtitle)) err("missing_subtitle", "Subtitle is empty.");
  if (!draft.introduction?.some((p) => text(p))) err("missing_introduction", "Introduction is empty.");

  const sections = (draft.sections ?? []).map((s) => ({
    heading: text(s.heading),
    paragraphs: (s.paragraphs ?? []).map(text).filter(Boolean),
    source_ids: [] as string[],
  }));
  if (sections.length === 0) err("missing_body", "The article has no body sections.");
  if (sections.length > 8) warn("many_sections", `Body has ${sections.length} sections.`);
  // Headings are optional: an empty heading is an unmarked section break in a narrative piece.
  sections.forEach((s, i) => {
    if (s.paragraphs.length === 0) err("empty_section", `Section "${s.heading || i + 1}" has no paragraphs.`);
  });
  if ((draft.subtitle ?? "").split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length > 1)
    warn("subtitle_length", "Subtitle should be a single sentence.");

  const related = (draft.related_topics ?? []).map(text).filter(Boolean);
  if (related.length !== 3) warn("related_topics_count", `Expected 3 related topics, got ${related.length}.`);

  const content: ArticleContent = { introduction: (draft.introduction ?? []).map(text).filter(Boolean), sections };
  const wordCount = articleWordCount(content);
  if (wordCount < WORD_TARGET.min || wordCount > WORD_TARGET.max)
    warn("word_count", `Body is ${wordCount} words; target is ${WORD_TARGET.min}-${WORD_TARGET.max}.`);

  const dup = mostSimilar(draft.title ?? "", pastTitles);
  if (dup.score >= duplicateThreshold) err("duplicate_topic", `Title is very similar to an earlier discovery: "${dup.match}".`);

  const allText = [...content.introduction, ...sections.flatMap((s) => s.paragraphs)].join("\n");
  const rhetorical = (allText.match(/\?/g) ?? []).length;
  if (rhetorical > 2) warn("rhetorical_questions", `Contains ${rhetorical} questions; editorial guidelines discourage rhetorical questions.`);

  return { issues, content, wordCount };
}
