export type ContentType = "story" | "explanation";

/**
 * Pipeline outcome, then editorial decision.
 * - verified: passed factual validation; eligible for approval (not yet published)
 * - needs_review: article exists but did not pass factual validation (or ran out of budget)
 * - approved / rejected: an editor's decision; only approved discoveries are published
 */
export type GenerationStatus = "generating" | "verified" | "needs_review" | "failed" | "approved" | "rejected";

export interface Interest {
  category: string;
  subcategory: string;
  weight: number;
}

export interface ArticleSection {
  heading: string;
  paragraphs: string[];
  /** Sources this section draws on (validated against the research pack). */
  source_ids: string[];
}

export interface ArticleContent {
  introduction: string[];
  sections: ArticleSection[];
}

export type LinkStatus = "ok" | "unverified" | "broken";

/** Public-facing source entry shown with an article. */
export interface Source {
  id: string; // "S1", "S2", ... — stable within one discovery
  title: string;
  url: string;
  link_status?: LinkStatus;
  link_detail?: string;
}

// ── Research ─────────────────────────────────────────────────────

export type SourceOrigin = "wikipedia" | "wikipedia_reference" | "openalex" | "web_search";

/** Whether we hold the source's own text. */
export type ContentStatus = "retrieved" | "search_result_only" | "fetch_failed" | "skipped";

export interface SourceRecord {
  id: string;
  url: string;
  title: string;
  origin: SourceOrigin;
  content_status: ContentStatus;
  /** Why content is missing, or the HTTP status of the fetch. */
  detail?: string;
  retrieved_at?: string;
  /** Extracted readable text (NFKC-normalised), capped. Present only when retrieved. */
  text?: string;
  /** Excerpts the search API itself returned (citation cited_text), when any. */
  excerpts?: string[];
}

export interface Passage {
  id: string; // "S3.P2"
  source_id: string;
  start: number; // char offsets into SourceRecord.text
  end: number;
  text: string;
  score: number;
}

/** What the writer and reviewer read: retrieved sources and the excerpts selected from them. */
export interface ResearchPack {
  sources: SourceRecord[];
  passages: Passage[];
}

// ── Editorial review ────────────────────────────────────────────────────────

export type ReviewIssueType = "factual_error" | "unsupported" | "misleading" | "omission";

export interface ReviewIssue {
  type: ReviewIssueType;
  /** substantive = would mislead a reader about something that matters; minor = imprecision or nuance. */
  severity: "substantive" | "minor";
  location: string; // "intro-1", "s2-3", "title", "subtitle"
  excerpt: string; // the problem text, copied from the article
  correction: string; // replacement text ("" = delete the excerpt); for omissions, text to append
  explanation: string; // what the sources say
  source_ids: string[];
  /** Set by code: whether the correction was applied to the article. */
  applied?: boolean;
}

export interface EditorialReview {
  issues: ReviewIssue[];
  source_assessment: string;
  summary: string;
  /** No substantive issue remains unresolved. */
  passed: boolean;
}

// ── Cost ────────────────────────────────────────────────────────────────────

export interface StageUsage {
  stage: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  web_searches: number;
  /** Worst case checked against the budget before the call(s). */
  max_estimate_usd: number;
  /** From token usage reported by the API, priced with the table in lib/config.ts. */
  cost_usd: number;
}

export interface UsageReport {
  budget_target_usd: number;
  budget_max_usd: number;
  stages: StageUsage[];
  total_cost_usd: number;
  stopped_for_budget?: string;
  pricing_note: string;
}

// ── Discovery record ───────────────────────────────────────────────────────

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  /** Disputed or uncertain points to surface to readers. */
  research_notes: string[];
  review?: EditorialReview;
  disclaimer: string;
}

export interface LogEntry {
  at: string;
  step: string;
  message: string;
  data?: unknown;
}

export interface DiscoveryImage {
  /** An image URL, or "plate:<name>" for an illustrated plate supplied by demo mode. */
  src: string;
  alt: string;
  caption?: string;
  credit?: string;
}

export interface Discovery {
  id: string;
  title: string | null;
  subtitle: string | null;
  category: string | null;
  subcategory: string | null;
  content_type: ContentType | null;
  topic: string | null;
  content: ArticleContent | null;
  word_count: number | null;
  reading_time_minutes: number | null;
  sources: Source[];
  related_topics: string[];
  validation: ValidationReport | null;
  /** Research pack: sources with retrieved text, and the excerpts given to the writer. */
  evidence?: ResearchPack | null;
  usage?: UsageReport | null;
  generation_log: LogEntry[];
  generation_status: GenerationStatus;
  error: string | null;
  review_note?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  published_at: string | null;
  /** Optional lead image. The pipeline doesn't produce images yet; demo content does. */
  image?: DiscoveryImage | null;
}
