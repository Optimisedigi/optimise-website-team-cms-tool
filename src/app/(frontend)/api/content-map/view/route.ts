import { cookies, headers as nextHeaders } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../../dashboard/verify/route";
import { toClientView } from "@/lib/content-map/client-view";
import { findReportClient, resolveClientParam, validReportSlug } from "@/lib/content-map/paths";
import { buildContentMapState } from "@/lib/content-map/state";

export const maxDuration = 30;

/**
 * Read-only, client-safe Content Map for /SEO/Topic-association-linking/<slug>.
 * Allowed with the client's dashboard PIN cookie for this exact slug, or for
 * signed-in staff who can access the client (their "client view" preview).
 * The response is always passed through toClientView: no team working state.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (!validReportSlug(slug)) return NextResponse.json({ error: "slug is invalid" }, { status: 400 });
  try {
    const payload = await getPayload({ config });
    // 1) Client: their dashboard PIN cookie, signed for this exact slug.
    let clientId: string | null = null;
    const reportClient = await findReportClient(payload, slug);
    if (reportClient && validateDashboardToken((await cookies()).get("dashboard_token")?.value, reportClient.slug)) {
      clientId = reportClient.id;
    }
    // 2) Staff previewing the client view: CMS session + access to this client.
    if (!clientId) {
      const { user } = await payload.auth({ headers: await nextHeaders() });
      const staffClient = user ? await resolveClientParam(payload, slug, user) : null;
      if (staffClient) clientId = staffClient.id;
    }
    if (!clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const full = await payload.findByID({
      collection: "clients",
      id: clientId,
      depth: 0,
      overrideAccess: true,
      select: { name: true, slug: true, websiteUrl: true, contentMapEnabled: true, topicAuthorities: true, blogCategories: true, targetLocation: true, gscConnected: true },
    });
    const state = await buildContentMapState(payload, full as unknown as Record<string, unknown>);
    return NextResponse.json(toClientView(state), { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[content-map] view failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to load the content map" }, { status: 500 });
  }
}
