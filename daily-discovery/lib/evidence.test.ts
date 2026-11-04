// Phase 1 tests: retrieval, passage selection, quote verification, credibility, budget.
// All network responses are fixtures; nothing here touches the real APIs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CostTracker, BudgetExceeded, worstCaseUsd } from "./cost";
import { assessClaim, buildLedger, sufficiency } from "./evidence";
import { ECLIPSE_QUERY, fixtureFetch, MAGAZINE_HTML, OBSERVATORY_HTML } from "./fixtures";
import { extractReadableText } from "./html";
import { segment, selectPassages } from "./passages";
import { findQuote } from "./quotes";
import { rebuildAbstract, retrieveSources, setFetchForTests } from "./retrieval";
import type { Claim, SourceRecord } from "./types";

test("findQuote tolerates whitespace, case, curly quotes, dashes and elisions — and reports original offsets", () => {
  const text = "Taken at face value the astrographic plates pointed towards the lower “Newtonian” value — one reason\n  the decision to set them aside was later questioned.";
  const q = findQuote(text, 'the astrographic plates pointed towards the lower "Newtonian" value - one reason the decision');
  assert.ok(q);
  assert.equal(text.slice(q.start, q.end), "the astrographic plates pointed towards the lower “Newtonian” value — one reason\n  the decision");
  assert.ok(findQuote(text, "Taken at face value the astrographic plates ... the decision to set them aside was later questioned."));
  assert.ok(findQuote(text, "TAKEN AT FACE VALUE THE ASTROGRAPHIC PLATES POINTED"));
});

test("findQuote rejects altered wording, short quotes, and tiny elided fragments", () => {
  const text = "Plates from the four-inch telescope gave a deflection of about 1.98 arcseconds at Sobral.";
  assert.equal(findQuote(text, "Plates from the four-inch telescope gave a deflection of about 1.75 arcseconds"), null);
  assert.equal(findQuote(text, "about 1.98 arcseconds"), null, "too short to count as evidence");
  assert.equal(findQuote(text, "Plates from ... the ... Sobral"), null, "fragments under 3 words");
});

test("extractReadableText keeps article prose and drops scripts, navigation, footers and footnote markers", () => {
  const { title, text } = extractReadableText(OBSERVATORY_HTML);
  assert.equal(title, "The 1919 eclipse expeditions | Example Observatory");
  assert.match(text, /Sun’s heat had distorted its mirror/);
  assert.match(text, /“Newtonian” value — one reason/);
  assert.doesNotMatch(text, /tracking|Free entry|Registered charity|\[3\]/);
  assert.match(text, /## Re-examination/);
  assert.equal(extractReadableText(MAGAZINE_HTML).title, "Was the 1919 eclipse result biased?");
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

const src = (id: string, url: string, authority: SourceRecord["authority"], origin: SourceRecord["origin"] = "wikipedia_reference"): SourceRecord => ({
  id, url, title: id, origin, content_status: "retrieved", text: "", authority, relevance: "high",
});
const claim = (stakes: Claim["stakes"], sourceIds: string[]): Claim => ({
  id: "C1", statement: "x", stakes, status: "supported", usable: false,
  evidence: sourceIds.map((s) => ({ passage_id: `${s}.P1`, source_id: s, quote: "q", verified: true })),
});

test("credibility depends on authority and on the nature of the claim, not on domain names", () => {
  const sources = new Map([
    ["S1", src("S1", "https://en.wikipedia.org/wiki/X", "reference", "wikipedia")],
    ["S2", src("S2", "https://museum.example.org/a", "institutional")],
    ["S3", src("S3", "https://blog.example.com/a", "popular")],
    ["S4", src("S4", "https://news.example.com/a", "journalism")],
    ["S5", src("S5", "https://farm.example.com/a", "unreliable")],
  ]);
  assert.equal(assessClaim(claim("routine", ["S1"]), sources).usable, true, "encyclopedia is fine for routine facts");
  assert.equal(assessClaim(claim("precise_or_contested", ["S1"]), sources).usable, false, "but not alone for precise ones");
  assert.equal(assessClaim(claim("precise_or_contested", ["S1", "S4"]), sources).usable, true, "two acceptable sources on different sites");
  assert.equal(assessClaim(claim("precise_or_contested", ["S2"]), sources).usable, true, "one institutional source");
  assert.equal(assessClaim(claim("routine", ["S3"]), sources).usable, false, "single popular source");
  assert.equal(assessClaim(claim("routine", ["S5"]), sources).usable, false, "unreliable never counts");
  const unverified = claim("routine", ["S2"]);
  unverified.evidence[0].verified = false;
  assert.match(assessClaim(unverified, sources).reason!, /no supporting quote/);
});

test("buildLedger verifies quotes against stored text, records locations, and excludes failing claims", () => {
  const text = "At Sobral the smaller four-inch telescope gave a deflection of about 1.98 arcseconds, while plates from the main astrographic instrument were blurred.";
  const sources: SourceRecord[] = [{ id: "S1", url: "https://obs.example.org/a", title: "Obs", origin: "wikipedia_reference", content_status: "retrieved", text }];
  const passages = [{ id: "S1.P1", source_id: "S1", start: 0, end: text.length, text, score: 1 }];
  const ledger = buildLedger(sources, passages, {
    sources: [{ source_id: "S1", authority: "institutional", relevance: "high", note: "observatory history page" }],
    claims: [
      { id: "C1", statement: "The four-inch telescope at Sobral measured about 1.98 arcseconds.", stakes: "precise_or_contested", status: "supported", note: "", evidence: [{ passage_id: "S1.P1", quote: "the smaller four-inch telescope gave a deflection of about 1.98 arcseconds" }] },
      { id: "C2", statement: "Fabricated figure.", stakes: "precise_or_contested", status: "supported", note: "", evidence: [{ passage_id: "S1.P1", quote: "the telescope gave a deflection of exactly 2.4 arcseconds" }] },
      { id: "C3", statement: "Unknown passage.", stakes: "routine", status: "supported", note: "", evidence: [{ passage_id: "S9.P9", quote: "plates from the main astrographic instrument were blurred" }] },
    ],
    conflicts: [],
  });
  const [c1, c2, c3] = ledger.claims;
  assert.equal(c1.usable, true);
  assert.equal(text.slice(c1.evidence[0].location!.start, c1.evidence[0].location!.end), "the smaller four-inch telescope gave a deflection of about 1.98 arcseconds");
  assert.equal(c2.usable, false);
  assert.equal(c3.usable, false);
  assert.equal(sources[0].authority, "institutional");
  assert.equal(ledger.sufficient, false);
});

test("sufficiency needs enough usable claims, independent sources, and more than an encyclopedia", () => {
  const sources = new Map([
    ["S1", src("S1", "https://en.wikipedia.org/wiki/X", "reference", "wikipedia")],
    ["S2", src("S2", "https://museum.example.org/a", "institutional")],
    ["S3", src("S3", "https://uni.example.edu/a", "scholarly", "openalex")],
  ]);
  const many = (ids: string[]) => Array.from({ length: 12 }, (_, i) => ({ ...claim("routine", ids), id: `C${i}`, usable: true }));
  assert.equal(sufficiency(many(["S1"]), sources).sufficient, false);
  assert.equal(sufficiency(many(["S1", "S2", "S3"]), sources).sufficient, true);
  assert.equal(sufficiency(many(["S1", "S2", "S3"]).slice(0, 5), sources).sufficient, false);
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
