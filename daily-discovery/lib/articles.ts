// Published-article files for the BAER reader (content/articles/<slug>.json).
// Created by `npm run import-article`; the text is the pipeline's output, copied verbatim.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ReaderSource {
  id: string;
  title: string;
  url: string;
}

export interface ReaderSection {
  heading: string;
  paragraphs: string[];
  sourceIds: string[];
}

export interface ReaderArticle {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  contentType: "story" | "explanation";
  introduction: string[];
  sections: ReaderSection[];
  /** Points the sources leave open, written by the pipeline for readers. */
  uncertainties: string[];
  sources: ReaderSource[];
  wordCount: number;
  readingMinutes: number;
  /** Provenance, for the editor: which run and model produced the text. */
  generatedFrom: { file: string; writer: string; reviewPassed: boolean; importedAt: string };
}

export const ARTICLES_DIR = join(process.cwd(), "content", "articles");

export function loadArticle(slug: string): ReaderArticle | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const file = join(ARTICLES_DIR, `${slug}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as ReaderArticle;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
