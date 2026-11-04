// Research for one topic: retrieve sources → select passages → extract claims → verify quotes.
// Shared by the pipeline and the command-line checks.

import type { CostTracker } from "./cost";
import { buildLedger, extractEvidence } from "./evidence";
import { selectPassages } from "./passages";
import { retrieveSources, type ResearchQuery } from "./retrieval";
import type { EvidenceLedger } from "./types";

export interface ResearchOutcome {
  ledger: EvidenceLedger | null;
  log: { message: string; data?: unknown }[];
  usedWebSearch: boolean;
}

export async function researchTopic(
  query: ResearchQuery,
  tracker: CostTracker,
  reserveUsd: number,
  opts: { forceWebSearch?: boolean; allowWebSearch?: boolean } = {},
): Promise<ResearchOutcome> {
  const log: ResearchOutcome["log"] = [];
  const retrieval = await retrieveSources(query, tracker, reserveUsd, opts.allowWebSearch ?? true, opts.forceWebSearch ?? false);
  for (const line of retrieval.log) log.push({ message: line });

  const passages = selectPassages(retrieval.sources, `${query.topic} ${query.angle} ${query.searchTerms.join(" ")}`);
  const retrieved = retrieval.sources.filter((s) => s.content_status === "retrieved").length;
  log.push({
    message: `${retrieved}/${retrieval.sources.length} sources retrieved; ${passages.length} passages selected`,
    data: retrieval.sources.map((s) => ({ id: s.id, url: s.url, origin: s.origin, status: s.content_status, detail: s.detail, chars: s.text?.length ?? 0 })),
  });
  if (passages.length < 6) {
    log.push({ message: "REJECTED: too little relevant source text" });
    return { ledger: null, log, usedWebSearch: retrieval.usedWebSearch };
  }

  const extraction = await extractEvidence({ topic: query.topic, angle: query.angle, sources: retrieval.sources, passages, tracker, reserveUsd });
  const ledger = buildLedger(retrieval.sources, passages, extraction);
  const quotes = ledger.claims.flatMap((c) => c.evidence);
  log.push({
    message: `${ledger.sufficient ? "sufficient" : "REJECTED"}: ${ledger.sufficiency_reason}; ${quotes.filter((e) => e.verified).length}/${quotes.length} quotes found in source text`,
    data: ledger.claims.filter((c) => !c.usable).map((c) => ({ id: c.id, statement: c.statement, reason: c.exclusion_reason })),
  });
  return { ledger, log, usedWebSearch: retrieval.usedWebSearch };
}
