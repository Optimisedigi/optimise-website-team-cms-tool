import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../../verify/route";

/**
 * POST /api/dashboard/monthly-waste-relevancy/clear
 *
 * Wipes the per-month waste/relevancy cache for one client so the next
 * dashboard request re-fetches every month from Google Ads. Used after
 * adding NKL entries when the agency wants past months retroactively
 * credited (the auto-clear hook on `negative-keyword-lists` covers most
 * cases — this is the safety hatch).
 *
 * Auth: accepts EITHER a Payload admin session OR the `dashboard_token`
 * cookie (validated against the posted slug) — the "Refresh history" button
 * lives on the PIN-gated dashboard, where there is no admin session, so the
 * read endpoint's cookie auth is the right gate. The button is still only
 * rendered when a clientId is present (agency view).
 */
export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  let body: { clientId?: number | string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Either an authenticated admin session or a valid dashboard token for the
  // posted slug is accepted.
  const { user } = await payload.auth({ headers: req.headers });
  const token = req.cookies.get("dashboard_token")?.value;
  const slug = typeof body.slug === "string" ? body.slug : undefined;
  const hasDashboardToken = !!slug && validateDashboardToken(token, slug);
  if (!user && !hasDashboardToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = Number(body.clientId);
  if (!clientId || Number.isNaN(clientId)) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  // When authorised only by the dashboard token (no admin session), bind the
  // token's slug to the target clientId so a valid token for one client can't
  // wipe another client's cache. Admin sessions skip this — they may clear any
  // client.
  if (!user && hasDashboardToken) {
    const client = await payload.findByID({
      collection: "clients",
      id: clientId,
      depth: 0,
      overrideAccess: true,
    }).catch(() => null);
    if (!client || (client as { slug?: string }).slug !== slug) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await payload.delete({
      collection: "negative-keyword-monthly-waste-relevancy-cache",
      where: { client: { equals: clientId } },
      overrideAccess: true,
    });
    return NextResponse.json({
      success: true,
      cleared: Array.isArray(result?.docs) ? result.docs.length : 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to clear cache" },
      { status: 500 },
    );
  }
}
