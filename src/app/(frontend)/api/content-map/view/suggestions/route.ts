import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../../../dashboard/verify/route";
import { authoritiesFromClient } from "@/lib/content-map/authorities";
import { toClientView } from "@/lib/content-map/client-view";
import { findReportClient, validReportSlug } from "@/lib/content-map/paths";
import { createSuggestion, parseSuggestionInput, toSuggestionView } from "@/lib/content-map/suggestions";
import { isRecord } from "@/lib/content-map/types";

/**
 * Client suggestion from the PIN-gated view. The only session-less write:
 * the dashboard PIN cookie must be signed for this exact slug, the client is
 * resolved from the slug (never from a sent id), and every field is validated.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const slug = body.slug;
  if (!validReportSlug(slug)) return NextResponse.json({ error: "slug is invalid" }, { status: 400 });
  try {
    const payload = await getPayload({ config });
    const client = await findReportClient(payload, slug);
    if (!client || !validateDashboardToken((await cookies()).get("dashboard_token")?.value, client.slug)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const full = (await payload.findByID({ collection: "clients", id: client.id, depth: 0, overrideAccess: true, select: { topicAuthorities: true } })) as unknown as Record<string, unknown>;
    const input = parseSuggestionInput(body, authoritiesFromClient(full));
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
    const res = await createSuggestion(payload, { clientId: client.id, value: input.value, origin: "client", suggestedBy: "Client" });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    const [suggestion] = toClientView({
      client: { id: "", name: "", siteUrl: "", enabled: true, authorities: [] },
      run: null, snapshot: null, decisions: [], termW: {}, sent: {}, history: [],
      suggestions: [toSuggestionView(res.value)],
    }).suggestions ?? [];
    return NextResponse.json({ suggestion }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[content-map] client suggestion failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to save the suggestion" }, { status: 500 });
  }
}
