import { listPublished, shelfOf } from "@/lib/repository";
import type { Discovery } from "@/lib/types";
import { Figure } from "../../components/Figure";
import { issueNo, shortDate } from "../../components/format";

export const dynamic = "force-dynamic";

const SHELVES = [
  { key: "all", label: "Everything" },
  { key: "history", label: "History" },
  { key: "science", label: "Science" },
  { key: "technology", label: "Technology" },
] as const;

export default async function Library({ searchParams }: { searchParams: Promise<{ shelf?: string }> }) {
  const { shelf = "all" } = await searchParams;
  let all: Discovery[] = [];
  let error: string | null = null;
  try {
    all = await listPublished();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const numbered = all.map((d, i) => ({ d, n: all.length - i }));
  const shown = shelf === "all" ? numbered : numbered.filter(({ d }) => shelfOf(d.category) === shelf);
  const count = (key: string) => (key === "all" ? all.length : all.filter((d) => shelfOf(d.category) === key).length);

  return (
    <div className="library">
      <header className="library-head">
        <p className="mono eyebrow">The Library</p>
        <h1 className="display">Everything so far</h1>
        <p className="dek">
          {all.length} discoveries, newest first. Stories from history, explanations from science, and the odd machine.
        </p>
      </header>

      <nav className="shelves mono" aria-label="Filter by subject">
        {SHELVES.map((s) => (
          <a key={s.key} href={s.key === "all" ? "/library" : `/library?shelf=${s.key}`} aria-current={shelf === s.key ? "page" : undefined}>
            {s.label} <span className="shelf-count">{count(s.key)}</span>
          </a>
        ))}
      </nav>

      {error && <p className="error">{error}</p>}
      {shown.length === 0 && !error && <p className="muted">Nothing on this shelf yet.</p>}

      <ol className="grid">
        {shown.map(({ d, n }, i) => (
          <li key={d.id} className={i === 0 && shelf === "all" ? "card-item feature" : "card-item"}>
            <a href={`/discoveries/${d.id}`}>
              {d.image && (
                <div className="thumb" role="img" aria-label={d.image.alt}>
                  <Figure image={d.image} id={`thumb-${d.id}`} />
                </div>
              )}
              <div className="card-text">
                <p className="mono card-meta">
                  <span>{issueNo(n)}</span>
                  <span>{shortDate(d.published_at)}</span>
                </p>
                <p className="kicker">{d.category}</p>
                <h2 className="card-title-display">{d.title}</h2>
                <p className="card-dek">{d.subtitle}</p>
                <p className="mono card-foot">
                  {d.content_type === "story" ? "Story" : "Explanation"} · {d.reading_time_minutes} min
                </p>
              </div>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
