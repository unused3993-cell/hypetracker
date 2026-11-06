import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { config, FALLBACK_MODELS } from "./config";
import { worstCaseCachedUsd, worstCaseUsd, type CostTracker } from "./cost";

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
export async function structured<S extends z.ZodType, F extends string | undefined = undefined>(opts: {
  stage: string;
  settings: ModelSettings;
  schema: S;
  /** With a combined schema (lib/schemas.ts): the one field this stage fills, which is returned. */
  field?: F;
  system: string;
  /**
   * Long material shared by several stages (style guide + research). Sent first in the system
   * prompt with a cache breakpoint, so later calls to the same model read it from cache.
   */
  context?: string;
  prompt: string;
  tracker: CostTracker;
  reserveUsd?: number;
}): Promise<F extends keyof z.infer<S> ? NonNullable<z.infer<S>[F]> : z.infer<S>> {
  const format = betaZodOutputFormat(opts.schema);
  const inputChars = (opts.context?.length ?? 0) + opts.system.length + opts.prompt.length + JSON.stringify(format).length;
  const cacheKey = opts.context ? `${opts.settings.model}:${opts.context.length}:${opts.context.slice(-200)}` : "";
  const worst =
    cacheKey && opts.tracker.cached.has(cacheKey)
      ? worstCaseCachedUsd(opts.settings.model, inputChars, opts.context!.length, opts.settings.maxTokens)
      : worstCaseUsd(opts.settings.model, inputChars, opts.settings.maxTokens);
  opts.tracker.authorize(opts.stage, opts.settings.model, worst, opts.reserveUsd ?? 0);

  const base = baseParams(opts.settings);
  const response = await anthropic().beta.messages.parse({
    ...base,
    system: opts.context
      ? [
          { type: "text" as const, text: opts.context, cache_control: { type: "ephemeral" as const } },
          { type: "text" as const, text: opts.system },
        ]
      : opts.system,
    messages: [{ role: "user", content: opts.field ? `${opts.prompt}\n\nFill only the "${opts.field}" field of the output; set every other field to null.` : opts.prompt }],
    output_config: { ...base.output_config, format },
  });
  opts.tracker.record(opts.stage, opts.settings.model, response.usage, response.model);
  if (cacheKey) opts.tracker.cached.add(cacheKey);
  assertNotRefused(response, opts.stage);
  if (response.stop_reason === "max_tokens") {
    throw new Error(`${opts.stage}: output hit max_tokens (${opts.settings.maxTokens}) before finishing. Raise MAX_TOKENS_${opts.stage.toUpperCase()} or lower its effort.`);
  }
  if (!response.parsed_output) {
    throw new Error(`${opts.stage}: the model's output did not match the expected structure.`);
  }
  const out = response.parsed_output as Record<string, unknown>;
  if (opts.field) {
    if (out[opts.field] == null) throw new Error(`${opts.stage}: the model left the "${opts.field}" output empty.`);
    return out[opts.field] as never;
  }
  return out as never;
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
