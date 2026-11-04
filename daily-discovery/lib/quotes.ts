// Mechanical check that a quoted passage really appears in stored source text, tolerant of
// harmless differences: case, whitespace, curly vs straight quotes, dash styles, soft
// hyphens, and "..." elisions. Returns the match's offsets in the ORIGINAL text.

const MAP: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "`": "'",
  "“": '"', "”": '"', "„": '"', "″": '"', "«": '"', "»": '"',
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
  " ": " ", " ": " ", " ": " ",
};
const DROP = /[­​-‍﻿]/;

/** Normalised text plus, for each normalised char, its index in the original. */
export function normalizeWithMap(input: string): { norm: string; map: number[] } {
  const src = input.normalize("NFKC");
  let norm = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < src.length; i++) {
    let ch = src[i];
    if (DROP.test(ch)) continue;
    if (ch === "…") ch = "..."; // ellipsis character
    ch = MAP[ch] ?? ch;
    if (/\s/.test(ch)) {
      pendingSpace = norm.length > 0;
      continue;
    }
    if (pendingSpace) {
      norm += " ";
      map.push(i);
      pendingSpace = false;
    }
    for (const c of ch.toLowerCase()) {
      norm += c;
      map.push(i);
    }
  }
  return { norm, map };
}

export function normalize(s: string): string {
  return normalizeWithMap(s).norm;
}

export interface QuoteMatch {
  start: number;
  end: number;
}

/**
 * Find `quote` in `text`. An elision ("...", "…", "[...]") splits the quote into fragments
 * that must appear in order within a short distance. Fragments shorter than 3 words are
 * rejected so a quote can't "verify" by matching common words.
 */
export function findQuote(text: string, quote: string, minChars = 25): QuoteMatch | null {
  const parts = normalize(quote)
    .replace(/^["'\s.,;:]+|["'\s,;:]+$/g, "")
    .split(/\s*(?:\[\s*\.\.\.\s*\]|\.\.\.)\s*/)
    .map((p) => p.replace(/^["'\s,;:.]+|["'\s,;:.]+$/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return null;
  const total = parts.reduce((n, p) => n + p.length, 0);
  if (total < minChars) return null;
  if (parts.some((p) => p.split(" ").length < 3)) return null;

  const { norm, map } = normalizeWithMap(text);
  let from = 0;
  let first = -1;
  let last = -1;
  for (let i = 0; i < parts.length; i++) {
    const at = norm.indexOf(parts[i], from);
    if (at < 0) return null;
    if (i > 0 && at - from > 600) return null; // elided gap too large to be one passage
    if (first < 0) first = at;
    last = at + parts[i].length;
    from = last;
  }
  return { start: map[first], end: map[last - 1] + 1 };
}
