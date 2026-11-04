import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import type { Discovery, Interest } from "./types";

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl(), config.supabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function fail(action: string, error: { message: string; hint?: string | null } | null): never {
  const hint = error?.message?.includes("does not exist")
    ? " (Has supabase/schema.sql been run against this project?)"
    : "";
  throw new Error(`Supabase: failed to ${action}: ${error?.message ?? "unknown error"}${hint}`);
}

export async function listInterests(): Promise<Interest[]> {
  const { data, error } = await db()
    .from("interests")
    .select("category, subcategory, weight")
    .eq("active", true);
  if (error) fail("load interests", error);
  return (data ?? []).map((r) => ({ ...r, weight: Number(r.weight) }));
}

/** Everything except the (large) evidence ledger. */
const LIST_COLUMNS =
  "id, title, subtitle, category, subcategory, content_type, topic, content, word_count, reading_time_minutes, sources, related_topics, validation, usage, generation_log, generation_status, error, review_note, reviewed_at, created_at, published_at";

export async function listDiscoveries(limit = 100): Promise<Discovery[]> {
  const { data, error } = await db()
    .from("discoveries")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("list discoveries", error);
  return (data ?? []) as Discovery[];
}

export async function getDiscovery(id: string): Promise<Discovery | null> {
  const { data, error } = await db().from("discoveries").select("*").eq("id", id).maybeSingle();
  if (error) fail("load discovery", error);
  return (data as Discovery) ?? null;
}

/** Previous non-failed discoveries, newest first — used for novelty and diversity checks. */
export async function listHistory(limit = 300) {
  const { data, error } = await db()
    .from("discoveries")
    .select("id, title, topic, category, subcategory, created_at")
    .neq("generation_status", "failed")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("load discovery history", error);
  return (data ?? []) as Pick<Discovery, "id" | "title" | "topic" | "category" | "subcategory" | "created_at">[];
}

export async function createDiscoveryRow(): Promise<string> {
  const { data, error } = await db()
    .from("discoveries")
    .insert({ generation_status: "generating" })
    .select("id")
    .single();
  if (error) fail("create discovery row", error);
  return data.id as string;
}

export async function updateDiscovery(id: string, patch: Partial<Omit<Discovery, "id" | "created_at">>) {
  const { error } = await db().from("discoveries").update(patch).eq("id", id);
  if (error) fail("update discovery", error);
}

export type ReviewAction = "approve" | "reject";

/**
 * Record an editor's decision. Only verified discoveries can be approved; the status
 * condition is part of the update, so a concurrent change can't slip an unverified one through.
 */
export async function reviewDiscovery(id: string, action: ReviewAction, note: string): Promise<Discovery | null> {
  const now = new Date().toISOString();
  const allowed = action === "approve" ? ["verified"] : ["verified", "needs_review"];
  const patch =
    action === "approve"
      ? { generation_status: "approved", published_at: now, reviewed_at: now, review_note: note || null }
      : { generation_status: "rejected", published_at: null, reviewed_at: now, review_note: note || null };
  const { data, error } = await db().from("discoveries").update(patch).eq("id", id).in("generation_status", allowed).select(LIST_COLUMNS).maybeSingle();
  if (error) fail("record review decision", error);
  return (data as Discovery | null) ?? null;
}
