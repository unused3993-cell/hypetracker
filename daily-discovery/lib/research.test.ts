// Research tests: retrieval, text extraction, passage selection, budget.
// All network responses are fixtures; nothing here touches the real APIs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CostTracker, BudgetExceeded, worstCaseUsd } from "./cost";
import { ECLIPSE_QUERY, OPENALEX, fixtureFetch, MAGAZINE_HTML, OBSERVATORY_HTML } from "./fixtures";
import { extractReadableText } from "./html";
import { segment, selectPassages } from "./passages";
import { arxivAlternates, excerptRelevant, gutenbergSources, internetArchiveSources, openAlexSources, rebuildAbstract, retrieveSources, setFetchForTests } from "./retrieval";

test("extractReadableText keeps article prose and drops scripts, navigation, footers and footnote markers", () => {
  const { title, text } = extractReadableText(OBSERVATORY_HTML);
  assert.equal(title, "The 1919 eclipse expeditions | Example Observatory");
  assert.match(text, /Sun’s heat had distorted its mirror/);
  assert.match(text, /“Newtonian” value — one reason/);
  assert.doesNotMatch(text, /tracking|Free entry|Registered charity|\[3\]/);
  assert.match(text, /## Re-examination/);
  assert.equal(extractReadableText(MAGAZINE_HTML).title, "Was the 1919 eclipse result biased?");
});

test("arXiv links are read through their HTML or abstract pages, not skipped as PDFs", () => {
  assert.deepEqual(arxivAlternates("https://arxiv.org/pdf/0709.0685"), ["https://arxiv.org/html/0709.0685", "https://arxiv.org/abs/0709.0685"]);
  assert.deepEqual(arxivAlternates("https://arxiv.org/pdf/2010.13744v2.pdf"), ["https://arxiv.org/html/2010.13744", "https://arxiv.org/abs/2010.13744"]);
  assert.equal(arxivAlternates("https://example.org/paper.pdf"), null);
});

test("rebuildAbstract restores word order from OpenAlex's inverted index", () => {
  assert.equal(rebuildAbstract({ light: [3], bends: [2], gravity: [1], Does: [0] }), "Does gravity bends light");
});

test("retrieveSources gathers Wikipedia, its cited pages (one per site, no PDFs or catalogues) and OpenAlex", async () => {
  setFetchForTests(fixtureFetch());
  try {
    const tracker = new CostTracker(0.35, 0.25);
    const r = await retrieveSources(ECLIPSE_QUERY, tracker, 0, false);
    const by = (o: string) => r.sources.filter((s) => s.origin === o);
    assert.equal(by("wikipedia").length, 1);
    assert.equal(by("wikipedia")[0].content_status, "retrieved");
    assert.match(by("wikipedia")[0].text!, /## Expeditions/);
    const refs = by("wikipedia_reference");
    assert.deepEqual(
      refs.map((s) => s.url),
      ["https://www.example-observatory.org/history/1919-eclipse", "https://physicsmag.example.com/articles/eclipse-bias", "https://quiet-blog.example.net/einstein-was-right"],
      "books.google and PDF skipped; second observatory page skipped (same site)",
    );
    assert.equal(refs[2].content_status, "fetch_failed", "page with too little readable text");
    assert.equal(by("openalex")[0].content_status, "retrieved");
    assert.match(by("openalex")[0].text!, /determine what effect, if any, is produced by a gravitational field/);
    assert.equal(r.usedWebSearch, false);
    assert.equal(tracker.spent, 0, "retrieval from free sources costs nothing");
  } finally {
    setFetchForTests(null);
  }
});

test("selectPassages keeps relevant passages with offsets that point back into the source", async () => {
  setFetchForTests(fixtureFetch());
  try {
    const r = await retrieveSources(ECLIPSE_QUERY, new CostTracker(0.35, 0.25), 0, false);
    const passages = selectPassages(r.sources, `${ECLIPSE_QUERY.topic} ${ECLIPSE_QUERY.angle}`);
    assert.ok(passages.length >= 4);
    for (const p of passages) {
      const src = r.sources.find((s) => s.id === p.source_id)!;
      assert.equal(src.text!.slice(p.start, p.end).trim(), p.text);
    }
    assert.ok(segment(r.sources[0]).every((p) => !p.text.startsWith("## ")));
  } finally {
    setFetchForTests(null);
  }
});

test("CostTracker refuses calls whose worst case would break the cap, honouring reserves", () => {
  const t = new CostTracker(0.35, 0.25);
  const write = worstCaseUsd("claude-opus-5-5", 30000, 5000);
  const verify = worstCaseUsd("claude-sonnet-5-5", 40000, 4000);
  assert.ok(write > 0.1 && write < 0.2, `opus write worst case ${write}`);
  t.authorize("write", "claude-opus-5-5", write, verify);
  t.record("write", "claude-opus-5-5", { input_tokens: 9000, output_tokens: 3000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: null, iterations: null } as never);
  assert.ok(Math.abs(t.spent - (9000 * 4 + 3000 * 20) / 1e6) < 1e-9);
  assert.throws(() => t.authorize("revise", "claude-opus-5-5", 0.2, 0.1), BudgetExceeded);
  assert.match(t.stoppedForBudget!, /revise/);
});

test("CostTracker prices fallback iterations with the model that actually served them, plus searches", () => {
  const t = new CostTracker(0.35, 0.25);
  t.record("verify", "claude-sonnet-5-5", {
    input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
    server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 },
    iterations: [
      { type: "message", model: "claude-sonnet-5-5", input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
      { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
    ],
  } as never);
  const expected = (1000 * 2 + 100 * 10) / 1e6 + (1000 * 5 + 100 * 25) / 1e6 + 0.02;
  assert.ok(Math.abs(t.spent - expected) < 1e-9);
  assert.match(t.report("").stages[0].model, /opus-4-8/);
});

// ── Free book and open-access sources (fixtures; the real APIs are not contacted) ──

const MONGOL_QUERY = { topic: "How the Mongols tried to invade Japan", angle: "The fleets of 1274 and 1281 and the typhoon", searchTerms: ["Mongol invasions of Japan"] };
const filler = (n: number) => Array.from({ length: n }, (_, i) => `Chapter ${i}. The merchants of the river towns traded silk and salt along the coast,\nand the harvest that year was described at\nsome length by the chronicler.`).join("\n\n");
const relevant = "The Mongol fleet sailed for Japan in 1274 and again in 1281, when a typhoon\nwrecked the invasion ships off Kyushu and the Japanese defenders held the shore.";
const BOOK = `Header text\n*** START OF THE PROJECT GUTENBERG EBOOK TRAVELS ***\n${filler(60)}\n\n${relevant}\n\n${filler(60)}\n\n${relevant.replace("1274", "the first year")}\n\n${filler(60)}\n*** END OF THE PROJECT GUTENBERG EBOOK TRAVELS ***\nLicence text`;

function booksFetch(extra: Record<string, () => Response> = {}) {
  const json = (b: unknown) => () => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  const text = (b: string) => () => new Response(b, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  return fixtureFetch({
    "gutendex.com": json({ results: [{ id: 10636, title: "The Travels of Marco Polo", authors: [{ name: "Polo, Marco" }], formats: { "text/plain; charset=us-ascii": "https://www.gutenberg.org/ebooks/10636.txt.utf-8" } }] }),
    "gutenberg.org/ebooks/10636.txt": text(BOOK),
    "advancedsearch.php": json({ response: { docs: [{ identifier: "lending-copy", title: "x" }, { identifier: "historyofjapan00murd", title: "A History of Japan", creator: "Murdoch, James", year: "1903" }] } }),
    "lending-copy_djvu.txt": () => new Response("forbidden", { status: 403 }),
    "historyofjapan00murd_djvu.txt": text(`${filler(80)}\n\n${relevant}\n\n${filler(40)}\n\n${relevant}`),
    ...extra,
  });
}

test("Gutenberg: strips the licence, rejoins wrapped lines, keeps only relevant excerpts", async () => {
  setFetchForTests(booksFetch());
  try {
    const [book] = await gutenbergSources(MONGOL_QUERY);
    assert.equal(book.origin, "gutenberg");
    assert.equal(book.url, "https://www.gutenberg.org/ebooks/10636");
    assert.match(book.title, /Travels of Marco Polo — Polo, Marco \(Project Gutenberg\)/);
    assert.ok(book.text!.includes("when a typhoon wrecked the invasion ships"), "wrapped lines rejoined");
    assert.ok(!/START OF|Licence text|Header text/.test(book.text!), "licence header/footer removed");
    assert.ok(book.text!.length <= 20000 && book.text!.length < BOOK.length / 2, "only excerpts kept");
    assert.match(book.text!, /\[…\]/, "elisions marked between excerpts");
  } finally {
    setFetchForTests(null);
  }
});

test("Internet Archive: skips texts it can't download and keeps the first relevant one", async () => {
  setFetchForTests(booksFetch());
  try {
    const [book] = await internetArchiveSources(MONGOL_QUERY);
    assert.equal(book.url, "https://archive.org/details/historyofjapan00murd");
    assert.match(book.title, /A History of Japan — Murdoch, James \(1903\) \(Internet Archive\)/);
    assert.match(book.text!, /Mongol fleet sailed for Japan/);
  } finally {
    setFetchForTests(null);
  }
});

test("books that barely mention the topic are dropped", async () => {
  setFetchForTests(booksFetch({ "gutenberg.org/ebooks/10636.txt": () => new Response(filler(200), { status: 200, headers: { "content-type": "text/plain" } }) }));
  try {
    assert.deepEqual(await gutenbergSources(MONGOL_QUERY), []);
  } finally {
    setFetchForTests(null);
  }
});

test("OpenAlex: open-access full text (Unpaywall data) replaces the bare abstract when it's a readable page", async () => {
  const article = `<html><head><title>Paper</title></head><body><article>${Array.from({ length: 40 }, () => `<p>${relevant} The defenders built a stone wall along Hakata Bay after the first invasion.</p>`).join("")}</article></body></html>`;
  setFetchForTests(
    booksFetch({
      "api.openalex.org": () =>
        new Response(JSON.stringify({ results: [{ ...OPENALEX.results[0], best_oa_location: { landing_page_url: "https://journal.example.org/oa/123", pdf_url: null } }] }), { status: 200, headers: { "content-type": "application/json" } }),
      "journal.example.org/oa/123": () => new Response(article, { status: 200, headers: { "content-type": "text/html" } }),
    }),
  );
  try {
    const [paper] = await openAlexSources(MONGOL_QUERY);
    assert.match(paper.detail!, /^open-access full text \(journal\.example\.org/);
    assert.match(paper.text!, /stone wall along Hakata Bay/);
  } finally {
    setFetchForTests(null);
  }
});

test("excerptRelevant leaves short texts untouched and returns nothing for irrelevant long ones", () => {
  assert.equal(excerptRelevant("short text", "Mongol Japan", 100), "short text");
  assert.equal(excerptRelevant(filler(200), "Mongol Japan typhoon", 5000), "");
});
