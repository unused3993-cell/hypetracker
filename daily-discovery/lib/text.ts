// Pure text helpers: word counts, reading time, and topic similarity.

import type { ArticleContent } from "./types";

/** Soft bounds for a warning only; the writer aims for ~1,000-1,500 words where the material warrants it. */
export const WORD_TARGET = { min: 600, max: 1700 } as const;
const WORDS_PER_MINUTE = 230;

export function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu);
  return matches ? matches.length : 0;
}

/** Body word count: introduction + section paragraphs (headings excluded). */
export function articleWordCount(content: ArticleContent): number {
  const paragraphs = [...content.introduction, ...content.sections.flatMap((s) => s.paragraphs)];
  return paragraphs.reduce((n, p) => n + countWords(p), 0);
}

export function readingTimeMinutes(words: number): number {
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

const STOPWORDS = new Set(
  (
    "a an and are as at be by did do does for from how in into is it its of on or that the their " +
    "this to was were what when where which who why with without behind inside really actually " +
    "story history secret secrets strange curious surprising forgotten mystery mysteries " +
    "tried attempted attempt made became nearly almost once ever very great"
  ).split(" "),
);

function stem(word: string): string {
  // Deliberately crude: enough to make "invasions"/"invasion", "worked"/"works" match.
  return word.replace(/(ies|es|s|ed|ing)$/u, "") || word;
}

export function topicTokens(text: string): Set<string> {
  const words = text.toLowerCase().normalize("NFKD").match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter((w) => w.length > 2 && !STOPWORDS.has(w)).map(stem));
}

/** Jaccard similarity of content tokens, 0..1. */
export function topicSimilarity(a: string, b: string): number {
  const ta = topicTokens(a);
  const tb = topicTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/** Highest similarity between `text` and any of `others`, with the matching entry. */
export function mostSimilar(text: string, others: string[]): { score: number; match: string | null } {
  let best = { score: 0, match: null as string | null };
  for (const o of others) {
    const score = topicSimilarity(text, o);
    if (score > best.score) best = { score, match: o };
  }
  return best;
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) if (p.startsWith("utm_")) u.searchParams.delete(p);
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}
