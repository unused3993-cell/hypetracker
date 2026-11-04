function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const effort = (name: string, fallback: Effort): Effort => {
  const v = process.env[name] as Effort | undefined;
  return v && ["low", "medium", "high", "xhigh", "max"].includes(v) ? v : fallback;
};

/**
 * Per-stage model settings. Every model, effort and output cap is overridable from the
 * environment so writing quality and cost can be compared (e.g. MODEL_WRITE=claude-sonnet-5-5).
 * maxTokens caps output (thinking included) and drives the pre-call budget check.
 */
export const stages = {
  topics: { model: process.env.MODEL_TOPICS || "claude-sonnet-5-5", effort: effort("EFFORT_TOPICS", "low"), maxTokens: num("MAX_TOKENS_TOPICS", 3000) },
  search: { model: process.env.MODEL_SEARCH || "claude-haiku-5-5", effort: effort("EFFORT_SEARCH", "low"), maxTokens: num("MAX_TOKENS_SEARCH", 1500) },
  write: { model: process.env.MODEL_WRITE || "claude-sonnet-5-5", effort: effort("EFFORT_WRITE", "medium"), maxTokens: num("MAX_TOKENS_WRITE", 10000) },
  review: { model: process.env.MODEL_REVIEW || "claude-sonnet-5-5", effort: effort("EFFORT_REVIEW", "medium"), maxTokens: num("MAX_TOKENS_REVIEW", 6000) },
} as const;

export type StageName = keyof typeof stages;

/**
 * USD per million tokens. Source: Anthropic API documentation as cached 2026-10-06 — not
 * measured. Check against the Console's billing page after the first real runs.
 * Haiku 5.5's price applies to prompts up to 100K tokens; this pipeline stays well under.
 */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
/** Used for any model missing from the table, so unknown models are never under-counted. */
export const UNKNOWN_MODEL_PRICE = PRICES["claude-fable-5-1"];
export const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches; web fetch is not metered

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
export const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export const config = {
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicKey: () => required("ANTHROPIC_API_KEY"),

  budget: {
    /** What a typical completed article should cost. Reported, not enforced. */
    targetUsd: num("BUDGET_TARGET_USD", 0.25),
    /** Hard ceiling for one generation, including failed topic attempts and revisions. */
    maxUsd: num("BUDGET_MAX_USD", 0.35),
  },

  research: {
    /** Aim for about this many substantive full-text sources; web search tops up when free sources fall short. */
    targetSources: num("TARGET_SOURCES", 5),
    /** Anthropic web search tool version for the fallback. Confirmed live: Haiku 5.5 accepts web_search_20250305. */
    searchTool: (process.env.SEARCH_TOOL || "web_search_20250305") as "web_search_20250305" | "web_search_20260209",
    maxSearches: num("MAX_WEB_SEARCHES", 3),
    maxReferencePages: num("MAX_REFERENCE_PAGES", 10),
    maxSearchPages: num("MAX_SEARCH_PAGES", 8),
    fetchTimeoutMs: 12000,
    /** Readable text kept per source. */
    maxSourceChars: 60000,
    /** Research material given to the writer and reviewer (~14K tokens). */
    maxPassageChars: num("MAX_RESEARCH_CHARS", 48000),
    maxPassagesPerSource: 10,
    /** Below this much selected material (or fewer than 3 sources), a topic is rejected. */
    minMaterialChars: num("MIN_RESEARCH_CHARS", 8000),
    /** Identifies the crawler to site owners. Set CRAWLER_CONTACT to a URL or address you control. */
    userAgent: `DailyDiscoveryBot/0.3 (+${process.env.CRAWLER_CONTACT || "research crawler for an editorial app"})`,
    openAlexMailto: process.env.OPENALEX_MAILTO || "",
  },

  /** How many shortlisted topics to research before giving up on a run. */
  maxTopicAttempts: 2,
  /** Similarity (0..1, token Jaccard) at or above which two topics count as duplicates. */
  duplicateThreshold: 0.5,
};
