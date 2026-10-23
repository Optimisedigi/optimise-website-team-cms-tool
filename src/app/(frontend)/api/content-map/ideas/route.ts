import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { latestCompletedDoc, refreshIdeas } from "@/lib/content-map/ideas";
import { loadClientForUser, validClientId } from "@/lib/content-map/state";

export const maxDuration = 300;

/** Rewrite the latest analysis's Write next ideas with the CMS's subscription models. */
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
    const doc = await latestCompletedDoc(payload, clientId);
    if (!doc) return NextResponse.json({ error: "No completed analysis yet" }, { status: 404 });
    const res = await refreshIdeas(payload, doc);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
    return NextResponse.json(res);
  } catch (err) {
    console.error("[content-map] ideas failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to write ideas" }, { status: 500 });
  }
}
