// Live end-to-end test without a database: topic → research → write → editorial review.
// Saves a readable report (article, corrections, sources, cost) and the full JSON in runs/.
//
//   npm run article -- --eclipse                      the 1919 eclipse test topic
//   npm run article -- --topic "..." --angle "..." --terms "Wikipedia title|other query" [--type explanation]
//   npm run article                                   a topic chosen from the default interest profile
//   npm run article -- --eclipse --writer claude-opus-5-5   compare writer models
//   npm run article -- --eclipse --rewriter claude-opus-5-5 rewrite with Opus
//   npm run article -- --eclipse --force-search       also use web search even if free sources suffice

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const { config, stages } = await import("../lib/config");
  const { CostTracker } = await import("../lib/cost");
  const { gatherResearch, produceArticle, attribution, PRICING_NOTE } = await import("../lib/pipeline");
  const { DEFAULT_INTERESTS, planCategory } = await import("../lib/interests");
  const { generateCandidates } = await import("../lib/topics");
  const { ECLIPSE_QUERY } = await import("../lib/fixtures");
  const { validateDraft } = await import("../lib/validate");

  const tracker = new CostTracker(config.budget.maxUsd, config.budget.targetUsd);
  const note = (m: string) => console.log(`• ${m}`);
  const writer = arg("--writer") ? { ...stages.write, model: arg("--writer")! } : stages.write;
  const rewriter = arg("--rewriter") ? { ...stages.rewrite, model: arg("--rewriter")! } : stages.rewrite;

  let query = ECLIPSE_QUERY;
  let contentType: "story" | "explanation" = arg("--type") === "explanation" ? "explanation" : "story";
  const topic = arg("--topic");
  if (topic) {
    // The first search term should be the likely title of the main English Wikipedia article.
    query = { topic, angle: arg("--angle") ?? topic, searchTerms: (arg("--terms") ?? topic).split("|").map((t) => t.trim()).filter(Boolean) };
  } else if (!process.argv.includes("--eclipse")) {
    const plan = planCategory(DEFAULT_INTERESTS, []);
    const [best] = await generateCandidates(plan, [], [], tracker);
    query = { topic: best.topic, angle: best.angle, searchTerms: best.search_terms };
    contentType = best.content_type;
  }
  console.log(`Topic: ${query.topic}\nWriter: ${writer.model} · editor: ${stages.edit.model} · rewriter: ${rewriter.model} · fact-check: ${stages.review.model} · cap $${config.budget.maxUsd}\n`);

  const pack = await gatherResearch(query, tracker, note, { forceWebSearch: process.argv.includes("--force-search") });
  if (!pack) throw new Error(`Research was not sufficient. Cost so far $${tracker.spent.toFixed(4)}.`);
  const { draft, critique, rewrite, article, review } = await produceArticle({ query, contentType, pack, tracker, note, writer, rewriter });
  const { articleText } = await import("../lib/writer");
  const { content, sources } = attribution(article, pack);
  const words = validateDraft(article, [], 1).wordCount;
  const usage = tracker.report(PRICING_NOTE);
  const status = review.passed ? "would be VERIFIED (eligible for approval)" : "would be NEEDS REVIEW (unresolved substantive issues)";

  const md = [
    `# ${article.title}`,
    `*${article.subtitle}*`,
    ...content.introduction,
    ...content.sections.flatMap((s) => [s.heading ? `## ${s.heading}` : "* * *", ...s.paragraphs, s.source_ids.length ? `<sub>Sources: ${s.source_ids.join(", ")}</sub>` : ""]),
    article.uncertainties.length ? `**Where the evidence is uncertain**\n\n${article.uncertainties.map((u) => `- ${u}`).join("\n")}` : "",
    `**Related:** ${article.related_topics.join("; ")}`,
    `---`,
    `## Report`,
    `${words} words · writer ${writer.model} · ${status}`,
    `Plan: ${article.plan}`,
    critique ? `### Editor's critique of the draft\n\n**Spine:** ${critique.spine}\n\n${critique.findings.map((f) => `- **${f.checklist_item}** “${f.quote}” → ${f.fix}`).join("\n")}\n\n**Revision plan:** ${critique.revision_plan}` : "_No edit pass (budget)._",
    `### Sources given to the writer`,
    sources.map((s) => `- **${s.id}** [${s.title}](${s.url})`).join("\n"),
    `### Retrieval`,
    pack.sources.map((s) => `- ${s.id} ${s.origin} · ${s.content_status}${s.detail ? ` (${s.detail})` : ""}${s.text ? ` · ${s.text.length} chars` : ""} — ${s.url}`).join("\n"),
    `### Editorial review`,
    `${review.summary}\n\nSources: ${review.source_assessment}`,
    review.issues.length
      ? review.issues
          .map((i) => `- **${i.severity} ${i.type}** at ${i.location} — ${i.applied ? "corrected" : "NOT APPLIED"}\n  - was: “${i.excerpt}”\n  - now: “${i.revised_paragraph ?? i.correction}”\n  - why: ${i.explanation} (${i.source_ids.join(", ")})`)
          .join("\n")
      : "No issues found.",
    `### First draft (before edit)\n\n${articleText(draft)}`,
    `### Cost`,
    `| Stage | Model | Input | Cached | Output | Searches | Cost |\n|---|---|---|---|---|---|---|\n` +
      usage.stages.map((s) => `| ${s.stage} | ${s.model} | ${s.input_tokens} | ${s.cache_read_tokens}/${s.cache_write_tokens} | ${s.output_tokens} | ${s.web_searches} | $${s.cost_usd.toFixed(4)} |`).join("\n") +
      `\n| **total** | | | | | | **$${usage.total_cost_usd.toFixed(4)}** |`,
  ]
    .filter(Boolean)
    .join("\n\n");

  mkdirSync("runs", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(`runs/article-${stamp}.md`, md);
  writeFileSync(`runs/article-${stamp}.json`, JSON.stringify({ query, writer: writer.model, rewriter: rewriter.model, pack, draft, critique, rewrite, article, review, usage }, null, 2));
  console.log(`\n${article.title} — ${words} words — ${status}`);
  console.log(`Review: ${review.issues.length} issue(s), ${review.issues.filter((i) => i.applied).length} corrected`);
  for (const s of usage.stages) console.log(`  ${s.stage.padEnd(7)} ${s.model.padEnd(18)} in ${s.input_tokens} cached ${s.cache_read_tokens} out ${s.output_tokens} → $${s.cost_usd.toFixed(4)}`);
  console.log(`  total $${usage.total_cost_usd.toFixed(4)}\n\nSaved runs/article-${stamp}.md (open with: open -e runs/article-${stamp}.md)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
