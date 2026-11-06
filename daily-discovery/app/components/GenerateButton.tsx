"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const DEMO_STEPS = [
  "Planning category from interest weights",
  "Generating and scoring 10 candidate topics",
  "Researching with web search and fetch",
  "Writing from research notes",
  "Reviewing claims against the notes",
  "Checking source links and saving",
];

export function GenerateButton({ label = "Generate a new discovery", demo = false }: { label?: string; demo?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [demoStep, setDemoStep] = useState(-1);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function runDemo() {
    setBusy(true);
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      setDemoStep(i);
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 700));
    }
    setDemoStep(DEMO_STEPS.length);
    setBusy(false);
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", { method: "POST" });
      const data = await res.json();
      if (data.id) router.push(`/bench/${data.id}`);
      else setError(data.error ?? `Request failed (${res.status})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  if (demo) {
    return (
      <div className="demo-sim">
        <button onClick={runDemo} disabled={busy}>
          {busy ? "Simulating…" : `${label} (demo simulation)`}
        </button>
        <p className="muted">
          <strong>Demo functionality.</strong> This plays back the pipeline's steps. It makes no API calls and creates no new discovery.
        </p>
        {demoStep >= 0 && (
          <ol className="demo-steps">
            {DEMO_STEPS.map((s, i) => (
              <li key={s} className={i < demoStep ? "done" : i === demoStep ? "active" : ""}>
                {s}
              </li>
            ))}
          </ol>
        )}
        {demoStep === DEMO_STEPS.length && (
          <p>
            Simulation finished. In live mode a new discovery would appear here.{" "}
            <a href="/">Back to today&rsquo;s sample discovery →</a>
          </p>
        )}
      </div>
    );
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
