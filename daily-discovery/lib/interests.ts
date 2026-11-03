import type { Interest } from "./types";

/** Used only if the `interests` table is empty. Mirrors the seed in supabase/schema.sql. */
export const DEFAULT_INTERESTS: Interest[] = [
  ["History", "Ancient civilizations", 8],
  ["History", "Military history", 7],
  ["History", "Japanese history (especially Tokugawa and Meiji periods)", 7],
  ["History", "Chinese and broader Asian history", 7],
  ["History", "Medieval Europe", 6],
  ["History", "Unusual, obscure, and forgotten historical events", 6],
  ["History", "Archaeology", 5],
  ["History", "Political and cultural transformations", 4],
  ["Science & Nature", "Physics", 4],
  ["Science & Nature", "Astronomy", 4],
  ["Science & Nature", "Biology", 3],
  ["Science & Nature", "Evolution", 3],
  ["Science & Nature", "Neuroscience", 3],
  ["Science & Nature", "Natural phenomena", 3],
  ["Technology & Engineering", "How machines work", 4],
  ["Technology & Engineering", "Historical inventions", 3],
  ["Technology & Engineering", "Mechanical engineering", 3],
  ["Technology & Engineering", "Scientific discoveries", 3],
  ["Technology & Engineering", "Unusual technologies", 2],
  ["Art & Material Culture", "Architecture", 3],
  ["Art & Material Culture", "Art history", 3],
  ["Art & Material Culture", "Horology", 3],
  ["Art & Material Culture", "Gemology", 3],
  ["Art & Material Culture", "Traditional craftsmanship", 3],
].map(([category, subcategory, weight]) => ({
  category: category as string,
  subcategory: subcategory as string,
  weight: weight as number,
}));

export interface CategoryPlan {
  category: string;
  /** Subcategories candidates may come from, with weights. Excludes the most recent subcategory. */
  subcategories: Interest[];
  /** Why this category was chosen — logged for transparency. */
  reason: string;
}

/**
 * Choose today's top-level category.
 *
 * Base probability is each category's share of total weight (History ≈ 50%). To keep the
 * realized mix close to target over time, each weight is nudged by how under- or
 * over-represented the category has been in the recent window. The most recent discovery's
 * subcategory is always excluded, and a non-History category is not repeated back-to-back.
 */
export function planCategory(
  interests: Interest[],
  recent: { category: string | null; subcategory: string | null }[],
  random: () => number = Math.random,
): CategoryPlan {
  const last = recent[0];
  const byCategory = new Map<string, Interest[]>();
  for (const i of interests) {
    if (i.weight <= 0) continue;
    if (last && i.subcategory === last.subcategory) continue;
    byCategory.set(i.category, [...(byCategory.get(i.category) ?? []), i]);
  }

  const totalWeight = interests.reduce((n, i) => n + Math.max(0, i.weight), 0);
  const window = recent.slice(0, 20);
  const weights: { category: string; weight: number; target: number; actual: number }[] = [];
  for (const [category, subs] of byCategory) {
    const target = interests.filter((i) => i.category === category).reduce((n, i) => n + i.weight, 0) / totalWeight;
    const actual = window.length ? window.filter((r) => r.category === category).length / window.length : target;
    // Under-represented categories get up to 2x, over-represented down to 0.5x.
    const correction = Math.min(2, Math.max(0.5, 1 + (target - actual) * 3));
    let weight = target * correction;
    if (last && last.category === category && category !== "History") weight = 0;
    if (subs.length) weights.push({ category, weight, target, actual });
  }

  const sum = weights.reduce((n, w) => n + w.weight, 0);
  let roll = random() * sum;
  let chosen = weights[weights.length - 1];
  for (const w of weights) {
    roll -= w.weight;
    if (roll <= 0) {
      chosen = w;
      break;
    }
  }
  if (!chosen) throw new Error("Interest profile is empty: add rows to the interests table.");

  return {
    category: chosen.category,
    subcategories: byCategory.get(chosen.category) ?? [],
    reason:
      `target share ${(chosen.target * 100).toFixed(0)}%, recent share ${(chosen.actual * 100).toFixed(0)}%` +
      (last?.subcategory ? `; excluded last subcategory "${last.subcategory}"` : ""),
  };
}
