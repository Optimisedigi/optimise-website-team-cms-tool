import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { needsResearchInsights, runResearchNow, scheduleResearchInsights } from "@/lib/content-map/placement";
import { latestCompletedResearch } from "@/lib/content-map/research";
import { loadClientForUser, validClientId } from "@/lib/content-map/state";

export const maxDuration = 300;

/** "Research now" (staff): start GT research (reusing a run < 60 min) and pull Search Console. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = ((await request.json().catch(() => null)) ?? {}) as { clientId?: unknown };
    const clientId = typeof body.clientId === "number" ? String(body.clientId) : body.clientId;
    if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });
    const client = await loadClientForUser(payload, clientId, user);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const { research, gsc } = await runResearchNow(payload, clientId);
    // New Search Console data: re-place the latest research with it.
    if (gsc.ok) {
      const [last] = await latestCompletedResearch(payload, clientId);
      if (last && needsResearchInsights(last, gsc.doc)) scheduleResearchInsights(payload, last);
    }
    if (!research.ok) return NextResponse.json({ error: research.error, gsc: { ok: gsc.ok, connected: gsc.connected } }, { status: research.status });
    return NextResponse.json({
      runId: String(research.run.runId ?? ""),
      status: String(research.run.status ?? "running"),
      reused: research.reused,
      gsc: { ok: gsc.ok, connected: gsc.connected, ...(gsc.error ? { error: gsc.error } : {}) },
    });
  } catch (err) {
    console.error("[content-map] research run failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to start research" }, { status: 500 });
  }
}
