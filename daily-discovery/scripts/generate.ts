// CLI: generate one discovery without the web UI. Result lands in the test bench for review.
//   npm run generate                       pick a topic from the interest profile
//   npm run generate -- --eclipse          use the 1919 eclipse test topic
//   npm run generate -- --topic "..." --angle "..." --terms "query one|query two"
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const { generateDiscovery } = await import("../lib/pipeline");
  const { ECLIPSE_QUERY } = await import("../lib/fixtures");

  let topicOverride;
  if (process.argv.includes("--eclipse")) topicOverride = ECLIPSE_QUERY;
  else if (arg("--topic")) {
    const topic = arg("--topic")!;
    topicOverride = { topic, angle: arg("--angle") ?? topic, searchTerms: (arg("--terms") ?? topic).split("|") };
  }

  const started = Date.now();
  const result = await generateDiscovery((e) => console.log(`[${e.step}] ${e.message}`), { topicOverride });
  const secs = Math.round((Date.now() - started) / 1000);

  console.log(`\n${result.status.toUpperCase()} in ${secs}s — cost $${result.costUsd.toFixed(4)} — id ${result.id}`);
  if (result.title) console.log(`Title: ${result.title}`);
  if (result.error) console.log(`Error: ${result.error}`);
  console.log(`Review it at http://localhost:3000/bench/${result.id}`);
  process.exit(result.status === "failed" ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
