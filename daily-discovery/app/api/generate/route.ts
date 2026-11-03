import { NextResponse } from "next/server";
import { generateDiscovery } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // research + writing can take several minutes

export async function POST() {
  try {
    const result = await generateDiscovery((e) => console.log(`[discovery:${e.step}] ${e.message}`));
    return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
  } catch (err) {
    // Only reached if the row itself could not be created (e.g. Supabase misconfigured).
    const message = err instanceof Error ? err.message : String(err);
    console.error("Generation could not start:", err);
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}
