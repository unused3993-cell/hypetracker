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
  /** Derived from the internal claim map; never written by the model directly. */
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

// ── Research & evidence ─────────────────────────────────────────────────────

export type SourceOrigin = "wikipedia" | "wikipedia_reference" | "openalex" | "web_search";

/** Whether we hold the source's own text. Only `retrieved` sources can back claims. */
export type ContentStatus = "retrieved" | "search_result_only" | "fetch_failed" | "skipped";

export type Authority = "primary" | "scholarly" | "institutional" | "reference" | "journalism" | "popular" | "unreliable";

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
  /** Excerpts the search API itself returned (citation cited_text). Not evidence-grade on their own. */
  excerpts?: string[];
  /** Filled in by evidence extraction. */
  authority?: Authority;
  relevance?: "high" | "medium" | "low";
  credibility_note?: string;
}

export interface Passage {
  id: string; // "S3.P2"
  source_id: string;
  start: number; // char offsets into SourceRecord.text
  end: number;
  text: string;
  score: number;
}

export type ClaimStakes = "routine" | "precise_or_contested";

export interface EvidenceQuote {
  passage_id: string;
  source_id: string;
  quote: string;
  /** Set by mechanical verification. */
  verified: boolean;
  /** Char offsets of the matched quote in the source's stored text. */
  location?: { start: number; end: number };
}

export interface Claim {
  id: string; // "C1"
  statement: string;
  stakes: ClaimStakes;
  status: "supported" | "disputed" | "uncertain";
  note?: string;
  evidence: EvidenceQuote[];
  /** Set by code: whether the writer may use this claim, and why not. */
  usable: boolean;
  exclusion_reason?: string;
}

export interface Conflict {
  summary: string;
  claim_ids: string[];
  source_ids: string[];
}

export interface EvidenceLedger {
  sources: SourceRecord[];
  passages: Passage[];
  claims: Claim[];
  conflicts: Conflict[];
  sufficient: boolean;
  sufficiency_reason: string;
}

// ── Verification ────────────────────────────────────────────────────────────

export type AssertionVerdict =
  | "supported"
  | "partially_supported"
  | "unsupported"
  | "contradicted"
  | "misleading_context"
  | "overstated"
  | "uncertainty_not_acknowledged";

export interface AssertionCheck {
  assertion: string;
  location: string; // e.g. "intro-1", "s2-3"
  claim_ids: string[];
  verdict: AssertionVerdict;
  note: string;
}

export interface VerificationRound {
  round: number; // 1 = first draft, 2 = after revision
  assertions: AssertionCheck[];
  summary: string;
  passed: boolean;
  /** Mechanical problems found in the claim map (unknown claim IDs, etc.). */
  map_issues: string[];
}

export interface ClaimMapEntry {
  location: string;
  anchor: string;
  claim_ids: string[];
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
  verification?: VerificationRound[];
  claim_map?: ClaimMapEntry[];
  revisions: number;
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
  evidence?: EvidenceLedger | null;
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
