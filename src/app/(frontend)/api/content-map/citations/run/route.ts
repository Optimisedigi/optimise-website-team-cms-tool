import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { startCitationRun } from "@/lib/content-map/citations";
import { loadClientForUser, validClientId } from "@/lib/content-map/state";

// Filling missing questions can take a model call per topic.
export const maxDuration = 300;

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
    const res = await startCitationRun(payload, clientId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ runId: String(res.run.runId ?? ""), status: String(res.run.status ?? "running"), reused: res.reused });
  } catch (err) {
    console.error("[content-map] citations run failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to start the AI citation check" }, { status: 500 });
  }
}
