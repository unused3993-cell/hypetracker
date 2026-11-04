import { isDemoMode, listAll } from "@/lib/repository";
import type { Discovery } from "@/lib/types";
import { GenerateButton } from "../components/GenerateButton";

export const dynamic = "force-dynamic";

export default async function Bench() {
  const demo = isDemoMode();
  let discoveries: Discovery[] = [];
  let loadError: string | null = null;
  try {
    discoveries = await listAll();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="bench">
      <h1>Test bench</h1>
      <p className="muted">
        Every discovery in any status. Generated articles stop at <strong>verified</strong> or <strong>needs review</strong>; only verified
        ones can be approved for publication.
      </p>
      <GenerateButton demo={demo} />
      {loadError && <p className="error">{loadError}</p>}
      <h2>Discoveries ({discoveries.length})</h2>
      {discoveries.length === 0 && !loadError && <p className="muted">Nothing generated yet.</p>}
      <table>
        <tbody>
          {discoveries.map((d) => (
            <tr key={d.id}>
              <td>
                <span className={`badge ${d.generation_status}`}>{d.generation_status.replace("_", " ")}</span>
              </td>
              <td>
                <a href={`/bench/${d.id}`}>{d.title ?? d.topic ?? "(no topic selected)"}</a>
                <div className="muted">
                  {[d.category, d.subcategory, d.content_type, d.word_count && `${d.word_count} words`, d.usage && `$${d.usage.total_cost_usd.toFixed(3)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {d.generation_status === "failed" && d.error && <div className="error muted">{d.error}</div>}
              </td>
              <td className="muted">{new Date(d.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
