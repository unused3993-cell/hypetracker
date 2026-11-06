// Unit tests for the deterministic parts of the pipeline (no network, no API keys).
//   npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_INTERESTS, planCategory } from "./interests";
import { articleWordCount, countWords, readingTimeMinutes, topicSimilarity } from "./text";
import { validateDraft, type DraftShape } from "./validate";

test("countWords and reading time", () => {
  assert.equal(countWords("The Mongols' fleet—twice—met a typhoon in 1281."), 9);
  assert.equal(countWords("A well-known 19th-century clock"), 4);
  assert.equal(readingTimeMinutes(750), 3);
  assert.equal(readingTimeMinutes(10), 1);
});

test("topicSimilarity catches near-duplicate topics but not unrelated ones", () => {
  assert.ok(topicSimilarity("How the Mongols tried to invade Japan", "The Mongol invasions of Japan") >= 0.5);
  assert.ok(topicSimilarity("How the Antikythera mechanism worked", "Why gemstones change color") < 0.1);
});

test("planCategory keeps History near 50% and never repeats the previous subcategory", () => {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const recent: { category: string | null; subcategory: string | null }[] = [];
  let history = 0;
  for (let i = 0; i < 400; i++) {
    const plan = planCategory(DEFAULT_INTERESTS, recent, rand);
    assert.ok(!plan.subcategories.some((s) => s.subcategory === recent[0]?.subcategory));
    if (recent[0] && recent[0].category !== "History") assert.notEqual(plan.category, recent[0].category);
    const sub = plan.subcategories[Math.floor(rand() * plan.subcategories.length)];
    recent.unshift({ category: plan.category, subcategory: sub.subcategory });
    if (plan.category === "History") history++;
  }
  const share = history / 400;
  assert.ok(share > 0.4 && share < 0.6, `History share was ${share}`);
});

const para = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ") + ".";

function draft(overrides: Partial<DraftShape> = {}): DraftShape {
  return {
    title: "How the Kamikaze Typhoons Saved Kamakura Japan",
    subtitle: "Two failed Mongol invasions and what the wrecks reveal.",
    introduction: [para(120)],
    sections: [
      { heading: "The first fleet", paragraphs: [para(200)] },
      { heading: "The second fleet", paragraphs: [para(200)] },
      { heading: "What the wrecks show", paragraphs: [para(200)] },
    ],
    related_topics: ["Kublai Khan", "Takashima shipwreck", "Kamakura shogunate"],
    ...overrides,
  };
}

test("validateDraft passes a well-formed draft", () => {
  const r = validateDraft(draft(), ["Why the Bronze Age collapsed"], 0.5);
  assert.deepEqual(r.issues, []);
  assert.equal(r.wordCount, 720);
  assert.equal(articleWordCount(r.content), 720);
});

test("validateDraft allows flexible structure (unheaded sections included) but flags empty parts, length and duplicates", () => {
  assert.deepEqual(validateDraft(draft({ sections: [{ heading: "One long section", paragraphs: [para(600)] }] }), [], 0.5).issues, [], "a single section is fine");
  const r = validateDraft(
    draft({ title: "How the Kamikaze Typhoons Saved Japan", subtitle: "", sections: [{ heading: "", paragraphs: [para(100)] }] }),
    ["The Kamikaze typhoons that saved Japan"],
    0.5,
  );
  const codes = r.issues.map((i) => i.code).sort();
  for (const c of ["missing_subtitle", "word_count", "duplicate_topic"]) assert.ok(codes.includes(c), `expected ${c} in ${codes.join(",")}`);
});

test("demo articles pass the pipeline's structural validation", async () => {
  const { DEMO_ARTICLES } = await import("../demo/content");
  const { demoDiscoveries } = await import("../demo");
  for (const a of DEMO_ARTICLES) {
    const r = validateDraft({ ...a.content, title: a.title, subtitle: a.subtitle, related_topics: a.related_topics }, [], 0.5);
    assert.deepEqual(r.issues, [], a.slug);
  }
  const ds = demoDiscoveries(new Date("2026-11-03T12:00:00Z"));
  assert.equal(new Set(ds.map((d) => d.id)).size, ds.length);
  assert.ok(ds.every((d) => !/'/.test(JSON.stringify(d.content))), "demo copy uses typographer's quotes");
  for (let i = 1; i < ds.length; i++) {
    assert.notEqual(ds[i].subcategory, ds[i - 1].subcategory);
    if (ds[i - 1].category !== "History") assert.notEqual(ds[i].category, ds[i - 1].category);
  }
});
