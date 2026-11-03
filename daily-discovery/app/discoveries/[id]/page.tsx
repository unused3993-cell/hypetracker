import { notFound } from "next/navigation";
import { getDiscovery } from "@/lib/db";
import { GenerateButton } from "../../GenerateButton";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getDiscovery(id);
  if (!d) notFound();

  const sourceById = new Map(d.sources.map((s) => [s.id, s]));
  const v = d.validation;

  return (
    <>
      <p>
        <a href="/">← All discoveries</a>
      </p>
      <p>
        <span className={`badge ${d.generation_status}`}>{d.generation_status.replace("_", " ")}</span>
        <span className="muted">
          {[d.category, d.subcategory, d.content_type, d.reading_time_minutes && `${d.reading_time_minutes} min read`, d.word_count && `${d.word_count} words`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </p>
      {d.error && <p className="error">Error: {d.error}</p>}

      {d.content && (
        <article>
          <h1>{d.title}</h1>
          <p className="muted" style={{ fontSize: "1.15em" }}>{d.subtitle}</p>
          {d.content.introduction.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {d.content.sections.map((s, i) => (
            <div key={i}>
              <h2>{s.heading}</h2>
              {s.paragraphs.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
              {s.source_ids.length > 0 && (
                <p className="muted">
                  Sources for this section:{" "}
                  {s.source_ids.map((sid) => (
                    <a key={sid} href={`#${sid}`} style={{ marginRight: 6 }}>
                      [{sid}]
                    </a>
                  ))}
                </p>
              )}
            </div>
          ))}
        </article>
      )}

      {d.sources.length > 0 && (
        <section className="panel">
          <h3>Sources</h3>
          <ol style={{ paddingLeft: 20 }}>
            {d.sources.map((s) => (
              <li key={s.id} id={s.id}>
                <strong>{s.id}</strong> <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                <div className="muted">
                  {s.url} · <span className={s.link_status}>{s.link_status ?? "unchecked"}</span>
                  {s.link_detail && ` (${s.link_detail})`}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {d.related_topics.length > 0 && (
        <section className="panel">
          <h3>Related topics</h3>
          <ul>
            {d.related_topics.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {v && (
        <section className="panel">
          <h3>Automated validation</h3>
          <p className="muted">{v.disclaimer}</p>
          <p>Revisions: {v.revisions}</p>
          {v.issues.length === 0 ? (
            <p className="ok">No structural issues found.</p>
          ) : (
            <ul>
              {v.issues.map((i, k) => (
                <li key={k} className={i.level === "error" ? "broken" : "unverified"}>
                  <strong>{i.level}</strong> [{i.code}] {i.message}
                </li>
              ))}
            </ul>
          )}
          {v.claim_review && (
            <>
              <h4>Claim review (article vs. its research notes)</h4>
              <p>{v.claim_review.summary}</p>
              {v.claim_review.flags.length === 0 ? (
                <p className="ok">No claims flagged.</p>
              ) : (
                <ul>
                  {v.claim_review.flags.map((f, k) => (
                    <li key={k}>
                      <strong>{f.verdict.replaceAll("_", " ")}</strong>: “{f.claim}” — <span className="muted">{f.note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {v.research_notes.length > 0 && (
            <>
              <h4>Disputed or uncertain points found during research</h4>
              <ul>
                {v.research_notes.map((n, k) => (
                  <li key={k}>
                    {n.split(/(\[S\d+(?:, S\d+)*\])/).map((part, j) =>
                      /^\[S\d+/.test(part) ? (
                        <span key={j} className="muted">
                          {" "}
                          {part.slice(1, -1).split(", ").map((sid) => (
                            <a key={sid} href={`#${sid}`} title={sourceById.get(sid)?.url}>[{sid}]</a>
                          ))}
                        </span>
                      ) : (
                        part
                      ),
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {v?.research_dossier && (
        <details className="panel">
          <summary>Research notes the article was written from</summary>
          <pre>{v.research_dossier}</pre>
        </details>
      )}

      <details className="panel">
        <summary>Generation log ({d.generation_log.length} entries)</summary>
        {d.generation_log.map((e, k) => (
          <div key={k}>
            <p>
              <span className="muted">{new Date(e.at).toLocaleTimeString()} [{e.step}]</span> {e.message}
            </p>
            {e.data !== undefined && <pre>{JSON.stringify(e.data, null, 2)}</pre>}
          </div>
        ))}
      </details>

      <GenerateButton label="Generate another discovery" />
    </>
  );
}
