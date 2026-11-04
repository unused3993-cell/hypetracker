import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { config, FALLBACK_MODELS } from "./config";
import { worstCaseUsd, type CostTracker } from "./cost";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicKey(), maxRetries: 2 });
  return client;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelSettings {
  model: string;
  effort: Effort;
  maxTokens: number;
}

/**
 * Shared request settings. Server-side refusal fallback ("default") is only sent to models
 * that accept it; Haiku has no server-side fallback.
 */
export function baseParams(s: ModelSettings) {
  const fallback = FALLBACK_MODELS.has(s.model);
  return {
    model: s.model,
    max_tokens: s.maxTokens,
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    thinking: { type: "adaptive" as const },
    output_config: { effort: s.effort },
  };
}

export function assertNotRefused(message: Anthropic.Beta.BetaMessage, step: string) {
  if (message.stop_reason === "refusal") {
    const d = message.stop_details;
    throw new Error(`${step}: the model declined the request${d?.category ? ` (category: ${d.category})` : ""}.`);
  }
}

/**
 * One structured-output call with a pre-call budget check and post-call cost accounting.
 * `reserveUsd` keeps money back for mandatory later steps (e.g. verification after writing).
 */
export async function structured<S extends z.ZodType>(opts: {
  stage: string;
  settings: ModelSettings;
  schema: S;
  system: string;
  prompt: string;
  tracker: CostTracker;
  reserveUsd?: number;
}): Promise<z.infer<S>> {
  const format = betaZodOutputFormat(opts.schema);
  const inputChars = opts.system.length + opts.prompt.length + JSON.stringify(format).length;
  const worst = worstCaseUsd(opts.settings.model, inputChars, opts.settings.maxTokens);
  opts.tracker.authorize(opts.stage, opts.settings.model, worst, opts.reserveUsd ?? 0);

  const base = baseParams(opts.settings);
  const response = await anthropic().beta.messages.parse({
    ...base,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    output_config: { ...base.output_config, format },
  });
  opts.tracker.record(opts.stage, opts.settings.model, response.usage, response.model);
  assertNotRefused(response, opts.stage);
  if (response.stop_reason === "max_tokens") {
    throw new Error(`${opts.stage}: output hit max_tokens (${opts.settings.maxTokens}) before finishing. Raise MAX_TOKENS_${opts.stage.toUpperCase()} or lower its effort.`);
  }
  if (!response.parsed_output) {
    throw new Error(`${opts.stage}: the model's output did not match the expected structure.`);
  }
  return response.parsed_output as z.infer<S>;
}

/** Turn SDK errors into messages that say what to do about them. */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic API key is invalid (401). Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.PermissionDeniedError)
    return `Anthropic API permission denied (403): ${err.message}. Web search may need enabling in the Console.`;
  if (err instanceof Anthropic.RateLimitError) return "Anthropic API rate limit hit (429). Wait a minute and retry.";
  if (err instanceof Anthropic.BadRequestError) return `Anthropic API rejected the request (400): ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
