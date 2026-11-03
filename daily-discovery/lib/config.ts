function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

export const config = {
  model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicKey: () => required("ANTHROPIC_API_KEY"),
  /** How many shortlisted topics to try researching before giving up on a run. */
  maxTopicAttempts: 3,
  /** Similarity (0..1, token Jaccard) at or above which two topics count as duplicates. */
  duplicateThreshold: 0.5,
};
