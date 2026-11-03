// Unit tests for the deterministic parts of the pipeline (no network, no API keys).
//   npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_INTERESTS, planCategory } from "./interests";
import { assembleResearch } from "./research";
import { articleWordCount, countWords, readingTimeMinutes, topicSimilarity } from "./text";
import { validateDraft } from "./validate";
import type { DraftArticle } from "./writer";

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

function textBlock(text: string, citeUrl?: string): Anthropic.Beta.BetaContentBlock {
  return {
    type: "text",
    text,
    citations: citeUrl
      ? [{ type: "web_search_result_location", url: citeUrl, title: "t", cited_text: "x", encrypted_index: "" }]
      : null,
  } as Anthropic.Beta.BetaContentBlock;
}

const searchResults = {
  type: "web_search_tool_result",
  tool_use_id: "srv_1",
  content: [
    { type: "web_search_result", url: "https://www.britannica.com/event/Mongol-invasions-of-Japan", title: "Mongol invasions of Japan | Britannica", encrypted_content: "", page_age: null },
    { type: "web_search_result", url: "https://www.metmuseum.org/essays/kamakura", title: "Kamakura Period | The Met", encrypted_content: "", page_age: null },
    { type: "web_search_result", url: "https://news.example.edu/takashima-wreck", title: "Takashima wreck study", encrypted_content: "", page_age: null },
    { type: "web_search_result", url: "https://unused.example.org/", title: "Not used", encrypted_content: "", page_age: null },
  ],
} as unknown as Anthropic.Beta.BetaContentBlock;

test("assembleResearch maps URLs to source IDs and drops URLs that were never retrieved", () => {
  const r = assembleResearch([
    searchResults,
    textBlock("## Core facts\n- Kublai Khan sent fleets in 1274 and 1281.", "https://www.britannica.com/event/Mongol-invasions-of-Japan"),
    textBlock("\n- Kamakura shogunate built a coastal wall (https://www.metmuseum.org/essays/kamakura).\n- Ships were poorly built (https://news.example.edu/takashima-wreck).\n- Fake claim (https://invented.example.com/page).\n## Disputed or uncertain\n- Fleet size estimates vary widely (https://www.britannica.com/event/Mongol-invasions-of-Japan).\n\nVERDICT: SUFFICIENT"),
  ]);
  assert.equal(r.sufficient, true, r.reason);
  assert.deepEqual(r.sources.map((s) => s.id), ["S1", "S2", "S3"]);
  assert.ok(!r.dossier.includes("invented.example.com"));
  assert.ok(r.dossier.includes("[source not retrieved — do not use]"));
  assert.match(r.reason, /1 URL/);
  assert.equal(r.disputedPoints.length, 1);
  assert.match(r.disputedPoints[0], /\[S1\]/);
});

test("assembleResearch rejects a SUFFICIENT verdict backed by too few sources", () => {
  const r = assembleResearch([searchResults, textBlock("- One fact (https://www.metmuseum.org/essays/kamakura)\nVERDICT: SUFFICIENT")]);
  assert.equal(r.sufficient, false);
  assert.match(r.reason, /only 1 retrieved source/);
});

const sources = [
  { id: "S1", title: "A", url: "https://a.example.edu/1" },
  { id: "S2", title: "B", url: "https://b.example.org/2" },
  { id: "S3", title: "C", url: "https://c.example.museum/3" },
];
const para = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ") + ".";

function draft(overrides: Partial<DraftArticle> = {}): DraftArticle {
  return {
    title: "How the Kamikaze Typhoons Saved Kamakura Japan",
    subtitle: "Two failed Mongol invasions and what the wrecks reveal.",
    introduction: [para(120)],
    sections: [
      { heading: "The first fleet", paragraphs: [para(200)], source_ids: ["S1"] },
      { heading: "The second fleet", paragraphs: [para(200)], source_ids: ["S2", "S3"] },
      { heading: "What the wrecks show", paragraphs: [para(200)], source_ids: ["S3"] },
    ],
    related_topics: ["Kublai Khan", "Takashima shipwreck", "Kamakura shogunate"],
    ...overrides,
  };
}

test("validateDraft passes a well-formed draft", () => {
  const r = validateDraft(draft(), sources, ["Why the Bronze Age collapsed"], 0.5);
  assert.deepEqual(r.issues, []);
  assert.equal(r.wordCount, 720);
  assert.equal(r.sources.length, 3);
  assert.equal(articleWordCount(r.content), 720);
});

test("validateDraft flags missing sources, invented IDs, length, structure, and duplicates", () => {
  const r = validateDraft(
    draft({
      title: "How the Kamikaze Typhoons Saved Japan",
      subtitle: "",
      sections: [{ heading: "", paragraphs: [para(100)], source_ids: ["S9"] }],
    }),
    sources,
    ["The Kamikaze typhoons that saved Japan"],
    0.5,
  );
  const codes = r.issues.map((i) => i.code).sort();
  for (const c of ["missing_subtitle", "too_few_sections", "missing_heading", "unknown_source_ids", "missing_sources", "word_count", "duplicate_topic"])
    assert.ok(codes.includes(c), `expected ${c} in ${codes.join(",")}`);
});

test("demo articles pass the pipeline's structural validation", async () => {
  const { DEMO_ARTICLES } = await import("../demo/content");
  const { demoDiscoveries } = await import("../demo");
  for (const a of DEMO_ARTICLES) {
    const r = validateDraft({ ...a.content, title: a.title, subtitle: a.subtitle, related_topics: a.related_topics }, a.sources, [], 0.5);
    assert.deepEqual(r.issues.filter((i) => i.code !== "contains_quotations"), [], a.slug);
  }
  const ds = demoDiscoveries(new Date("2026-11-03T12:00:00Z"));
  assert.equal(new Set(ds.map((d) => d.id)).size, ds.length);
  assert.ok(ds.every((d) => !/'/.test(JSON.stringify(d.content))), "demo copy uses typographer's quotes");
  for (let i = 1; i < ds.length; i++) {
    assert.notEqual(ds[i].subcategory, ds[i - 1].subcategory);
    if (ds[i - 1].category !== "History") assert.notEqual(ds[i].category, ds[i - 1].category);
  }
});
