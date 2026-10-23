import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { decideSuggestion, toSuggestionView } from "@/lib/content-map/suggestions";
import { latestCompleted, loadClientForUser, loadPlan, validClientId } from "@/lib/content-map/state";
import { isRecord } from "@/lib/content-map/types";

// Approving an article/bridge waits for the model to write its brief.
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
    const id = typeof body.id === "number" ? String(body.id) : body.id;
    if (!validClientId(id)) return NextResponse.json({ error: "id is invalid" }, { status: 400 });
    if (body.decision !== "approve" && body.decision !== "dismiss") return NextResponse.json({ error: "decision must be approve or dismiss" }, { status: 400 });
    if (body.reason !== undefined && typeof body.reason !== "string") return NextResponse.json({ error: "reason must be text" }, { status: 400 });
    const client = await loadClientForUser(payload, clientId, user);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const u = user as unknown as { name?: string; email?: string };
    const res = await decideSuggestion(
      payload,
      { clientId, id, decision: body.decision, reason: body.reason, decidedBy: u.name || u.email || "Team" },
      { snapshot: body.decision === "approve" ? await latestCompleted(payload, clientId) : null },
    );
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    const planItem = res.planItem ? (await loadPlan(payload, clientId)).plan.find((p) => p.suggestionId === String(res.suggestion.id)) ?? res.planItem : undefined;
    return NextResponse.json({ suggestion: toSuggestionView(res.suggestion), ...(planItem ? { planItem } : {}) });
  } catch (err) {
    console.error("[content-map] suggestion decide failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to decide the suggestion" }, { status: 500 });
  }
}
