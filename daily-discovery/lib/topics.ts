import { z } from "zod";
import { structured } from "./claude";
import type { CategoryPlan } from "./interests";
import { mostSimilar } from "./text";

const CandidateSchema = z.object({
  topic: z.string().describe("A specific, self-contained subject statement, e.g. 'How the Antikythera mechanism modelled the Moon's irregular motion'"),
  subcategory: z.string().describe("Exactly one of the provided subcategories"),
  content_type: z.enum(["story", "explanation"]),
  angle: z.string().describe("What the reader will understand by the end — the substantive takeaway"),
  why_interesting: z.string(),
  likely_sources: z.string().describe("What kinds of credible sources should exist (museums, journals, primary texts...)"),
  relevance: z.number().int().describe("1-5: fit with the reader's interest profile"),
  substance: z.number().int().describe("1-5: potential to teach something substantive in ~750 words"),
  curiosity: z.number().int().describe("1-5: intrinsic surprise or curiosity"),
  source_availability: z.number().int().describe("1-5: confidence that credible sources exist online"),
  novelty: z.number().int().describe("1-5: distance from previously covered discoveries (5 = unrelated)"),
});

const CandidatePoolSchema = z.object({ candidates: z.array(CandidateSchema) });

export type Candidate = z.infer<typeof CandidateSchema> & { score: number; similarity: number; similar_to: string | null };

const SYSTEM = `You are the topic editor for Daily Discovery, an editorial app that teaches one genuinely interesting, well-sourced thing per day.
Content is either a STORY (historical events, people, civilizations, discoveries, unusual occurrences — narrative, context, significance) or an EXPLANATION (how something works or why it happens — mechanisms and causes).

Good topics are specific and can be explored meaningfully in 600-900 words, e.g. "How the Mongols attempted to invade Japan", "Why the Bronze Age civilizations collapsed", "How the Antikythera mechanism worked", "Why certain gemstones change color".
Reject generic survey topics ("The History of Ancient Rome"), trivia-sized facts, listicles, and subjects whose popular version is mostly myth unless the myth-vs-evidence gap IS the topic.
Favor subjects where credible sources (universities, museums, scientific bodies, primary sources, reputable publications) are likely to be available online.
Score honestly; a pool where everything scores 5 is useless.`;

export async function generateCandidates(
  plan: CategoryPlan,
  history: { title: string | null; topic: string | null }[],
  recent: { title: string | null; topic: string | null; subcategory: string | null }[],
): Promise<Candidate[]> {
  const subList = plan.subcategories.map((s) => `- ${s.subcategory} (weight ${s.weight})`).join("\n");
  const previous = history.map((h) => `- ${h.title ?? h.topic}`).filter(Boolean).slice(0, 150).join("\n") || "(none yet)";
  const lastFew = recent.slice(0, 3).map((r) => `- ${r.title ?? r.topic} [${r.subcategory}]`).join("\n") || "(none yet)";

  const prompt = `Category for today: ${plan.category}
Subcategories to draw from (spread candidates across them roughly by weight):
${subList}

The most recent discoveries — today's topic must NOT be closely related to these (no shared era+region, person, event, object, or mechanism):
${lastFew}

All previously published discoveries — avoid repeating or closely overlapping any of them:
${previous}

Propose 10 diverse candidate topics. Mix stories and explanations where the subcategory allows. Each must be specific enough for a short article.`;

  const pool = await structured({
    step: "topic selection",
    schema: CandidatePoolSchema,
    system: SYSTEM,
    prompt,
    effort: "medium",
  });

  const pastTopics = history.flatMap((h) => [h.title, h.topic]).filter((t): t is string => !!t);
  const allowed = plan.subcategories.map((s) => s.subcategory);
  const clamp = (n: number) => Math.min(5, Math.max(1, n));
  // The model occasionally paraphrases a subcategory name; snap it to the closest real one.
  const snap = (sub: string) => (allowed.includes(sub) ? sub : (mostSimilar(sub, allowed).match ?? allowed[0]));

  return pool.candidates
    .map((raw) => {
      const c = { ...raw, subcategory: snap(raw.subcategory) };
      const { score: similarity, match } = mostSimilar(c.topic, pastTopics);
      const score =
        clamp(c.relevance) * 1.0 +
        clamp(c.substance) * 1.5 +
        clamp(c.curiosity) * 1.5 +
        clamp(c.source_availability) * 1.5 +
        clamp(c.novelty) * 1.0 -
        similarity * 10; // heavy penalty for lexical overlap with past topics
      return { ...c, score, similarity, similar_to: match };
    })
    .sort((a, b) => b.score - a.score);
}
