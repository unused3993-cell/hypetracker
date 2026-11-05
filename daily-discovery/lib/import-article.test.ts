// Tests the import-article CLI by running the real entry points as child processes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import type { ReaderArticle } from "./articles";
import { attribution } from "./pipeline";
import { articleWordCount, readingTimeMinutes } from "./text";

const PROJECT = resolve(__dirname, "..");
const SCRIPT = join(PROJECT, "scripts", "import-article.mjs");
const work = mkdtempSync(join(tmpdir(), "import-article-"));
after(() => rmSync(work, { recursive: true, force: true }));

/** A run shaped like `npm run article` output, about the size of a real one (~200 KB). */
function makeRun() {
  const page = (n: number) => "Readable source text about the 1919 eclipse expeditions. ".repeat(n);
  return {
    query: { topic: "How the 1919 eclipse tested Einstein", angle: "x", searchTerms: ["Eddington experiment"] },
    writer: "claude-sonnet-5-5",
    pack: {
      sources: [
        { id: "S1", url: "https://en.wikipedia.org/wiki/Eddington_experiment", title: "Eddington experiment — Wikipedia", origin: "wikipedia", content_status: "retrieved", text: page(800) },
        { id: "S2", url: "https://zenodo.org/record/1", title: "Zenodo", origin: "wikipedia_reference", content_status: "fetch_failed", detail: "HTTP 403" },
        { id: "S3", url: "https://revistapesquisa.fapesp.br/en/when-light-bent-2/", title: "When light bent", origin: "wikipedia_reference", content_status: "retrieved", text: page(1200) },
        { id: "S10", url: "https://eclipse-history.example.ac.uk/1919", title: "The 1919 expeditions", origin: "web_search", content_status: "retrieved", text: page(1200) },
      ],
      passages: [
        { id: "S1.P1", source_id: "S1", start: 0, end: 10, text: "x", score: 1 },
        { id: "S10.P1", source_id: "S10", start: 0, end: 10, text: "y", score: 1 },
      ],
    },
    article: {
      title: "The Plates Eddington Set Aside",
      subtitle: "Why the 1919 result was celebrated at once and argued over for decades.",
      introduction: ["On 29 May 1919 the Moon passed in front of the Sun.", "Two teams waited."],
      sections: [
        { heading: "Two expeditions", paragraphs: ["Dyson organised two parties.", "One went to Sobral."], source_ids: ["S1", "S3", "S3", "S2", "S99"] },
        { heading: "The blurred plates", paragraphs: ["The astrographic plates were blurred."], source_ids: [] },
      ],
      related_topics: ["a", "b", "c"],
      uncertainties: ["Whether the plates were fairly set aside is still debated."],
    },
    review: { passed: true, issues: [], summary: "", source_assessment: "" },
    usage: { total_cost_usd: 0.21 },
  };
}

function writeRun(name: string, data: unknown): string {
  const file = join(work, name);
  writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  return file;
}

function cli(args: string[], cwd = work) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8", timeout: 20000 });
  return { ...r, ms: Date.now() - started };
}

test("valid run: prints success, writes the reader file, exits 0 promptly", () => {
  const run = makeRun();
  const file = writeRun("article-valid.json", run);
  assert.ok(readFileSync(file).length > 150_000, "fixture should be about as large as a real run");

  const r = cli([file, "--category", "History"]);
  assert.equal(r.signal, null, "must not be killed by the timeout");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.ms < 5000, `took ${r.ms} ms`);
  assert.match(r.stdout, /Imported "The Plates Eddington Set Aside"/);
  assert.match(r.stdout, /content\/articles\/the-plates-eddington-set-aside\.json/);
  assert.match(r.stdout, /read\/the-plates-eddington-set-aside/);

  const out = JSON.parse(readFileSync(join(work, "content", "articles", "the-plates-eddington-set-aside.json"), "utf8")) as ReaderArticle;
  assert.equal(out.slug, "the-plates-eddington-set-aside");
  assert.equal(out.category, "History");
  assert.deepEqual(out.introduction, run.article.introduction, "text copied verbatim");
  assert.deepEqual(out.uncertainties, run.article.uncertainties);
  assert.equal(out.generatedFrom.file, "article-valid.json");
  assert.equal(out.generatedFrom.reviewPassed, true);

  // Same crediting and counts as the pipeline's own functions.
  const expected = attribution(run.article as never, run.pack as never);
  assert.deepEqual(out.sections.map((s) => s.sourceIds), expected.content.sections.map((s) => s.source_ids));
  assert.deepEqual(out.sources, expected.sources.map(({ id, title, url }) => ({ id, title, url })));
  assert.deepEqual(out.sources.map((s) => s.id), ["S1", "S3", "S10"], "failed fetches and unknown IDs dropped; numeric order");
  assert.equal(out.wordCount, articleWordCount(expected.content));
  assert.equal(out.readingMinutes, readingTimeMinutes(out.wordCount));
  assert.ok(!JSON.stringify(out).includes("Readable source text"), "stored page text is not copied");

  const again = cli([file]);
  assert.equal(again.status, 0);
  assert.match(again.stdout, /^Updated "/);
});

test("npm run import-article works from the project folder", () => {
  const slug = `importer-test-${process.pid}`;
  const target = join(PROJECT, "content", "articles", `${slug}.json`);
  const file = writeRun("article-npm.json", makeRun());
  try {
    const r = spawnSync("npm", ["run", "--silent", "import-article", "--", file, "--category", "Science", "--slug", slug], { cwd: PROJECT, encoding: "utf8", timeout: 30000 });
    assert.equal(r.signal, null);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Imported "The Plates Eddington Set Aside"/);
    assert.ok(existsSync(target));
  } finally {
    rmSync(target, { force: true });
  }
});

test("invalid input: explicit error, exit code 2, nothing written", () => {
  const notJson = writeRun("bad.json", "{ not json");
  const wrongShape = writeRun("shape.json", { article: { title: "T", subtitle: "S", introduction: ["p"], sections: [] }, pack: { sources: [] } });
  const cases: [string[], RegExp][] = [
    [[], /No input file given/],
    [[join(work, "missing.json")], /File not found/],
    [[notJson], /is not valid JSON/],
    [[wrongShape], /article\.sections is missing or empty.*pack\.passages/],
    [[notJson, "--colour", "red"], /Unknown option --colour/],
    [[notJson, "--category"], /--category needs a value/],
  ];
  for (const [args, message] of cases) {
    const r = cli(args, mkdtempSync(join(work, "empty-")));
    assert.equal(r.status, 2, `${args.join(" ")} → ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, message);
    assert.match(r.stderr, /^import-article: /);
  }
  const badSlug = cli([writeRun("ok.json", makeRun()), "--slug", "Bad Slug!"], mkdtempSync(join(work, "empty-")));
  assert.equal(badSlug.status, 2);
  assert.match(badSlug.stderr, /lowercase letters, digits and hyphens/);
});
