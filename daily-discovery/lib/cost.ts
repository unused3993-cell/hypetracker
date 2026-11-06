// Budget enforcement and cost accounting for one generation.
//
// Before each model call: estimate the worst case (input estimated from prompt size, output at
// the call's max_tokens, plus any web searches) and refuse the call if it could push spending
// past the hard ceiling. A caller can also reserve money for later steps — writing reserves the
// cost of verification, so verification is never skipped to save money.
// After each call: price the usage the API actually reported.

import type Anthropic from "@anthropic-ai/sdk";
import { PRICES, UNKNOWN_MODEL_PRICE, WEB_SEARCH_USD } from "./config";
import type { StageUsage, UsageReport } from "./types";

const priceOf = (model: string) => PRICES[model] ?? UNKNOWN_MODEL_PRICE;

/** Conservative token estimate: ~3 chars per token (English runs ~3.5–4.5), plus fixed overhead. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 3) + 400;
}

export function worstCaseUsd(model: string, inputChars: number, maxTokens: number, searches = 0, searchResultTokens = 0): number {
  const p = priceOf(model);
  const input = estimateTokens(inputChars) + searchResultTokens;
  return (input * p.input + maxTokens * p.output) / 1e6 + searches * WEB_SEARCH_USD;
}

/** Worst case for a call whose `cachedChars` of input should already be in the prompt cache. */
export function worstCaseCachedUsd(model: string, inputChars: number, cachedChars: number, maxTokens: number): number {
  const p = priceOf(model);
  const cached = estimateTokens(cachedChars) - 400;
  const fresh = estimateTokens(inputChars - cachedChars);
  return (fresh * p.input + cached * p.cacheRead + maxTokens * p.output) / 1e6;
}

export class BudgetExceeded extends Error {
  constructor(
    public stage: string,
    public needed: number,
    public available: number,
  ) {
    super(`budget: ${stage} needs up to $${needed.toFixed(3)} but only $${available.toFixed(3)} remains under the cap`);
  }
}

type Usage = Anthropic.Beta.BetaUsage;

export class CostTracker {
  private stages = new Map<string, StageUsage>();
  /** model + context key for prompts already written to the cache in this generation. */
  readonly cached = new Set<string>();
  stoppedForBudget?: string;

  constructor(
    public readonly maxUsd: number,
    public readonly targetUsd: number,
  ) {}

  get spent(): number {
    let n = 0;
    for (const s of this.stages.values()) n += s.cost_usd;
    return n;
  }

  get remaining(): number {
    return this.maxUsd - this.spent;
  }

  canAfford(worstCase: number, reserve = 0): boolean {
    return this.spent + worstCase + reserve <= this.maxUsd + 1e-9;
  }

  /** Throws BudgetExceeded unless worstCase (+ reserve for later mandatory steps) fits. */
  authorize(stage: string, model: string, worstCase: number, reserve = 0) {
    if (!this.canAfford(worstCase, reserve)) {
      this.stoppedForBudget = `${stage}: worst case $${worstCase.toFixed(3)}${reserve ? ` + $${reserve.toFixed(3)} reserved for verification` : ""} exceeds the remaining $${this.remaining.toFixed(3)}`;
      throw new BudgetExceeded(stage, worstCase + reserve, this.remaining);
    }
    const s = this.stage(stage, model);
    s.max_estimate_usd += worstCase;
  }

  /** Price the usage the API reported. Uses per-iteration usage (with its model) when present. */
  record(stage: string, model: string, usage: Usage, servedModel?: string) {
    const s = this.stage(stage, model);
    s.calls += 1;
    const iterations = usage.iterations ?? [];
    const parts = iterations.length
      ? iterations
          .filter((it) => "input_tokens" in it && "output_tokens" in it)
          .map((it) => ({
            model: ("model" in it && it.model) || servedModel || model,
            input: it.input_tokens,
            output: it.output_tokens,
            cacheRead: ("cache_read_input_tokens" in it && it.cache_read_input_tokens) || 0,
            cacheWrite: ("cache_creation_input_tokens" in it && it.cache_creation_input_tokens) || 0,
          }))
      : [
          {
            model: servedModel || model,
            input: usage.input_tokens,
            output: usage.output_tokens,
            cacheRead: usage.cache_read_input_tokens ?? 0,
            cacheWrite: usage.cache_creation_input_tokens ?? 0,
          },
        ];
    for (const p of parts) {
      const price = priceOf(String(p.model));
      s.input_tokens += p.input;
      s.output_tokens += p.output;
      s.cache_read_tokens += p.cacheRead;
      s.cache_write_tokens += p.cacheWrite;
      s.cost_usd += (p.input * price.input + p.output * price.output + p.cacheRead * price.cacheRead + p.cacheWrite * price.cacheWrite) / 1e6;
      if (String(p.model) !== model) s.model = `${model} (+${p.model})`;
    }
    const searches = usage.server_tool_use?.web_search_requests ?? 0;
    s.web_searches += searches;
    s.cost_usd += searches * WEB_SEARCH_USD;
  }

  report(pricingNote: string): UsageReport {
    const stages = [...this.stages.values()].map((s) => ({ ...s, cost_usd: round(s.cost_usd), max_estimate_usd: round(s.max_estimate_usd) }));
    return {
      budget_target_usd: this.targetUsd,
      budget_max_usd: this.maxUsd,
      stages,
      total_cost_usd: round(this.spent),
      ...(this.stoppedForBudget ? { stopped_for_budget: this.stoppedForBudget } : {}),
      pricing_note: pricingNote,
    };
  }

  private stage(stage: string, model: string): StageUsage {
    let s = this.stages.get(stage);
    if (!s) {
      s = { stage, model, calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, web_searches: 0, max_estimate_usd: 0, cost_usd: 0 };
      this.stages.set(stage, s);
    }
    return s;
  }
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;
