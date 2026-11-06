// Editorial review tests: targeted corrections and the approval gate.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCorrections } from "./review";
import type { ReviewIssue } from "./types";
import type { DraftArticle } from "./writer";

const article: DraftArticle = {
  plan: "",
  title: "The Eclipse That Made Einstein Famous",
  subtitle: "Two expeditions tested whether gravity bends light.",
  introduction: ["In May 1919 two teams set out to photograph stars beside the darkened Sun."],
  sections: [
    { heading: "Sobral", paragraphs: ["The smaller telescope gave a deflection of 1.75 arcseconds, exactly Einstein’s figure.", "The astrographic plates were blurred."], source_ids: [] },
    { heading: "Príncipe", paragraphs: ["Clouds covered the sky. Eddington, who led the expedition, rejoiced."], source_ids: [] },
  ],
  related_topics: ["a", "b", "c"],
  uncertainties: [],
};

const issue = (o: Partial<ReviewIssue>): ReviewIssue => ({ type: "factual_error", severity: "substantive", location: "s1-1", excerpt: "", correction: "", explanation: "", source_ids: ["S2"], ...o });

test("corrections replace the exact excerpt, tolerating quote styles and whitespace", () => {
  const { article: out, issues } = applyCorrections(article, [
    issue({ excerpt: "a deflection of 1.75 arcseconds, exactly Einstein's figure", correction: "a deflection of about 1.98 arcseconds, above Einstein’s 1.75" }),
  ]);
  assert.equal(issues[0].applied, true);
  assert.equal(out.sections[0].paragraphs[0], "The smaller telescope gave a deflection of about 1.98 arcseconds, above Einstein’s 1.75.");
  assert.equal(article.sections[0].paragraphs[0].includes("1.75 arcseconds"), true, "the original draft is not mutated");
});

test("omissions are inserted after the anchor; deletions can empty a paragraph; wrong locations fall back to wherever the excerpt is", () => {
  const { article: out, issues } = applyCorrections(article, [
    issue({ type: "omission", location: "s1-2", excerpt: "The astrographic plates were blurred.", correction: "The team blamed the Sun’s heat on the mirror." }),
    issue({ type: "unsupported", severity: "minor", location: "intro-1", excerpt: "Eddington, who led the expedition, rejoiced.", correction: "" }),
  ]);
  assert.deepEqual(issues.map((i) => i.applied), [true, true]);
  assert.equal(out.sections[0].paragraphs[1], "The astrographic plates were blurred. The team blamed the Sun’s heat on the mirror.");
  assert.equal(out.sections[1].paragraphs[0], "Clouds covered the sky.");
  assert.equal(issues[1].location, "s2-1");
});

test("an excerpt that isn't in the article leaves the issue unapplied", () => {
  const { issues } = applyCorrections(article, [issue({ excerpt: "Einstein attended the eclipse in person", correction: "x" })]);
  assert.equal(issues[0].applied, false);
});

test("a revised paragraph replaces the whole paragraph, so corrections leave no seams", () => {
  const revised = "A wholly rewritten paragraph.";
  const { article: out, issues } = applyCorrections(article, [issue({ location: "s1-1", excerpt: article.sections[0].paragraphs[0].slice(0, 20), correction: "x", revised_paragraph: revised })]);
  assert.equal(issues[0].applied, true);
  assert.equal(out.sections[0].paragraphs[0], revised);
});
