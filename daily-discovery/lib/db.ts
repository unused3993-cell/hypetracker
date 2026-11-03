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

export async function listDiscoveries(limit = 100): Promise<Discovery[]> {
  const { data, error } = await db()
    .from("discoveries")
    .select("*")
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
