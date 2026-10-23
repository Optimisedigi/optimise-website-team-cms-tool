import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { parsePlacementBody, placeIdea } from "@/lib/content-map/placement";
import { loadClientForUser, validClientId } from "@/lib/content-map/state";
import { isRecord } from "@/lib/content-map/types";

export const maxDuration = 120;

/** Staff: where would this idea fit? → PlacementResult. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const clientId = typeof body.clientId === "number" ? String(body.clientId) : body.clientId;
    if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });
    const input = parsePlacementBody(body);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
    const client = await loadClientForUser(payload, clientId, user);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const res = await placeIdea(payload, clientId, input.value);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ placement: res.value });
  } catch (err) {
    console.error("[content-map] placement failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to place the idea" }, { status: 500 });
  }
}
