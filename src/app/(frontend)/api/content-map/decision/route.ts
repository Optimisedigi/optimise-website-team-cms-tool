import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { applyDecision } from "@/lib/content-map/decisions";
import { latestCompleted, loadClientForUser, validClientId } from "@/lib/content-map/state";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = ((await request.json().catch(() => null)) ?? {}) as { clientId?: unknown; key?: unknown; decision?: unknown };
    const clientId = typeof body.clientId === "number" ? String(body.clientId) : body.clientId;
    if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });
    if (typeof body.key !== "string" || !body.key || body.key.length > 2000) return NextResponse.json({ error: "key is invalid" }, { status: 400 });
    const decision = body.decision;
    if (decision !== "accepted" && decision !== "dismissed" && decision !== "undo") {
      return NextResponse.json({ error: "decision must be accepted, dismissed or undo" }, { status: 400 });
    }
    const client = await loadClientForUser(payload, clientId, user);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const snapshot = decision === "undo" ? null : await latestCompleted(payload, clientId);
    const res = await applyDecision(payload, {
      clientId,
      siteUrl: String(client.websiteUrl ?? ""),
      snapshot,
      key: body.key,
      decision,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json(res);
  } catch (err) {
    console.error("[content-map] decision failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to save the decision" }, { status: 500 });
  }
}
