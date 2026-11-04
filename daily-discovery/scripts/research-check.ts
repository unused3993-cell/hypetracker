// Phase 1 live check: research the 1919 eclipse topic against the REAL APIs (Wikipedia,
// OpenAlex, publisher sites, and — with --force-search — Anthropic web search) and report
// what was actually retrieved, which quotes verified, and what it cost. No database needed.
//
//   npm run research-check                 free sources (+ search only if they fall short)
//   npm run research-check -- --force-search   also exercise Anthropic web search
//
// Writes the full ledger (with stored source text) to runs/.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

async function main() {
  const { config } = await import("../lib/config");
  const { CostTracker } = await import("../lib/cost");
  const { researchTopic } = await import("../lib/research");
  const { ECLIPSE_QUERY } = await import("../lib/fixtures");
  const retrieval = await import("../lib/retrieval");

  const forceWebSearch = process.argv.includes("--force-search");
  const tracker = new CostTracker(config.budget.maxUsd, config.budget.targetUsd);
  console.log(`Researching: ${ECLIPSE_QUERY.topic}${forceWebSearch ? " (web search forced)" : ""}\n`);

  const outcome = await researchTopic(ECLIPSE_QUERY, tracker, 0, { forceWebSearch });
  for (const l of outcome.log) console.log(`• ${l.message}`);

  const ledger = outcome.ledger;
  if (ledger) {
    console.log("\nSources:");
    for (const s of ledger.sources) {
      console.log(`  ${s.id} [${s.origin}] ${s.content_status}${s.detail ? ` (${s.detail})` : ""} — ${s.url}`);
      if (s.authority) console.log(`     authority: ${s.authority}, relevance: ${s.relevance} — ${s.credibility_note}`);
      if (s.text) console.log(`     text: ${s.text.length} chars — "${s.text.slice(0, 140).replace(/\s+/g, " ")}…"`);
      if (s.excerpts?.length) console.log(`     search excerpts (${s.excerpts.length}): "${s.excerpts[0].slice(0, 120)}…"`);
    }
    const quotes = ledger.claims.flatMap((c) => c.evidence);
    console.log(`\nClaims: ${ledger.claims.filter((c) => c.usable).length} usable / ${ledger.claims.length}; quotes verified ${quotes.filter((q) => q.verified).length}/${quotes.length}`);
    for (const c of ledger.claims.filter((x) => !x.usable).slice(0, 8)) console.log(`  excluded ${c.id}: ${c.statement} — ${c.exclusion_reason}`);
    console.log(`Conflicts: ${ledger.conflicts.length}`);
  }

  const raw = retrieval.lastSearchResponse();
  if (raw) {
    const types = raw.content.map((b) => b.type);
    const results = raw.content.flatMap((b) => (b.type === "web_search_tool_result" && Array.isArray(b.content) ? b.content : []));
    const citations = raw.content.flatMap((b) => (b.type === "text" ? (b.citations ?? []) : []));
    console.log(`\nWeb search response: blocks [${[...new Set(types)].join(", ")}], ${results.length} results, ${citations.length} citations with cited_text`);
    if (results[0]) console.log(`  first result keys: ${Object.keys(results[0]).join(", ")}`);
    if (citations[0]) console.log(`  first citation: ${JSON.stringify(citations[0]).slice(0, 240)}`);
  }

  const usage = tracker.report("");
  console.log("\nCost by stage:");
  for (const s of usage.stages) console.log(`  ${s.stage.padEnd(8)} ${s.model.padEnd(20)} in ${s.input_tokens} out ${s.output_tokens} searches ${s.web_searches} → $${s.cost_usd.toFixed(4)} (worst case $${s.max_estimate_usd.toFixed(4)})`);
  console.log(`  total $${usage.total_cost_usd.toFixed(4)}`);

  mkdirSync("runs", { recursive: true });
  const file = `runs/research-check-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ query: ECLIPSE_QUERY, outcome, usage, rawSearchResponse: raw }, null, 2));
  console.log(`\nSaved ${file}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
