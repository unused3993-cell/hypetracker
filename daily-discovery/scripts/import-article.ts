// Turn a pipeline run (runs/article-<time>.json from `npm run article`) into a reader file
// at content/articles/<slug>.json. Text is copied verbatim; only the sources the writer read
// are kept (titles and URLs, not their stored page text).
//
//   npm run import-article -- runs/article-<time>.json [--category "History"] [--slug my-slug]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) throw new Error("Usage: npm run import-article -- runs/article-<time>.json [--category History] [--slug ...]");
  const { attribution } = await import("../lib/pipeline");
  const { articleWordCount, readingTimeMinutes } = await import("../lib/text");
  const { ARTICLES_DIR, slugify } = await import("../lib/articles");
  type ReaderArticle = import("../lib/articles").ReaderArticle;

  const run = JSON.parse(readFileSync(file, "utf8"));
  if (!run.article || !run.pack) throw new Error(`${file} doesn't look like output from \`npm run article\`.`);
  const { content, sources } = attribution(run.article, run.pack);
  const words = articleWordCount(content);
  const slug = arg("--slug") ?? slugify(run.article.title);

  const out: ReaderArticle = {
    slug,
    title: run.article.title,
    subtitle: run.article.subtitle,
    category: arg("--category") ?? "Science",
    contentType: run.query?.contentType ?? "story",
    introduction: content.introduction,
    sections: content.sections.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs, sourceIds: s.source_ids })),
    uncertainties: run.article.uncertainties ?? [],
    sources: sources.map((s) => ({ id: s.id, title: s.title, url: s.url })),
    wordCount: words,
    readingMinutes: readingTimeMinutes(words),
    generatedFrom: { file: basename(file), writer: run.writer ?? "unknown", reviewPassed: !!run.review?.passed, importedAt: new Date().toISOString() },
  };

  mkdirSync(ARTICLES_DIR, { recursive: true });
  const target = join(ARTICLES_DIR, `${slug}.json`);
  writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
  console.log(`Imported "${out.title}" (${words} words, ${out.sources.length} sources) → ${target}`);
  if (!out.generatedFrom.reviewPassed) console.log("Warning: this run had unresolved substantive review issues. Don't publish it until they're fixed.");
  console.log(`Preview: http://localhost:3000/read/${slug}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
