import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { config } from "./config";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicKey(), maxRetries: 3 });
  return client;
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Shared request settings. Server-side fallback ("default") lets the API re-run a request on
 * Anthropic's recommended substitute model if a safety classifier declines it — mostly a
 * safety net for military-history topics.
 */
export function baseParams(effort: Effort) {
  return {
    model: config.model,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
    thinking: { type: "adaptive" as const },
    output_config: { effort },
  };
}

export function assertNotRefused(message: Anthropic.Beta.BetaMessage, step: string) {
  if (message.stop_reason === "refusal") {
    const d = message.stop_details;
    throw new Error(`${step}: the model declined the request${d?.category ? ` (category: ${d.category})` : ""}.`);
  }
}

/** One structured-output call: returns the schema-validated object or throws a descriptive error. */
export async function structured<S extends z.ZodType>(opts: {
  step: string;
  schema: S;
  system: string;
  prompt: string;
  effort: Effort;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const base = baseParams(opts.effort);
  const response = await anthropic().beta.messages.parse({
    ...base,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    output_config: { ...base.output_config, format: betaZodOutputFormat(opts.schema) },
  });
  assertNotRefused(response, opts.step);
  if (response.stop_reason === "max_tokens") {
    throw new Error(`${opts.step}: response was cut off at max_tokens before the output was complete.`);
  }
  if (!response.parsed_output) {
    throw new Error(`${opts.step}: the model's output did not match the expected structure.`);
  }
  return response.parsed_output as z.infer<S>;
}

/** Turn SDK errors into messages that say what to do about them. */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic API key is invalid (401). Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.PermissionDeniedError)
    return `Anthropic API permission denied (403): ${err.message}. Web search/fetch may need enabling in the Console.`;
  if (err instanceof Anthropic.RateLimitError) return "Anthropic API rate limit hit (429). Wait a minute and retry.";
  if (err instanceof Anthropic.BadRequestError) return `Anthropic API rejected the request (400): ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
