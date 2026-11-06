import { getIssue, isDemoMode } from "@/lib/repository";
import { IssueView } from "../components/IssueView";

export const dynamic = "force-dynamic";

export default async function Today() {
  let issue = null;
  let error: string | null = null;
  try {
    issue = await getIssue();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!issue) {
    return (
      <div className="empty">
        <p className="mono">Today</p>
        <h1 className="display">Nothing published yet.</h1>
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <p>
            Generate a discovery from the <a href="/bench">test bench</a>
            {isDemoMode() ? "" : ", or run `npm run demo` to browse sample content"}.
          </p>
        )}
      </div>
    );
  }
  return <IssueView issue={issue} label={issue.isLatest ? "Today’s discovery" : "From the library"} />;
}
