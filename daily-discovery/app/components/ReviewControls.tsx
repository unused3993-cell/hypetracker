"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GenerationStatus } from "@/lib/types";

export function ReviewControls({ id, status, demo }: { id: string; status: GenerationStatus; demo: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canApprove = status === "verified";
  const canReject = status === "verified" || status === "needs_review";
  if (!canApprove && !canReject) return null;

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/discoveries/${id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? `Request failed (${res.status})`);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel review">
      <h3>Editorial decision</h3>
      {demo && <p className="muted">Demo mode: decisions are disabled.</p>}
      {!canApprove && (
        <p className="muted">
          This article did not pass factual verification, so it can&rsquo;t be approved. You can reject it, or generate another.
        </p>
      )}
      <label htmlFor={`note-${id}`} className="muted">
        Note (optional)
      </label>
      <textarea id={`note-${id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy || demo} />
      <div className="review-buttons">
        <button onClick={() => decide("approve")} disabled={busy || demo || !canApprove}>
          Approve and publish
        </button>
        <button className="secondary" onClick={() => decide("reject")} disabled={busy || demo || !canReject}>
          Reject
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
