// Minimal readable-text extraction from HTML. No dependencies; regex-based, so it is tuned for
// ordinary article pages and will do poorly on pages that render their text with JavaScript.

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", middot: "·", deg: "°",
  times: "×", minus: "−", prime: "′", Prime: "″", eacute: "é", egrave: "è", aacute: "á", oacute: "ó",
  iacute: "í", uacute: "ú", ouml: "ö", uuml: "ü", auml: "ä", ccedil: "ç", ntilde: "ñ", szlig: "ß",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? m;
  });
}

const clean = (s: string) =>
  decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/[­​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function extractReadableText(html: string): { title: string; text: string } {
  const title = clean(
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
      "",
  );

  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|form|button|select)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ")
    // Footnote markers ("[12]") and editorial superscripts are not part of the prose.
    .replace(/<sup\b[\s\S]*?<\/sup>/gi, "");

  const main = body.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i);
  if (main && clean(main[2]).length > 500) body = main[2];

  const blocks: string[] = [];
  const re = /<(h[1-4]|p|li|blockquote|dd|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(body)); ) {
    const tag = m[1].toLowerCase();
    const t = clean(m[2]);
    if (!t) continue;
    if (tag.startsWith("h")) {
      if (t.length <= 160) blocks.push(`## ${t}`);
    } else if (t.length >= 40) {
      blocks.push(t);
    }
  }
  // Drop runs of headings with no prose between them (menus, link lists).
  const text = blocks
    .filter((b, i) => !b.startsWith("## ") || (blocks[i + 1] && !blocks[i + 1].startsWith("## ")))
    .join("\n\n");
  return { title, text: text.normalize("NFKC") };
}
