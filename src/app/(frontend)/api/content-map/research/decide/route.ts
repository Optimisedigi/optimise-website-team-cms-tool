import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { decideResearchIdea } from "@/lib/content-map/placement";
import { loadClientForUser, loadPlan, validClientId } from "@/lib/content-map/state";
import { isRecord } from "@/lib/content-map/types";

// "add" may wait for the model to write the brief.
export const maxDuration = 180;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const clientId = typeof body.clientId === "number" ? String(body.clientId) : body.clientId;
    if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });
    if (typeof body.id !== "string" || !body.id || body.id.length > 100) return NextResponse.json({ error: "id is invalid" }, { status: 400 });
    if (body.action !== "add" && body.action !== "dismiss" && body.action !== "restore") return NextResponse.json({ error: "action must be add, dismiss or restore" }, { status: 400 });
    const client = await loadClientForUser(payload, clientId, user);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const res = await decideResearchIdea(payload, { clientId, id: body.id, action: body.action });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    const planItem = res.planItem ? (await loadPlan(payload, clientId)).plan.find((p) => p.researchId === res.idea.id) ?? res.planItem : undefined;
    return NextResponse.json({ idea: res.idea, ...(planItem ? { planItem } : {}) });
  } catch (err) {
    console.error("[content-map] research decide failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to update the research idea" }, { status: 500 });
  }
}
