import type { IssueContext } from "@/lib/repository";
import type { Discovery } from "@/lib/types";
import { Figure } from "./Figure";
import { accession, hostOf, issueNo, longDate, plateNo, shortDate } from "./format";

function NeighbourLink({ d, dir }: { d: Discovery | null; dir: "older" | "newer" }) {
  if (!d) return <span className={`issue-nav-${dir} disabled`} aria-hidden="true" />;
  return (
    <a className={`issue-nav-${dir}`} href={`/discoveries/${d.id}`} rel={dir === "older" ? "prev" : "next"}>
      <span className="mono">{dir === "older" ? "← Previous" : "Next →"}</span>
      <span className="issue-nav-title">{d.title}</span>
    </a>
  );
}

export function IssueView({ issue, label }: { issue: IssueContext; label: string }) {
  const { discovery: d, number } = issue;
  const content = d.content!;
  const notes = d.validation?.research_notes ?? [];
  const sourceIndex = new Map(d.sources.map((s, i) => [s.id, i + 1]));
  const [firstIntro, ...restIntro] = content.introduction;

  return (
    <article className="issue">
      <div className="issue-strip mono">
        <span>{label}</span>
        <span>
          {issueNo(number)} · {longDate(d.published_at)}
        </span>
      </div>

      <header className="hero">
        <div className="hero-text">
          <p className="kicker">
            <a href={`/library?shelf=${encodeURIComponent((d.category ?? "").split(" ")[0].toLowerCase())}`}>{d.category}</a>
            <span className="kicker-sep">/</span>
            <span>{d.subcategory}</span>
          </p>
          <h1 className="display">{d.title}</h1>
          <p className="dek">{d.subtitle}</p>
          <p className="meta mono">
            <span>{d.content_type === "story" ? "A story" : "An explanation"}</span>
            <span>{d.reading_time_minutes} min read</span>
            <span>{d.sources.length} sources</span>
          </p>
        </div>
        {d.image && (
          <figure className="plate">
            <div className="plate-frame" role="img" aria-label={d.image.alt}>
              <Figure image={d.image} id={`hero-${d.id}`} />
            </div>
            <figcaption>
              <span className="mono plate-label">
                {plateNo(number)} · {accession(d.published_at, number)}
              </span>
              <span>{d.image.caption}</span>
              {d.image.credit && <span className="credit">{d.image.credit}</span>}
            </figcaption>
          </figure>
        )}
      </header>

      <div className="body">
        <div className="lede">
          <p className="dropcap">{firstIntro}</p>
          {restIntro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {content.sections.map((s, i) => (
          <section key={i} className="section">
            <h2>
              <span className="section-no mono">{String(i + 1).padStart(2, "0")}</span>
              {s.heading}
            </h2>
            {s.paragraphs.map((p, j) => (
              <p key={j}>{p}</p>
            ))}
            {s.source_ids.length > 0 && (
              <p className="section-sources mono">
                Sources{" "}
                {s.source_ids.map((sid) => (
                  <a key={sid} href={`#src-${sid}`}>
                    [{sourceIndex.get(sid) ?? sid}]
                  </a>
                ))}
              </p>
            )}
          </section>
        ))}
      </div>

      <div className="apparatus">
        {notes.length > 0 && (
          <aside className="card notes">
            <h3 className="card-title mono">Cabinet note · Where the evidence is uncertain</h3>
            <ul>
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </aside>
        )}

        <section className="card provenance" id="sources">
          <h3 className="card-title mono">Provenance</h3>
          <ol>
            {d.sources.map((s, i) => (
              <li key={s.id} id={`src-${s.id}`}>
                <span className="prov-no mono">{String(i + 1).padStart(2, "0")}</span>
                <span className="prov-body">
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                  <span className="prov-meta mono">
                    {hostOf(s.url)}
                    {s.link_status && <> · {s.link_status === "ok" ? "link checked" : s.link_detail ?? s.link_status}</>}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {d.related_topics.length > 0 && (
          <section className="card further">
            <h3 className="card-title mono">Further specimens</h3>
            <ul>
              {d.related_topics.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <nav className="issue-nav" aria-label="Other discoveries">
        <NeighbourLink d={issue.older} dir="older" />
        <a className="issue-nav-library mono" href="/library">
          Library
        </a>
        <NeighbourLink d={issue.newer} dir="newer" />
      </nav>
      <p className="colophon mono">
        {issueNo(number)} · filed {shortDate(d.published_at)} · {d.word_count} words
      </p>
    </article>
  );
}
