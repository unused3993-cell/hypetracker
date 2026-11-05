"use client";

import { useState } from "react";

/** Entry point for the future Ask BAER feature. Placeholder only: no chat backend yet. */
export function AskBaer() {
  const [open, setOpen] = useState(false);
  return (
    <section className="ask" aria-labelledby="ask-label">
      <button type="button" className="ask-button" aria-expanded={open} aria-controls="ask-note" onClick={() => setOpen((o) => !o)}>
        <span>
          <span id="ask-label" className="ask-label">
            Ask BAER
          </span>
          <span className="ask-sub">Questions about this article and its sources</span>
        </span>
        <span className="ask-status">Coming soon</span>
      </button>
      {open && (
        <p id="ask-note" className="ask-note">
          Ask BAER isn’t available yet. When it is, you’ll be able to ask follow-up questions here and get answers drawn from this article’s sources.
        </p>
      )}
    </section>
  );
}
