// Split retrieved sources into passages and keep the most relevant ones (BM25), so the
// evidence model reads a few thousand tokens instead of whole pages.

import { config } from "./config";
import { topicTokens } from "./text";
import type { Passage, SourceRecord } from "./types";

const MIN_CHARS = 300;
const MAX_CHARS = 1400;

/** Paragraph-sized chunks with char offsets into the source text. */
export function segment(source: SourceRecord): Omit<Passage, "id" | "score">[] {
  const text = source.text ?? "";
  const blocks: { start: number; end: number }[] = [];
  const re = /[^\n]+(?:\n(?!\n)[^\n]+)*/g; // runs of non-blank lines
  for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
    if (m[0].startsWith("## ")) continue; // headings carry little evidence on their own
    blocks.push({ start: m.index, end: m.index + m[0].length });
  }

  const out: { start: number; end: number }[] = [];
  let cur: { start: number; end: number } | null = null;
  for (const b of blocks) {
    if (b.end - b.start > MAX_CHARS) {
      if (cur) out.push(cur), (cur = null);
      // Split long blocks at sentence ends.
      let s = b.start;
      while (b.end - s > MAX_CHARS) {
        const window = text.slice(s, s + MAX_CHARS);
        const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
        const end = cut > MIN_CHARS ? s + cut + 1 : s + MAX_CHARS;
        out.push({ start: s, end });
        s = end + 1;
      }
      out.push({ start: s, end: b.end });
      continue;
    }
    if (!cur) cur = { ...b };
    else if (cur.end - cur.start < MIN_CHARS && b.end - cur.start <= MAX_CHARS) cur.end = b.end;
    else out.push(cur), (cur = { ...b });
  }
  if (cur) out.push(cur);

  return out
    .map((r) => ({ source_id: source.id, start: r.start, end: r.end, text: text.slice(r.start, r.end).trim() }))
    .filter((p) => p.text.length >= 80);
}

/** BM25 over all passages; keep the best, capped per source and in total size. */
export function selectPassages(sources: SourceRecord[], query: string): Passage[] {
  const all = sources.filter((s) => s.content_status === "retrieved" && s.text).flatMap(segment);
  if (all.length === 0) return [];
  const q = [...topicTokens(query)];
  const docs = all.map((p) => {
    const toks = [...topicTokens(p.text)];
    const tf = new Map<string, number>();
    // topicTokens returns a set; recount occurrences from the raw text for term frequency.
    const words = p.text.toLowerCase().normalize("NFKD").match(/[\p{L}\p{N}]+/gu) ?? [];
    for (const t of toks) tf.set(t, words.filter((w) => w.startsWith(t)).length || 1);
    return { tf, len: words.length };
  });
  const avgLen = docs.reduce((n, d) => n + d.len, 0) / docs.length;
  const df = new Map<string, number>();
  for (const t of q) df.set(t, docs.filter((d) => d.tf.has(t)).length);
  const k1 = 1.4;
  const b = 0.75;
  const scored = all.map((p, i) => {
    const d = docs[i];
    let score = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (docs.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgLen));
    }
    return { ...p, score };
  });

  const perSource = new Map<string, number>();
  const counters = new Map<string, number>();
  const picked: Passage[] = [];
  let chars = 0;
  for (const p of scored.filter((x) => x.score > 0).sort((a, c) => c.score - a.score)) {
    const n = perSource.get(p.source_id) ?? 0;
    if (n >= config.research.maxPassagesPerSource) continue;
    if (chars + p.text.length > config.research.maxPassageChars) continue;
    perSource.set(p.source_id, n + 1);
    chars += p.text.length;
    const k = (counters.get(p.source_id) ?? 0) + 1;
    counters.set(p.source_id, k);
    picked.push({ ...p, id: `${p.source_id}.P${k}`, score: Math.round(p.score * 100) / 100 });
  }
  // Present passages in source order so the extractor reads them in context.
  return picked.sort((a, c) => (a.source_id === c.source_id ? a.start - c.start : Number(a.source_id.slice(1)) - Number(c.source_id.slice(1))));
}
