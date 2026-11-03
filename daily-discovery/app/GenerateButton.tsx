"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function GenerateButton({ label = "Generate a new discovery" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", { method: "POST" });
      const data = await res.json();
      if (data.id) router.push(`/discoveries/${data.id}`);
      else setError(data.error ?? `Request failed (${res.status})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div>
      <button onClick={run} disabled={busy}>
        {busy ? `Selecting, researching and writing… ${elapsed}s` : label}
      </button>
      {busy && <p className="muted">This usually takes a few minutes. Progress is logged in the terminal running `npm run dev`.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
