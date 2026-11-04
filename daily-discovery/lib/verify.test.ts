// Phase 2 tests: claim-map checks, writer input, revision problems, section sources.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { EvidenceLedger, VerificationRound } from "./types";
import { checkClaimMap, revisionProblems, sectionSources } from "./verify";
import { ledgerForWriter, type DraftArticle } from "./writer";

const ledger: EvidenceLedger = {
  sources: [
    { id: "S1", url: "https://obs.example.org/a", title: "Observatory", origin: "wikipedia_reference", content_status: "retrieved", authority: "institutional", relevance: "high", text: "x" },
    { id: "S2", url: "https://mag.example.com/b", title: "Magazine", origin: "wikipedia_reference", content_status: "retrieved", authority: "journalism", relevance: "high", text: "y" },
  ],
  passages: [],
  claims: [
    { id: "C1", statement: "Dyson organised two expeditions.", stakes: "routine", status: "supported", usable: true, evidence: [{ passage_id: "S1.P1", source_id: "S1", quote: "Dyson sent two parties to photograph the stars", verified: true, location: { start: 0, end: 10 } }] },
    { id: "C2", statement: "Plate selection was criticised.", stakes: "precise_or_contested", status: "disputed", note: "Earman and Glymour vs Kennefick", usable: true, evidence: [{ passage_id: "S2.P1", source_id: "S2", quote: "the 1919 evidence was weaker than claimed", verified: true }] },
    { id: "C3", statement: "Invented detail.", stakes: "routine", status: "supported", usable: false, exclusion_reason: "no supporting quote was found in the stored source text", evidence: [{ passage_id: "S1.P1", source_id: "S1", quote: "not in the text at all", verified: false }] },
  ],
  conflicts: [{ summary: "Whether plates were fairly set aside.", claim_ids: ["C2"], source_ids: ["S2"] }],
  sufficient: true,
  sufficiency_reason: "",
};

const article: DraftArticle = {
  title: "T",
  subtitle: "S.",
  introduction: ["In 1919 Dyson organised two expeditions to photograph stars."],
  sections: [
    { heading: "A", paragraphs: ["Critics later questioned how the plates were chosen."] },
    { heading: "B", paragraphs: ["A closing thought."] },
  ],
  related_topics: ["a", "b", "c"],
  claim_map: [
    { location: "intro-1", anchor: "In 1919 Dyson organised two", claim_ids: ["C1"] },
    { location: "s1-1", anchor: "Critics later questioned", claim_ids: ["C2", "C3", "C9"] },
    { location: "s4-1", anchor: "Nowhere", claim_ids: [] },
  ],
};

test("writer receives only usable claims, with disputes flagged and verified quotes", () => {
  const text = ledgerForWriter(ledger);
  assert.match(text, /C1\. Dyson organised two expeditions\./);
  assert.match(text, /C2\. .*\[DISPUTED: Earman and Glymour vs Kennefick\]/);
  assert.match(text, /"the 1919 evidence was weaker than claimed" — S2 \(journalism\)/);
  assert.doesNotMatch(text, /C3|Invented detail|not in the text/);
  assert.match(text, /Whether plates were fairly set aside/);
});

test("checkClaimMap flags invented and excluded claim IDs, bad locations and missing anchors", () => {
  const issues = checkClaimMap(article, ledger);
  assert.ok(issues.some((i) => /C3, which was excluded/.test(i)));
  assert.ok(issues.some((i) => /C9, which does not exist/.test(i)));
  assert.ok(issues.some((i) => /s4-1, which is not a paragraph/.test(i)));
  assert.ok(!issues.some((i) => i.startsWith("intro-1")));
});

const round: VerificationRound = {
  round: 1,
  passed: false,
  summary: "",
  map_issues: ["s1-1: cites claim C9, which does not exist", "s1-1: anchor \"x\" not found in the paragraph"],
  assertions: [
    { location: "intro-1", assertion: "Dyson organised two expeditions.", claim_ids: ["C1"], verdict: "supported", note: "" },
    { location: "s1-1", assertion: "Critics questioned the plates.", claim_ids: ["C2"], verdict: "partially_supported", note: "Evidence names only one side." },
  ],
};

test("revision problems include partially supported claims and fabricated claim IDs, not cosmetic anchor misses", () => {
  const problems = revisionProblems(round);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /partially supported/);
  assert.match(problems[1], /C9, which does not exist/);
});

test("section sources come only from supported assertions", () => {
  assert.deepEqual(sectionSources(article, round, ledger), [[], []], "s1-1 was only partially supported");
  const passed = { ...round, assertions: round.assertions.map((a) => ({ ...a, verdict: "supported" as const })) };
  assert.deepEqual(sectionSources(article, passed, ledger), [["S2"], []]);
});
