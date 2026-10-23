import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { sendRecommendation } from "@/lib/content-map/brief";
import { loadClientForUser, loadPlan, validClientId } from "@/lib/content-map/state";

/** One click: a "write next" idea becomes a Blog Prompter brief. Never automatic. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = ((await request.json().catch(() => null)) ?? {}) as { clientId?: unknown; recommendationId?: unknown };
    const clientId = typeof body.clientId === "number" ? String(body.clientId) : body.clientId;
    if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });
    const rid = body.recommendationId;
    if (typeof rid !== "string" || !rid || rid.length > 200) return NextResponse.json({ error: "recommendationId is invalid" }, { status: 400 });
    const client = await loadClientForUser(payload, clientId, user);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const { plan, snapshot, aliases } = await loadPlan(payload, clientId);
    const res = await sendRecommendation(payload, {
      clientId,
      // A merged near-duplicate's id resolves to the item that was kept.
      recommendationId: aliases[rid] ?? rid,
      snapshot,
      plan,
      siteUrl: String(client.websiteUrl ?? ""),
      blogCategories: String(client.blogCategories ?? ""),
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ blogPromptId: res.blogPromptId, created: res.created });
  } catch (err) {
    console.error("[content-map] send failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to send to the Blog Prompter" }, { status: 500 });
  }
}
