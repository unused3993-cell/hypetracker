// Compare writer models on the SAME evidence: research once, then write and verify the
// article with each model. Reports verification results and per-model cost, and saves each
// article as Markdown in runs/ for side-by-side reading. No database needed.
//
//   npm run compare-writers                                    Opus 5.5 vs Sonnet 5.5, eclipse topic
//   npm run compare-writers -- --models claude-opus-5-5,claude-sonnet-5-5 --revise

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

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

  const models = (arg("--models") ?? "claude-opus-5-5,claude-sonnet-5-5").split(",");
  const revise = process.argv.includes("--revise");
  const query = ECLIPSE_QUERY;

  const researchTracker = new CostTracker(config.budget.maxUsd, config.budget.targetUsd);
  const research = await researchTopic(query, researchTracker, 0);
  for (const l of research.log) console.log(`• ${l.message}`);
  if (!research.ledger?.sufficient) throw new Error("Research did not produce sufficient evidence; nothing to compare.");
  const ledger = research.ledger;
  const researchCost = researchTracker.spent;
  console.log(`Research cost (shared): $${researchCost.toFixed(4)}\n`);

  mkdirSync("runs", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rows: string[] = [];
  for (const model of models) {
    const tracker = new CostTracker(config.budget.maxUsd - researchCost, config.budget.targetUsd);
    const settings = { ...stages.write, model };
    let draft = await writeArticle({ topic: query.topic, angle: query.angle, contentType: "story", ledger, tracker, reserveUsd: verifyWorstCase(ledger), settings });
    let round = await verifyArticle({ article: draft, ledger, round: 1, tracker });
    const first = round;
    if (revise && !round.passed) {
      draft = await writeArticle({ topic: query.topic, angle: query.angle, contentType: "story", ledger, tracker, reserveUsd: verifyWorstCase(ledger), settings, revision: { previous: draft, problems: revisionProblems(round) } });
      round = await verifyArticle({ article: draft, ledger, round: 2, tracker });
    }
    const words = validateDraft(draft, [], 1).wordCount;
    const bad = (r: typeof round) => r.assertions.filter((a) => a.verdict !== "supported");
    const usage = tracker.report("");
    const cost = (stage: string) => usage.stages.filter((s) => s.stage.startsWith(stage)).reduce((n, s) => n + s.cost_usd, 0);
    rows.push(
      `${model.padEnd(20)} ${String(words).padStart(5)} words  first draft ${first.assertions.length - bad(first).length}/${first.assertions.length} supported` +
        `${revise ? `, final ${round.assertions.length - bad(round).length}/${round.assertions.length}` : ""}  ` +
        `write $${(cost("write") + cost("revise")).toFixed(4)}  verify $${(cost("verify") + cost("reverify")).toFixed(4)}  total incl. research $${(usage.total_cost_usd + researchCost).toFixed(4)}`,
    );

    const md = [
      `# ${draft.title}`,
      `*${draft.subtitle}*`,
      "",
      ...draft.introduction,
      ...draft.sections.flatMap((s) => [`## ${s.heading}`, ...s.paragraphs]),
      "",
      "---",
      `Model: ${model} · ${words} words · verification ${round.passed ? "passed" : "failed"}`,
      ...bad(round).map((a) => `- ${a.verdict}: ${a.assertion} — ${a.note}`),
      "",
      "Cost:",
      ...usage.stages.map((s) => `- ${s.stage}: ${s.input_tokens} in / ${s.output_tokens} out → $${s.cost_usd.toFixed(4)}`),
    ].join("\n\n");
    const file = `runs/compare-${stamp}-${model}.md`;
    writeFileSync(file, md);
    console.log(`Saved ${file}`);
  }
  console.log(`\n${rows.join("\n")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
