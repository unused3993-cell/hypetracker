// End-to-end pipeline test against a MOCK Anthropic API and a MOCK Supabase (PostgREST),
// with fixture web pages. It exercises the real code paths — retrieval, passage selection,
// budget checks, writing, editorial review and corrections, saving, approval — but
// the model outputs are scripted, so it says nothing about real model quality or real costs.

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { ECLIPSE_QUERY, fixtureFetch } from "./fixtures";

type Row = Record<string, unknown> & { id: string };
const rows: Row[] = [];
const anthropicCalls: { system: string; body: Record<string, unknown> }[] = [];
let server: http.Server;

const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: null, iterations: null });

let reviewerMode: "correctable" | "unresolved" = "correctable";

function reply(system: string, prompt: string): unknown {
  if (system.includes("topic editor")) {
    return { candidates: [{ topic: ECLIPSE_QUERY.topic, subcategory: "Astronomy", content_type: "story", angle: ECLIPSE_QUERY.angle, why_interesting: "x", likely_sources: "x", search_terms: ECLIPSE_QUERY.searchTerms, relevance: 5, substance: 5, curiosity: 5, source_availability: 5, novelty: 5 }] };
  }
  if (system.includes("You write for Daily Discovery")) {
    const para = (n: number) => `${Array.from({ length: n }, (_, i) => `word${i}`).join(" ")}.`;
    return {
      title: prompt.includes("Hyades") && !prompt.includes("tested Einstein") ? "A Star Cluster in the Right Place" : "The Eclipse That Tested Einstein",
      subtitle: "Two expeditions photographed stars beside the darkened Sun in 1919.",
      introduction: [`At Sobral the small telescope measured a deflection of 1.75 arcseconds. ${para(200)}`],
      sections: [
        { heading: "Two expeditions", paragraphs: [para(300)], source_ids: ["S1", "S2"] },
        { heading: "Plates and doubts", paragraphs: [para(300)], source_ids: ["S3", "S99"] },
        { heading: "Later checks", paragraphs: [para(250)], source_ids: [] },
      ],
      related_topics: ["Gravitational lensing", "Mercury's perihelion", "The Hyades"],
      uncertainties: ["Whether setting aside the astrographic plates was justified."],
    };
  }
  if (system.includes("research editor")) {
    return {
      issues:
        reviewerMode === "correctable"
          ? [{ type: "factual_error", severity: "substantive", location: "intro-1", excerpt: "measured a deflection of 1.75 arcseconds", correction: "measured a deflection of about 1.98 arcseconds", explanation: "The observatory page gives 1.98.", source_ids: ["S2"] }]
          : [{ type: "factual_error", severity: "substantive", location: "s2-1", excerpt: "a sentence the article never contained", correction: "x", explanation: "y", source_ids: [] }],
      source_assessment: "Adequate institutional and journalistic sources.",
      summary: reviewerMode === "correctable" ? "One figure was wrong." : "One unresolved error.",
    };
  }
  throw new Error("unexpected system prompt");
}

async function readBody(req: http.IncomingMessage) {
  let raw = "";
  for await (const c of req) raw += c;
  return raw ? JSON.parse(raw) : null;
}

before(async () => {
  server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    const u = new URL(req.url!, "http://x");
    res.setHeader("content-type", "application/json");
    if (u.pathname.startsWith("/v1/messages") && body.stream) {
      // Streamed web search fallback: shaped like the SDK's documented event stream.
      anthropicCalls.push({ system: String(body.system), body });
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const results = [
        { type: "web_search_result", url: "https://www.example-observatory.org/history/1919-eclipse", title: "Observatory history", encrypted_content: "opaque", page_age: null },
        { type: "web_search_result", url: "https://physicsmag.example.com/articles/eclipse-bias", title: "Magazine", encrypted_content: "opaque", page_age: null },
        { type: "web_search_result", url: "https://unfetchable.example.org/page", title: "Unreachable", encrypted_content: "opaque", page_age: null },
      ];
      send("message_start", { type: "message_start", message: { id: "msg_s", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: usage(10, 1) } });
      send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} } });
      send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ query: "1919 eclipse" }) } });
      send("content_block_stop", { type: "content_block_stop", index: 0 });
      send("content_block_start", { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: results } });
      send("content_block_stop", { type: "content_block_stop", index: 1 });
      send("content_block_start", { type: "content_block_start", index: 2, content_block: { type: "text", text: "", citations: [] } });
      send("content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "https://physicsmag.example.com/articles/eclipse-bias — established magazine" } });
      send("content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "citations_delta", citation: { type: "web_search_result_location", url: results[1].url, title: "Magazine", cited_text: "Earman and Glymour argued that the 1919 evidence was weaker", encrypted_index: "x" } } });
      send("content_block_stop", { type: "content_block_stop", index: 2 });
      send("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { ...usage(24000, 300), server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } } });
      send("message_stop", { type: "message_stop" });
      return res.end();
    }
    if (u.pathname.startsWith("/v1/messages")) {
      const system = String(body.system);
      anthropicCalls.push({ system, body });
      const text = JSON.stringify(reply(system, body.messages[0].content));
      return res.end(JSON.stringify({ id: "msg_x", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, stop_details: null, usage: usage(Math.ceil(JSON.stringify(body).length / 4), Math.ceil(text.length / 4)) }));
    }
    if (u.pathname === "/rest/v1/interests") return res.end("[]");
    if (u.pathname === "/rest/v1/discoveries") {
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      const id = u.searchParams.get("id")?.replace("eq.", "");
      if (req.method === "POST") {
        const row: Row = { id: `row-${rows.length + 1}`, created_at: new Date().toISOString(), sources: [], related_topics: [], generation_log: [], ...body };
        rows.unshift(row);
        return res.writeHead(201).end(JSON.stringify(single ? { id: row.id } : [{ id: row.id }]));
      }
      if (req.method === "PATCH") {
        const allowed = u.searchParams.get("generation_status")?.match(/^in\.\((.*)\)$/)?.[1].split(",").map((s) => s.replace(/"/g, ""));
        const row = rows.find((r) => r.id === id);
        if (row && (!allowed || allowed.includes(String(row.generation_status)))) {
          Object.assign(row, body);
          return res.end(JSON.stringify(single ? row : [row]));
        }
        return single ? res.writeHead(406).end(JSON.stringify({ code: "PGRST116", message: "0 rows" })) : res.end("[]");
      }
      let out = rows;
      if (id) out = rows.filter((r) => r.id === id);
      const neq = u.searchParams.get("generation_status")?.replace("neq.", "");
      if (neq) out = out.filter((r) => r.generation_status !== neq);
      return res.end(JSON.stringify(single ? (out[0] ?? null) : out));
    }
    res.writeHead(404).end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, { ANTHROPIC_API_KEY: "test", ANTHROPIC_BASE_URL: base, SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: "test" });
  process.env.NO_PROXY = `127.0.0.1,localhost,${process.env.NO_PROXY ?? ""}`;
  process.env.no_proxy = process.env.NO_PROXY;
  const { setFetchForTests } = await import("./retrieval");
  setFetchForTests(fixtureFetch());
});

after(() => server.close());

const stageOf = (c: { system: string; body: Record<string, unknown> }) =>
  c.body.stream ? "search" : c.system.includes("topic editor") ? "topics" : c.system.includes("You write") ? "write" : "review";

test("full pipeline: topic → research → write → editorial review with correction → verified, never published", async () => {
  const { config } = await import("./config");
  config.research.minMaterialChars = 2000; // fixture pages are short
  const { generateDiscovery } = await import("./pipeline");
  const result = await generateDiscovery();
  const row = rows.find((r) => r.id === result.id)!;
  assert.equal(result.status, "verified", String(row.error));
  assert.equal(row.published_at, null, "verified articles are not published until approved");

  // Fixture pages are short, so the web search fallback runs to top up full-text sources.
  assert.deepEqual(anthropicCalls.map(stageOf), ["topics", "search", "write", "edit", "rewrite", "review"]);
  assert.deepEqual(anthropicCalls.map((c) => c.body.model), ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-sonnet-5-5", "claude-sonnet-5-5"]);

  // The writer and reviewer read actual source text, not extracted claims.
  const writerPrompt = JSON.stringify(anthropicCalls[2].body);
  assert.ok(writerPrompt.includes("the smaller four-inch telescope gave a deflection of about 1.98 arcseconds"));
  assert.ok(JSON.stringify(anthropicCalls[3].body).includes("four-inch telescope gave a deflection"));

  // The reviewer's correction was applied to the stored article.
  const content = row.content as import("./types").ArticleContent;
  assert.match(content.introduction[0], /measured a deflection of about 1\.98 arcseconds/);
  const v = row.validation as import("./types").ValidationReport;
  assert.equal(v.review!.passed, true);
  assert.equal(v.review!.issues[0].applied, true);
  assert.deepEqual(v.research_notes, ["Whether setting aside the astrographic plates was justified."]);

  // Attribution: unknown IDs dropped; every source the writer read is credited.
  assert.deepEqual(content.sections[1].source_ids, ["S3"]);
  const pack = row.evidence as import("./types").ResearchPack;
  const read = new Set(pack.passages.map((p) => p.source_id));
  assert.deepEqual(new Set((row.sources as { id: string }[]).map((s) => s.id)), read);
  assert.ok(pack.sources.some((s) => s.content_status === "retrieved" && s.text!.includes("four-inch telescope")));

  const u = row.usage as import("./types").UsageReport;
  assert.deepEqual(u.stages.map((s) => s.stage), ["topics", "search", "write", "edit", "rewrite", "review"]);
  assert.ok(u.total_cost_usd > 0 && u.total_cost_usd < u.budget_max_usd);
  for (const s of u.stages) assert.ok(s.max_estimate_usd >= s.cost_usd, `${s.stage}: worst case should bound actual`);
});

test("an unresolved substantive issue means needs_review, and approval is refused", async () => {
  const { generateDiscovery } = await import("./pipeline");
  const { POST } = await import("../app/api/discoveries/[id]/review/route");
  reviewerMode = "unresolved";
  try {
    const result = await generateDiscovery(undefined, { topicOverride: { ...ECLIPSE_QUERY, topic: "Why the Hyades made the 1919 test possible" } });
    assert.equal(result.status, "needs_review");
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ action: "approve" }) }), { params: Promise.resolve({ id: result.id }) });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /passed editorial review/);
  } finally {
    reviewerMode = "correctable";
  }
});

test("review: verified articles can be approved (publishing them) or rejected", async () => {
  const { POST } = await import("../app/api/discoveries/[id]/review/route");
  const verified = rows.find((r) => r.generation_status === "verified")!;
  const call = (id: string, action: string) => POST(new Request("http://x", { method: "POST", body: JSON.stringify({ action, note: "checked" }) }), { params: Promise.resolve({ id }) });
  assert.equal((await call(verified.id, "approve")).status, 200);
  assert.equal(verified.generation_status, "approved");
  assert.ok(verified.published_at);
  const nr = rows.find((r) => r.generation_status === "needs_review")!;
  assert.equal((await call(nr.id, "reject")).status, 200);
  assert.equal(nr.generation_status, "rejected");
});

test("budget: a cap too small to write AND review stops before writing", async () => {
  const { config } = await import("./config");
  const { generateDiscovery } = await import("./pipeline");
  const saved = config.budget.maxUsd;
  config.budget.maxUsd = 0.15;
  anthropicCalls.length = 0;
  try {
    const result = await generateDiscovery(undefined, { topicOverride: { ...ECLIPSE_QUERY, topic: "How eclipse plates were measured" } });
    const row = rows.find((r) => r.id === result.id)!;
    assert.equal(result.status, "failed");
    assert.match(String(row.error), /budget/);
    assert.ok(!anthropicCalls.some((c) => stageOf(c) === "write"), "no article written without money to review it");
  } finally {
    config.budget.maxUsd = saved;
  }
});

test("web search fallback: keeps cited excerpts on pages already held and records unreachable results", async () => {
  const { gatherResearch } = await import("./pipeline");
  const { CostTracker } = await import("./cost");
  const tracker = new CostTracker(0.35, 0.25);
  const pack = (await gatherResearch(ECLIPSE_QUERY, tracker, () => {}, { forceWebSearch: true }))!;
  const unreachable = pack.sources.find((s) => s.url.includes("unfetchable"))!;
  assert.equal(unreachable.content_status, "fetch_failed");
  assert.deepEqual(pack.sources.find((s) => s.url.includes("physicsmag"))!.excerpts, ["Earman and Glymour argued that the 1919 evidence was weaker"]);
  const stage = tracker.report("").stages.find((s) => s.stage === "search")!;
  assert.equal(stage.web_searches, 1);
});
