import { notFound } from "next/navigation";
import { getById, isDemoMode } from "@/lib/repository";
import type { Discovery, VerificationRound } from "@/lib/types";
import { GenerateButton } from "../../components/GenerateButton";
import { ReviewControls } from "../../components/ReviewControls";

export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toFixed(4)}`;

function Verification({ round }: { round: VerificationRound }) {
  const bad = round.assertions.filter((a) => a.verdict !== "supported");
  return (
    <div>
      <h4>
        Round {round.round}: <span className={round.passed ? "ok" : "broken"}>{round.passed ? "passed" : "failed"}</span> —{" "}
        {round.assertions.length - bad.length}/{round.assertions.length} assertions supported
      </h4>
      <p>{round.summary}</p>
      <details open={!round.passed}>
        <summary>All assertions</summary>
        <table>
          <thead>
            <tr>
              <th>Where</th>
              <th>Assertion</th>
              <th>Verdict</th>
              <th>Claims</th>
            </tr>
          </thead>
          <tbody>
            {round.assertions.map((a, i) => (
              <tr key={i}>
                <td className="muted">{a.location}</td>
                <td>
                  {a.assertion}
                  {a.verdict !== "supported" && <div className="muted">{a.note}</div>}
                </td>
                <td className={a.verdict === "supported" ? "ok" : "broken"}>{a.verdict.replaceAll("_", " ")}</td>
                <td className="muted">{a.claim_ids.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {round.map_issues.length > 0 && (
        <ul>
          {round.map_issues.map((m, i) => (
            <li key={i} className="unverified">
              claim map: {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Evidence({ d }: { d: Discovery }) {
  const ledger = d.evidence;
  if (!ledger) return null;
  const usable = ledger.claims.filter((c) => c.usable);
  const excluded = ledger.claims.filter((c) => !c.usable);
  return (
    <>
      <section className="panel">
        <h3>
          Evidence ledger — {usable.length} usable, {excluded.length} excluded
        </h3>
        <p className="muted">{ledger.sufficiency_reason}</p>
        {ledger.conflicts.length > 0 && (
          <>
            <h4>Conflicts</h4>
            <ul>
              {ledger.conflicts.map((c, i) => (
                <li key={i}>
                  {c.summary} <span className="muted">({c.claim_ids.join(", ")})</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <details>
          <summary>Usable claims with verified quotes</summary>
          <ol>
            {usable.map((c) => (
              <li key={c.id}>
                <strong>{c.id}</strong> {c.statement}{" "}
                <span className="muted">
                  [{c.stakes.replaceAll("_", " ")}
                  {c.status !== "supported" ? `, ${c.status}` : ""}]
                </span>
                {c.note && <div className="muted">{c.note}</div>}
                <ul>
                  {c.evidence.map((e, i) => (
                    <li key={i} className={e.verified ? "" : "broken"}>
                      {e.source_id}: “{e.quote}” {e.verified ? <span className="ok">✓ chars {e.location?.start}–{e.location?.end}</span> : <span>✗ not found</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </details>
        <details>
          <summary>Excluded claims</summary>
          <ul>
            {excluded.map((c) => (
              <li key={c.id}>
                <strong>{c.id}</strong> {c.statement} — <span className="broken">{c.exclusion_reason}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="panel">
        <h3>Sources ({ledger.sources.length})</h3>
        <table>
          <tbody>
            {ledger.sources.map((s) => (
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
                  </div>
                  {s.credibility_note && <div className="muted">{s.credibility_note}</div>}
                  {s.excerpts?.length ? <div className="muted">search excerpts: {s.excerpts.map((x) => `“${x}”`).join(" ")}</div> : null}
                  {s.text && (
                    <details>
                      <summary className="muted">Stored text</summary>
                      <pre>{s.text}</pre>
                    </details>
                  )}
                </td>
                <td>
                  {s.authority ?? "—"}
                  <div className="muted">{s.relevance ? `${s.relevance} relevance` : ""}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
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
          <h3>Factual verification</h3>
          <p className="muted">{v.disclaimer}</p>
          {(v.verification ?? []).map((r) => (
            <Verification key={r.round} round={r} />
          ))}
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

      <Evidence d={d} />

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
