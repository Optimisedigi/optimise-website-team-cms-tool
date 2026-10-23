import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { triggerContentMapRun } from "@/lib/content-map/snapshots";
import { loadClientForUser, validClientId } from "@/lib/content-map/state";

export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    const input = (body ?? {}) as { clientId?: unknown; mode?: unknown };
    const clientId = typeof input.clientId === "number" ? String(input.clientId) : input.clientId;
    if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });
    if (input.mode !== undefined && input.mode !== "full" && input.mode !== "refresh") {
      return NextResponse.json({ error: "mode must be full or refresh" }, { status: 400 });
    }
    const client = await loadClientForUser(payload, clientId, user);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const res = await triggerContentMapRun(payload, clientId, input.mode === "refresh" ? "refresh" : "full");
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    const run = res.run;
    return NextResponse.json({
      reused: res.reused,
      run: {
        runId: run.runId,
        status: run.status,
        mode: run.mode ?? null,
        phase: run.phase ?? null,
        pagesCrawled: run.pagesCrawled ?? null,
        error: run.error ?? null,
        startedAt: run.startedAt ?? null,
      },
    });
  } catch (err) {
    console.error("[content-map] run failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to start the analysis" }, { status: 500 });
  }
}
