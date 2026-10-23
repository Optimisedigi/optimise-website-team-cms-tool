import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { latestGsc } from "@/lib/content-map/gsc";
import { needsResearchInsights, scheduleResearchInsights } from "@/lib/content-map/placement";
import { upsertResearchRun } from "@/lib/content-map/research";
import { isGrowthToolsPush, validClientId } from "@/lib/content-map/state";
import { isRecord } from "@/lib/content-map/types";

// Long enough for the post-response placement (after()).
export const maxDuration = 300;

/** GT pushes a finished (or failed) research run here. Idempotent: upsert by runId. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isGrowthToolsPush(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const clientId = typeof body.clientId === "number" ? String(body.clientId) : body.clientId;
  const { runId, status } = body;
  if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });
  if (typeof runId !== "string" || !runId || runId.length > 200) return NextResponse.json({ error: "runId is invalid" }, { status: 400 });
  if (status !== "completed" && status !== "failed") return NextResponse.json({ error: "status must be completed or failed" }, { status: 400 });
  try {
    const payload = await getPayload({ config });
    try {
      await payload.findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true, select: { name: true } });
    } catch {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    const out = await upsertResearchRun(payload, {
      clientId,
      runId,
      status,
      error: typeof body.error === "string" ? body.error : undefined,
      result: status === "completed" ? body.result : undefined,
    });
    const insightsPending = needsResearchInsights(out.doc, await latestGsc(payload, clientId));
    if (insightsPending) scheduleResearchInsights(payload, out.doc);
    return NextResponse.json({ ok: true, status: out.doc.status, insightsPending });
  } catch (err) {
    console.error("[content-map] research ingest failed:", (err as Error).message);
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
