export type ContentType = "story" | "explanation";
export type GenerationStatus = "generating" | "ready" | "needs_review" | "failed";

export interface Interest {
  category: string;
  subcategory: string;
  weight: number;
}

export interface ArticleSection {
  heading: string;
  paragraphs: string[];
  source_ids: string[];
}

export interface ArticleContent {
  introduction: string[];
  sections: ArticleSection[];
}

export type LinkStatus = "ok" | "unverified" | "broken";

export interface Source {
  id: string; // "S1", "S2", ... — stable within one discovery
  title: string;
  url: string;
  link_status?: LinkStatus;
  link_detail?: string;
}

export interface ClaimFlag {
  claim: string;
  verdict: "unsupported" | "partially_supported" | "contradicted" | "uncertainty_not_acknowledged";
  note: string;
}

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  claim_review: { flags: ClaimFlag[]; summary: string } | null;
  research_notes: string[]; // disputed points / uncertainty surfaced during research
  research_dossier?: string; // full research notes the article was written from
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
  generation_log: LogEntry[];
  generation_status: GenerationStatus;
  error: string | null;
  created_at: string;
  published_at: string | null;
  /** Optional lead image. The Phase 1 pipeline doesn't produce images yet; demo content does. */
  image?: DiscoveryImage | null;
}
