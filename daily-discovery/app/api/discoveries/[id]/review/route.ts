import { NextResponse } from "next/server";
import { getDiscovery, reviewDiscovery, type ReviewAction } from "@/lib/db";
import { isDemoMode } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isDemoMode()) {
    return NextResponse.json({ error: "Review decisions are disabled in demo mode." }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; note?: string };
  const action = body.action as ReviewAction;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  }
  const updated = await reviewDiscovery(id, action, (body.note ?? "").slice(0, 2000));
  if (!updated) {
    const current = await getDiscovery(id);
    if (!current) return NextResponse.json({ error: "Discovery not found." }, { status: 404 });
    const why =
      action === "approve"
        ? `Only discoveries that passed factual verification can be approved; this one is "${current.generation_status}".`
        : `A "${current.generation_status}" discovery can't be rejected.`;
    return NextResponse.json({ error: why }, { status: 409 });
  }
  return NextResponse.json({ id, status: updated.generation_status });
}
