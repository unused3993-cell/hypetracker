// End-to-end pipeline test against a MOCK Anthropic API and a MOCK Supabase (PostgREST),
// with fixture web pages. It exercises the real code paths — retrieval, passage selection,
// quote verification, budget checks, writing, verification, revision, saving, review — but
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

function reply(system: string, prompt: string): unknown {
  if (system.includes("topic editor")) {
    return { candidates: [{ topic: ECLIPSE_QUERY.topic, subcategory: "Astronomy", content_type: "story", angle: ECLIPSE_QUERY.angle, why_interesting: "x", likely_sources: "x", search_terms: ECLIPSE_QUERY.searchTerms, relevance: 5, substance: 5, curiosity: 5, source_availability: 5, novelty: 5 }] };
  }
  if (system.includes("evidence desk")) {
    // Take each passage's sentences verbatim as claims; add one claim with a doctored quote.
    const sources = [...prompt.matchAll(/<source id="(S\d+)" title="([^"]*)" url="([^"]*)" origin="(\w+)"/g)].map((m) => ({ id: m[1], origin: m[4], url: m[3] }));
    const authority = (o: string, url: string) => (o === "wikipedia" ? "reference" : o === "openalex" ? "scholarly" : url.includes("observatory") ? "institutional" : "journalism");
    const claims: unknown[] = [];
    for (const m of prompt.matchAll(/<passage id="(S\d+\.P\d+)">\n([\s\S]*?)\n<\/passage>/g)) {
      for (const sentence of m[2].split(/(?<=\.)\s+/).filter((s) => s.split(" ").length >= 8)) {
        claims.push({ id: `C${claims.length + 1}`, statement: sentence, stakes: /\d/.test(sentence) ? "precise_or_contested" : "routine", status: /argued/.test(sentence) ? "disputed" : "supported", note: /argued/.test(sentence) ? "Historians disagree about the plate selection." : "", evidence: [{ passage_id: m[1], quote: sentence }] });
      }
    }
    claims.push({ id: `C${claims.length + 1}`, statement: "Eddington personally developed the plates.", stakes: "routine", status: "supported", note: "", evidence: [{ passage_id: "S1.P1", quote: "Eddington personally developed every one of the photographic plates on the island" }] });
    return {
      sources: sources.map((s) => ({ source_id: s.id, authority: authority(s.origin, s.url), relevance: "high", note: "fixture" })),
      claims,
      conflicts: [{ summary: "Whether setting aside the astrographic plates was justified.", claim_ids: ["C1"], source_ids: ["S3"] }],
    };
  }
  if (system.includes("You write for Daily Discovery")) {
    const ids = [...prompt.matchAll(/^(C\d+)\. /gm)].map((m) => m[1]);
    const revising = prompt.includes("REVISION.");
    const para = (n: number, extra = "") => `${extra}${Array.from({ length: n }, (_, i) => `word${i}`).join(" ")}.`;
    return {
      title: "The Eclipse That Tested Einstein",
      subtitle: "Two expeditions photographed stars beside the darkened Sun in 1919.",
      introduction: [para(140, revising ? "" : "Eddington personally developed the plates. ")],
      sections: [
        { heading: "Two expeditions", paragraphs: [para(220)] },
        { heading: "Plates and doubts", paragraphs: [para(220)] },
        { heading: "Later checks", paragraphs: [para(150)] },
      ],
      related_topics: ["Gravitational lensing", "Mercury's perihelion", "The Hyades"],
      claim_map: [
        { location: "intro-1", anchor: "word0 word1 word2", claim_ids: ids.slice(0, 2) },
        { location: "s1-1", anchor: "word0 word1", claim_ids: ids.slice(2, 4) },
        { location: "s2-1", anchor: "word0 word1", claim_ids: ids.slice(4, 6) },
      ],
    };
  }
  if (system.includes("fact-checker")) {
    const ids = [...prompt.matchAll(/^(C\d+) \[/gm)].map((m) => m[1]);
    const doctored = prompt.includes("Eddington personally developed the plates.");
    return {
      assertions: [
        { location: "s1-1", assertion: "Dyson organised two expeditions.", claim_ids: [ids[0]], verdict: "supported", note: "" },
        { location: "s2-1", assertion: "The four-inch telescope gave 1.98 arcseconds.", claim_ids: [ids[1]], verdict: "supported", note: "" },
        ...(doctored ? [{ location: "intro-1", assertion: "Eddington personally developed the plates.", claim_ids: [], verdict: "unsupported", note: "No quotation says this." }] : []),
      ],
      summary: doctored ? "One unsupported statement." : "All statements supported.",
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

test("full pipeline: evidence ledger → write → verify → revise → re-verify → verified, never published", async () => {
  const { generateDiscovery } = await import("./pipeline");
  const result = await generateDiscovery();
  const row = rows.find((r) => r.id === result.id)!;
  assert.equal(result.status, "verified", String(row.error));
  assert.equal(row.published_at, null, "verified articles are not published until approved");

  const stagesCalled = anthropicCalls.map((c) => (c.system.includes("topic editor") ? "topics" : c.system.includes("evidence desk") ? "extract" : c.system.includes("You write") ? "write" : "verify"));
  assert.deepEqual(stagesCalled, ["topics", "extract", "write", "verify", "write", "verify"], "revision is followed by a full re-verification");

  // Models per stage, and the fallback parameter only where supported.
  const models = anthropicCalls.map((c) => c.body.model);
  assert.deepEqual(models, ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
  assert.equal(anthropicCalls[1].body.fallbacks, undefined, "Haiku gets no server-side fallback");
  assert.equal(anthropicCalls[2].body.fallbacks, "default");

  // Evidence: retrieved text kept, quotes verified with locations, doctored quote excluded.
  const ledger = row.evidence as import("./types").EvidenceLedger;
  assert.ok(ledger.sources.some((s) => s.origin === "wikipedia_reference" && s.content_status === "retrieved" && s.text!.includes("four-inch telescope")));
  const fake = ledger.claims.find((c) => c.statement.startsWith("Eddington personally"))!;
  assert.equal(fake.usable, false);
  assert.match(fake.exclusion_reason!, /no supporting quote/);
  const good = ledger.claims.filter((c) => c.usable);
  assert.ok(good.length >= 10);
  for (const c of good) for (const e of c.evidence.filter((x) => x.verified)) {
    const src = ledger.sources.find((s) => s.id === e.source_id)!;
    assert.ok(src.text!.slice(e.location!.start, e.location!.end).length >= 25);
  }

  // The writer never saw excluded claims; the verifier saw quotes.
  assert.ok(!String(anthropicCalls[2].body.messages && JSON.stringify(anthropicCalls[2].body)).includes("Eddington personally developed every one"));
  assert.ok(JSON.stringify(anthropicCalls[3].body).includes("four-inch telescope gave a deflection"));

  // Verification history and cost report are stored.
  const v = row.validation as import("./types").ValidationReport;
  assert.equal(v.verification!.length, 2);
  assert.equal(v.verification![0].passed, false);
  assert.equal(v.verification![1].passed, true);
  assert.equal(v.revisions, 1);
  const u = row.usage as import("./types").UsageReport;
  assert.deepEqual(u.stages.map((s) => s.stage), ["topics", "extract", "write", "verify", "revise", "reverify"]);
  assert.ok(u.total_cost_usd > 0 && u.total_cost_usd < u.budget_max_usd);
  for (const s of u.stages) assert.ok(s.max_estimate_usd >= s.cost_usd, `${s.stage}: worst case should bound actual`);
});

test("review: only verified articles can be approved; approval publishes", async () => {
  const { POST } = await import("../app/api/discoveries/[id]/review/route");
  const verified = rows.find((r) => r.generation_status === "verified")!;
  rows.unshift({ id: "row-nr", generation_status: "needs_review", created_at: new Date().toISOString() });
  const call = (id: string, action: string) => POST(new Request("http://x", { method: "POST", body: JSON.stringify({ action, note: "checked" }) }), { params: Promise.resolve({ id }) });

  const denied = await call("row-nr", "approve");
  assert.equal(denied.status, 409);
  assert.match((await denied.json()).error, /passed factual verification/);

  const ok = await call(verified.id, "approve");
  assert.equal(ok.status, 200);
  assert.equal(verified.generation_status, "approved");
  assert.ok(verified.published_at);

  assert.equal((await call("row-nr", "reject")).status, 200);
  assert.equal(rows.find((r) => r.id === "row-nr")!.generation_status, "rejected");
});

test("budget: a cap too small for writing + verification stops before writing, never skipping verification", async () => {
  const { config } = await import("./config");
  const { generateDiscovery } = await import("./pipeline");
  const saved = config.budget.maxUsd;
  config.budget.maxUsd = 0.12;
  anthropicCalls.length = 0;
  try {
    const result = await generateDiscovery(undefined, { topicOverride: { ...ECLIPSE_QUERY, topic: "Why the Hyades made the 1919 test possible" } });
    const row = rows.find((r) => r.id === result.id)!;
    assert.equal(result.status, "failed");
    assert.match(String(row.error), /budget/);
    assert.ok(!anthropicCalls.some((c) => c.system.includes("You write")), "no article written without money to verify it");
    assert.ok((row.usage as { stopped_for_budget?: string }).stopped_for_budget);
  } finally {
    config.budget.maxUsd = saved;
  }
});

test("web search fallback: keeps result URLs and cited excerpts, fetches pages itself, bills searches", async () => {
  const { researchTopic } = await import("./research");
  const { CostTracker } = await import("./cost");
  anthropicCalls.length = 0;
  const tracker = new CostTracker(0.35, 0.25);
  const out = await researchTopic(ECLIPSE_QUERY, tracker, 0, { forceWebSearch: true });
  const search = anthropicCalls.find((c) => c.body.stream)!;
  assert.equal(search.body.model, "claude-haiku-5-5");
  assert.deepEqual(search.body.tools, [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }]);
  assert.equal(out.usedWebSearch, true);
  // Both found pages were already retrieved via Wikipedia's references, so they are deduplicated;
  // the unreachable result is recorded as a failed fetch, not as evidence.
  const sources = out.ledger!.sources;
  const unreachable = sources.find((s) => s.url.includes("unfetchable"))!;
  assert.equal(unreachable.origin, "web_search");
  assert.equal(unreachable.content_status, "fetch_failed");
  const magazine = sources.find((s) => s.url.includes("physicsmag"))!;
  assert.deepEqual(magazine.excerpts, ["Earman and Glymour argued that the 1919 evidence was weaker"], "search excerpt kept on the already-retrieved page");
  const stage = tracker.report("").stages.find((s) => s.stage === "search")!;
  assert.equal(stage.web_searches, 1);
  assert.ok(Math.abs(stage.cost_usd - (24000 * 0.1 + 300 * 0.5) / 1e6 - 0.01) < 1e-6);
});
