#!/usr/bin/env node
// Import a pipeline run (runs/article-<time>.json from `npm run article`) as a reader article:
// content/articles/<slug>.json, shown at /read/<slug>.
//
//   npm run import-article -- runs/article-<time>.json [--category Science] [--slug my-slug]
//   node scripts/import-article.mjs runs/article-<time>.json [--category Science] [--slug my-slug]
//
// Plain JavaScript with only Node built-ins: no TypeScript loader and none of the generation
// pipeline's dependencies, so it runs the same on any Node ≥ 18. The article text is copied
// verbatim; only the sources the writer read are kept (titles and URLs, not page text).
// Output shape: ReaderArticle in lib/articles.ts. Source crediting mirrors attribution() in
// lib/pipeline.ts; lib/import-article.test.ts checks the two stay in step.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

const USAGE = "Usage: npm run import-article -- runs/article-<time>.json [--category Science] [--slug my-slug]";
const WORDS_PER_MINUTE = 230; // keep in step with lib/text.ts

class InputError extends Error {}

function parseArgs(argv) {
  const opts = { file: undefined, category: "Science", slug: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--category" || a === "--slug") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new InputError(`${a} needs a value.\n${USAGE}`);
      opts[a.slice(2)] = value;
      i++;
    } else if (a === "--help" || a === "-h") {
      return { help: true };
    } else if (a.startsWith("--")) {
      throw new InputError(`Unknown option ${a}.\n${USAGE}`);
    } else if (!opts.file) {
      opts.file = a;
    } else {
      throw new InputError(`Unexpected argument "${a}".\n${USAGE}`);
    }
  }
  if (!opts.file) throw new InputError(`No input file given.\n${USAGE}`);
  return opts;
}

const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");

function validateRun(run, file) {
  const problems = [];
  const a = run?.article;
  if (!a || typeof a !== "object") problems.push('missing "article"');
  else {
    if (typeof a.title !== "string" || !a.title.trim()) problems.push("article.title is missing");
    if (typeof a.subtitle !== "string") problems.push("article.subtitle is missing");
    if (!isStringArray(a.introduction)) problems.push("article.introduction must be a list of paragraphs");
    if (!Array.isArray(a.sections) || a.sections.length === 0) problems.push("article.sections is missing or empty");
    else
      a.sections.forEach((s, i) => {
        if (typeof s?.heading !== "string") problems.push(`article.sections[${i}].heading is missing`);
        if (!isStringArray(s?.paragraphs)) problems.push(`article.sections[${i}].paragraphs must be a list of paragraphs`);
      });
  }
  if (!Array.isArray(run?.pack?.sources)) problems.push('missing "pack.sources"');
  if (!Array.isArray(run?.pack?.passages)) problems.push('missing "pack.passages"');
  if (problems.length) throw new InputError(`${file} isn't a usable \`npm run article\` output: ${problems.join("; ")}.`);
}

/** Same rule as attribution() in lib/pipeline.ts. */
function credit(article, pack) {
  const known = new Map(pack.sources.filter((s) => s.content_status === "retrieved").map((s) => [s.id, s]));
  const sections = article.sections.map((s) => ({
    heading: s.heading,
    paragraphs: s.paragraphs,
    sourceIds: [...new Set(Array.isArray(s.source_ids) ? s.source_ids : [])].filter((id) => known.has(id)),
  }));
  const ids = new Set(sections.flatMap((s) => s.sourceIds));
  for (const p of pack.passages) ids.add(p.source_id);
  const sources = [...ids]
    .filter((id) => known.has(id))
    .sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)))
    .map((id) => ({ id, title: known.get(id).title, url: known.get(id).url }));
  return { sections, sources };
}

/** Same rule as countWords() in lib/text.ts. */
const countWords = (text) => (text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) ?? []).length;

function slugify(title) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (!existsSync(opts.file)) throw new InputError(`File not found: ${opts.file} (relative paths are resolved from ${process.cwd()}).`);

  let run;
  try {
    run = JSON.parse(readFileSync(opts.file, "utf8"));
  } catch (e) {
    throw new InputError(`${opts.file} is not valid JSON: ${e.message}`);
  }
  validateRun(run, opts.file);

  const article = run.article;
  const slug = opts.slug ?? slugify(article.title);
  if (!/^[a-z0-9-]+$/.test(slug)) throw new InputError(`Slug "${slug}" must use only lowercase letters, digits and hyphens.`);

  const { sections, sources } = credit(article, run.pack);
  const words = [...article.introduction, ...sections.flatMap((s) => s.paragraphs)].reduce((n, p) => n + countWords(p), 0);
  const out = {
    slug,
    title: article.title,
    subtitle: article.subtitle,
    category: opts.category,
    contentType: run.query?.contentType ?? "story",
    introduction: article.introduction,
    sections,
    uncertainties: isStringArray(article.uncertainties) ? article.uncertainties : [],
    sources,
    wordCount: words,
    readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    generatedFrom: { file: basename(opts.file), writer: run.writer ?? "unknown", reviewPassed: run.review?.passed === true, importedAt: new Date().toISOString() },
  };

  const dir = join(process.cwd(), "content", "articles");
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `${slug}.json`);
  const existed = existsSync(target);
  writeFileSync(target, JSON.stringify(out, null, 2) + "\n");

  console.log(`${existed ? "Updated" : "Imported"} "${out.title}"`);
  console.log(`  → ${relative(process.cwd(), target)} (${words} words, ${sources.length} sources, ${out.readingMinutes} min read)`);
  console.log(`  Preview: http://localhost:3000/read/${slug}  (start the app with npm run dev)`);
  if (!out.generatedFrom.reviewPassed) console.log("  Warning: this run had unresolved substantive review issues. Don't publish it until they're fixed.");
  return 0;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(`import-article: ${err instanceof InputError ? err.message : err?.stack ?? err}`);
  process.exitCode = err instanceof InputError ? 2 : 1;
}
// Nothing here opens handles, but exit explicitly so the command can never appear to hang.
process.exit(process.exitCode);
