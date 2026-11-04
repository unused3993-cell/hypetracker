// Research tests: retrieval, text extraction, passage selection, budget.
// All network responses are fixtures; nothing here touches the real APIs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CostTracker, BudgetExceeded, worstCaseUsd } from "./cost";
import { ECLIPSE_QUERY, fixtureFetch, MAGAZINE_HTML, OBSERVATORY_HTML } from "./fixtures";
import { extractReadableText } from "./html";
import { segment, selectPassages } from "./passages";
import { arxivAlternates, rebuildAbstract, retrieveSources, setFetchForTests } from "./retrieval";

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
