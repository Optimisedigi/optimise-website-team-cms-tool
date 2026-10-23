import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { authoritiesFromClient } from "@/lib/content-map/authorities";
import { createSuggestion, parseSuggestionInput, toSuggestionView } from "@/lib/content-map/suggestions";
import { loadClientForUser, validClientId } from "@/lib/content-map/state";
import { isRecord } from "@/lib/content-map/types";

/** Team suggestion (topic / article / bridge). Starts pending; one click to approve. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const clientId = typeof body.clientId === "number" ? String(body.clientId) : body.clientId;
    if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });
    const client = await loadClientForUser(payload, clientId, user);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const input = parseSuggestionInput(body, authoritiesFromClient(client));
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
    const u = user as unknown as { id: number | string; name?: string; email?: string };
    const res = await createSuggestion(payload, {
      clientId,
      value: input.value,
      origin: "team",
      suggestedBy: (u.name || u.email || "Team").split(" ")[0] ?? "Team",
      userId: u.id,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ suggestion: toSuggestionView(res.value) });
  } catch (err) {
    console.error("[content-map] suggestion failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to save the suggestion" }, { status: 500 });
  }
}
