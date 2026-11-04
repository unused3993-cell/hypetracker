import { notFound } from "next/navigation";
import { getById, isDemoMode } from "@/lib/repository";
import type { Discovery, EditorialReview } from "@/lib/types";
import { GenerateButton } from "../../components/GenerateButton";
import { ReviewControls } from "../../components/ReviewControls";

export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toFixed(4)}`;

function Review({ review }: { review: EditorialReview }) {
  return (
    <div>
      <h4>
        Editorial review: <span className={review.passed ? "ok" : "broken"}>{review.passed ? "passed" : "unresolved substantive issues"}</span> —{" "}
        {review.issues.length} issue(s), {review.issues.filter((i) => i.applied).length} corrected
      </h4>
      <p>{review.summary}</p>
      <p className="muted">Sources: {review.source_assessment}</p>
      {review.issues.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Where</th>
              <th>Issue</th>
              <th>Correction</th>
            </tr>
          </thead>
          <tbody>
            {review.issues.map((i, k) => (
              <tr key={k}>
                <td className="muted">{i.location}</td>
                <td>
                  <span className={i.severity === "substantive" ? "broken" : "unverified"}>
                    {i.severity} {i.type.replaceAll("_", " ")}
                  </span>
                  <div>“{i.excerpt}”</div>
                  <div className="muted">
                    {i.explanation} {i.source_ids.length ? `(${i.source_ids.join(", ")})` : ""}
                  </div>
                </td>
                <td>
                  {i.applied ? <span className="ok">applied</span> : <span className="broken">not applied</span>}
                  <div>“{i.correction}”</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Sources({ d }: { d: Discovery }) {
  const pack = d.evidence;
  if (!pack) return null;
  const used = new Set(pack.passages.map((p) => p.source_id));
  return (
    <section className="panel">
      <h3>
        Research — {used.size} sources given to the writer, {pack.passages.reduce((n, p) => n + p.text.length, 0).toLocaleString()} chars
      </h3>
      <table>
        <tbody>
          {pack.sources.map((s) => (
            <tr key={s.id}>
              <td>
                <strong>{s.id}</strong>
              </td>
              <td>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
                <div className="muted">
                  {s.origin} · {s.content_status}
                  {s.detail ? ` (${s.detail})` : ""}
                  {s.text ? ` · ${s.text.length.toLocaleString()} chars stored` : ""}
                  {used.has(s.id) ? " · used" : ""}
                </div>
                {s.text && (
                  <details>
                    <summary className="muted">Stored text</summary>
                    <pre>{s.text}</pre>
                  </details>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function BenchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getById(id);
  if (!d) notFound();
  const demo = isDemoMode();
  const v = d.validation;
  const u = d.usage;

  return (
    <div className="bench">
      <p>
        <a href="/bench">← Test bench</a>
        {d.generation_status === "approved" && (
          <>
            {" "}
            · <a href={`/discoveries/${d.id}`}>Published view</a>
          </>
        )}
      </p>
      <p>
        <span className={`badge ${d.generation_status}`}>{d.generation_status.replace("_", " ")}</span>
        <span className="muted">
          {[d.category, d.subcategory, d.content_type, d.word_count && `${d.word_count} words`, u && `cost ${usd(u.total_cost_usd)}`].filter(Boolean).join(" · ")}
        </span>
      </p>
      {d.error && <p className="error">Error: {d.error}</p>}
      {d.review_note && (
        <p>
          Editor&rsquo;s note: {d.review_note} <span className="muted">({d.reviewed_at?.slice(0, 16).replace("T", " ")})</span>
        </p>
      )}

      <ReviewControls id={d.id} status={d.generation_status} demo={demo} />

      {d.content && (
        <article className="bench-article">
          <h1>{d.title}</h1>
          <p className="muted">{d.subtitle}</p>
          {d.content.introduction.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {d.content.sections.map((s, i) => (
            <div key={i}>
              <h2>{s.heading}</h2>
              {s.paragraphs.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
          ))}
        </article>
      )}

      {v && (
        <section className="panel">
          <h3>Fact check</h3>
          <p className="muted">{v.disclaimer}</p>
          {v.review && <Review review={v.review} />}
          {v.issues.length > 0 && (
            <>
              <h4>Other checks</h4>
              <ul>
                {v.issues.map((i, k) => (
                  <li key={k} className={i.level === "error" ? "broken" : "unverified"}>
                    <strong>{i.level}</strong> [{i.code}] {i.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <Sources d={d} />

      {u && (
        <section className="panel">
          <h3>
            Cost: {usd(u.total_cost_usd)} <span className="muted">(target ${u.budget_target_usd.toFixed(2)}, cap ${u.budget_max_usd.toFixed(2)})</span>
          </h3>
          {u.stopped_for_budget && <p className="unverified">Stopped for budget: {u.stopped_for_budget}</p>}
          <table>
            <thead>
              <tr>
                <th>Stage</th>
                <th>Model</th>
                <th>Calls</th>
                <th>Input</th>
                <th>Output</th>
                <th>Searches</th>
                <th>Worst case</th>
                <th>Actual</th>
              </tr>
            </thead>
            <tbody>
              {u.stages.map((s) => (
                <tr key={s.stage}>
                  <td>{s.stage}</td>
                  <td className="muted">{s.model}</td>
                  <td>{s.calls}</td>
                  <td>{s.input_tokens.toLocaleString()}</td>
                  <td>{s.output_tokens.toLocaleString()}</td>
                  <td>{s.web_searches}</td>
                  <td className="muted">{usd(s.max_estimate_usd)}</td>
                  <td>{usd(s.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">{u.pricing_note}</p>
        </section>
      )}

      <details className="panel">
        <summary>Generation log ({d.generation_log.length} entries)</summary>
        {d.generation_log.map((e, k) => (
          <div key={k}>
            <p>
              <span className="muted">
                {new Date(e.at).toLocaleTimeString()} [{e.step}]
              </span>{" "}
              {e.message}
            </p>
            {e.data !== undefined && <pre>{JSON.stringify(e.data, null, 2)}</pre>}
          </div>
        ))}
      </details>

      <GenerateButton label="Generate another discovery" demo={demo} />
    </div>
  );
}
