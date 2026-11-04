// Compare writer models on the SAME evidence: write and verify the article with each model.
// Reports verification results and per-model cost, and saves each article as Markdown in
// runs/ for side-by-side reading, plus one JSON file with everything. No database needed.
//
//   npm run compare-writers -- --ledger runs/research-check-<time>.json   reuse a reviewed ledger (recommended)
//   npm run compare-writers                                               research afresh, then compare
//   npm run compare-writers -- --models claude-opus-5-5,claude-sonnet-5-5 --revise

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const { config, stages } = await import("../lib/config");
  const { CostTracker } = await import("../lib/cost");
  const { researchTopic } = await import("../lib/research");
  const { ECLIPSE_QUERY } = await import("../lib/fixtures");
  const { writeArticle } = await import("../lib/writer");
  const { verifyArticle, verifyWorstCase, revisionProblems } = await import("../lib/verify");
  const { validateDraft } = await import("../lib/validate");
  type Ledger = import("../lib/types").EvidenceLedger;
  type Round = import("../lib/types").VerificationRound;

  const models = (arg("--models") ?? "claude-opus-5-5,claude-sonnet-5-5").split(",");
  const revise = process.argv.includes("--revise");
  const ledgerFile = arg("--ledger");
  let query = ECLIPSE_QUERY;
  let ledger: Ledger;
  let researchCost: number;

  mkdirSync("runs", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (ledgerFile) {
    const saved = JSON.parse(readFileSync(ledgerFile, "utf8"));
    if (!saved.outcome?.ledger) throw new Error(`${ledgerFile} has no evidence ledger (did research-check reject the topic?).`);
    ledger = saved.outcome.ledger;
    query = saved.query ?? query;
    researchCost = saved.usage?.total_cost_usd ?? 0;
    console.log(`Using the evidence ledger from ${ledgerFile} (research cost $${researchCost.toFixed(4)})`);
    if (!ledger.sufficient) console.log(`Warning: that ledger was judged insufficient (${ledger.sufficiency_reason}); comparing anyway.`);
  } else {
    const researchTracker = new CostTracker(config.budget.maxUsd, config.budget.targetUsd);
    const research = await researchTopic(query, researchTracker, 0);
    for (const l of research.log) console.log(`• ${l.message}`);
    if (!research.ledger?.sufficient) throw new Error("Research did not produce sufficient evidence; nothing to compare.");
    ledger = research.ledger;
    researchCost = researchTracker.spent;
    console.log(`Research cost (shared): $${researchCost.toFixed(4)}`);
  }
  console.log(`${ledger.claims.filter((c) => c.usable).length} usable claims from ${ledger.sources.filter((s) => s.content_status === "retrieved").length} retrieved sources\n`);

  const results = [];
  const rows: string[] = [];
  for (const model of models) {
    console.log(`Writing with ${model}…`);
    const tracker = new CostTracker(config.budget.maxUsd - researchCost, config.budget.targetUsd);
    const settings = { ...stages.write, model };
    const rounds: Round[] = [];
    let error: string | undefined;
    let firstDraft = null;
    let draft = null;
    try {
      draft = firstDraft = await writeArticle({ topic: query.topic, angle: query.angle, contentType: "story", ledger, tracker, reserveUsd: verifyWorstCase(ledger), settings });
      rounds.push(await verifyArticle({ article: draft, ledger, round: 1, tracker }));
      if (revise && !rounds[0].passed) {
        draft = await writeArticle({ topic: query.topic, angle: query.angle, contentType: "story", ledger, tracker, reserveUsd: verifyWorstCase(ledger), settings, revision: { previous: draft, problems: revisionProblems(rounds[0]) } });
        rounds.push(await verifyArticle({ article: draft, ledger, round: 2, tracker }));
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.log(`  stopped: ${error}`);
    }
    const usage = tracker.report("Priced from API-reported token usage with lib/config.ts prices.");
    const cost = (prefix: string) => usage.stages.filter((s) => s.stage.startsWith(prefix)).reduce((n, s) => n + s.cost_usd, 0);
    const words = draft ? validateDraft(draft, [], 1).wordCount : 0;
    results.push({ model, error, first_draft: firstDraft, final_draft: draft, rounds, usage, words, article_total_usd: usage.total_cost_usd + researchCost });

    const supported = (r: Round) => `${r.assertions.filter((a) => a.verdict === "supported").length}/${r.assertions.length}`;
    rows.push(
      `${model.padEnd(20)} ${String(words).padStart(5)} words  ` +
        rounds.map((r) => `round ${r.round}: ${r.passed ? "PASS" : "fail"} ${supported(r)}`).join(", ") +
        `  write $${(cost("write") + cost("revise")).toFixed(4)}  verify $${(cost("verify") + cost("reverify")).toFixed(4)}  ` +
        `article total incl. research $${(usage.total_cost_usd + researchCost).toFixed(4)}${error ? `  (stopped: ${error})` : ""}`,
    );

    if (draft) {
      const md = [
        `# ${draft.title}`,
        `*${draft.subtitle}*`,
        ...draft.introduction,
        ...draft.sections.flatMap((s) => [`## ${s.heading}`, ...s.paragraphs]),
        `---`,
        `**Model:** ${model} · ${words} words · related: ${draft.related_topics.join("; ")}`,
        ...rounds.flatMap((r) => [
          `### Verification round ${r.round}: ${r.passed ? "passed" : "failed"} (${supported(r)} supported)`,
          r.summary,
          `| Where | Assertion | Verdict | Claims | Note |\n|---|---|---|---|---|\n` +
            r.assertions.map((a) => `| ${a.location} | ${a.assertion.replace(/\|/g, "/")} | ${a.verdict} | ${a.claim_ids.join(", ")} | ${a.note.replace(/\|/g, "/")} |`).join("\n"),
          ...(r.map_issues.length ? [`Claim-map issues:\n${r.map_issues.map((m) => `- ${m}`).join("\n")}`] : []),
        ]),
        `### Cost`,
        `| Stage | Model | Input tokens | Output tokens | Cost |\n|---|---|---|---|---|\n` +
          usage.stages.map((s) => `| ${s.stage} | ${s.model} | ${s.input_tokens} | ${s.output_tokens} | $${s.cost_usd.toFixed(4)} |`).join("\n") +
          `\n| research (shared) | | | | $${researchCost.toFixed(4)} |\n| **article total** | | | | **$${(usage.total_cost_usd + researchCost).toFixed(4)}** |`,
      ].join("\n\n");
      const file = `runs/compare-${stamp}-${model}.md`;
      writeFileSync(file, md);
      console.log(`  saved ${file}`);
    }
  }

  const jsonFile = `runs/compare-${stamp}.json`;
  writeFileSync(jsonFile, JSON.stringify({ query, ledger_from: ledgerFile ?? "fresh research", research_cost_usd: researchCost, ledger, results }, null, 2));
  console.log(`\n${rows.join("\n")}\n\nSaved ${jsonFile}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
