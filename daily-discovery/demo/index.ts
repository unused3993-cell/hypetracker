// Demo mode: serves the hand-written sample discoveries in place of Supabase.
// Enabled with DEMO_MODE=1 (`npm run demo`). To remove demo mode entirely, delete this
// directory and the lines marked "demo" in lib/repository.ts and app/Figure.tsx.

import { articleWordCount, readingTimeMinutes } from "../lib/text";
import type { Discovery } from "../lib/types";
import { DEMO_ARTICLES } from "./content";

export function isDemoMode(): boolean {
  const v = process.env.DEMO_MODE?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Typographer's quotes for hand-typed demo copy. */
function smart(text: string): string {
  return text
    .replace(/(\w)'(\w)/g, "$1\u2019$2")
    .replace(/(^|[\s(\u2014])'/g, "$1\u2018")
    .replace(/'/g, "\u2019");
}

const smartContent = (a: (typeof DEMO_ARTICLES)[number]) => ({
  introduction: a.content.introduction.map(smart),
  sections: a.content.sections.map((s) => ({ ...s, heading: smart(s.heading), paragraphs: s.paragraphs.map(smart) })),
});

/** Demo discoveries, newest first: No. 005 is "today", No. 001 four days ago. */
export function demoDiscoveries(now = new Date()): Discovery[] {
  return DEMO_ARTICLES.map((a, i) => {
    const day = new Date(now);
    day.setHours(6, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const content = smartContent(a);
    const words = articleWordCount(content);
    return {
      id: `demo-${a.slug}`,
      title: smart(a.title),
      subtitle: smart(a.subtitle),
      category: a.category,
      subcategory: a.subcategory,
      content_type: a.content_type,
      topic: a.title,
      content,
      word_count: words,
      reading_time_minutes: readingTimeMinutes(words),
      sources: a.sources.map((s) => ({ ...s, link_status: "unverified" as const, link_detail: "demo content — not link-checked" })),
      related_topics: a.related_topics.map(smart),
      validation: {
        issues: [],
        research_notes: a.uncertain.map(smart),
        revisions: 0,
        disclaimer: "Demo content: written by hand for evaluating the design, not generated or checked by the pipeline.",
      },
      generation_log: [{ at: day.toISOString(), step: "demo", message: "Sample discovery bundled with demo mode; no generation took place." }],
      generation_status: "approved",
      error: null,
      created_at: day.toISOString(),
      published_at: day.toISOString(),
      image: { src: `plate:${a.plate}`, alt: a.plateAlt, caption: smart(a.plateCaption), credit: "Illustration for Daily Discovery (demo)" },
    };
  });
}
