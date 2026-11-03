// Read access for the reader-facing pages. Picks demo content or Supabase.

import { demoDiscoveries, isDemoMode } from "../demo"; // demo
import { getDiscovery, listDiscoveries } from "./db";
import type { Discovery } from "./types";

export { isDemoMode }; // demo

/** Everything, any status (test bench). */
export async function listAll(): Promise<Discovery[]> {
  if (isDemoMode()) return demoDiscoveries(); // demo
  return listDiscoveries();
}

/** Published discoveries, newest first (Today and Library). */
export async function listPublished(): Promise<Discovery[]> {
  const all = await listAll();
  return all
    .filter((d) => d.generation_status === "ready" && d.content)
    .sort((a, b) => (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at));
}

export async function getById(id: string): Promise<Discovery | null> {
  if (isDemoMode()) return demoDiscoveries().find((d) => d.id === id) ?? null; // demo
  return getDiscovery(id);
}

export interface IssueContext {
  discovery: Discovery;
  /** 1-based issue number in publication order. */
  number: number;
  newer: Discovery | null;
  older: Discovery | null;
  isLatest: boolean;
}

/** A published discovery with its neighbours, for day-to-day navigation. */
export async function getIssue(id?: string): Promise<IssueContext | null> {
  const published = await listPublished();
  if (published.length === 0) return null;
  const index = id ? published.findIndex((d) => d.id === id) : 0;
  if (index < 0) return null;
  return {
    discovery: published[index],
    number: published.length - index,
    newer: published[index - 1] ?? null,
    older: published[index + 1] ?? null,
    isLatest: index === 0,
  };
}

/** Broad shelf used for Library filters. */
export function shelfOf(category: string | null): "history" | "science" | "technology" | "culture" {
  const c = (category ?? "").toLowerCase();
  if (c.startsWith("history")) return "history";
  if (c.startsWith("science")) return "science";
  if (c.startsWith("technology")) return "technology";
  return "culture";
}
