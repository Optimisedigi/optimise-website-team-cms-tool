import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * GET /api/negative-keyword-lists/campaigns?clientId=1
 * Fetches campaign and ad group names from Google Ads via Growth Tools.
 */
export async function GET(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = request.nextUrl.searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const client = await payload.findByID({
      collection: "clients",
      id: Number(clientId),
      overrideAccess: true,
    });

    const customerId = (client as any).googleAdsCustomerId;
    if (!customerId) {
      return NextResponse.json({ error: "Client has no Google Ads Customer ID" }, { status: 400 });
    }

    if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
      return NextResponse.json({ error: "Growth Tools not configured" }, { status: 503 });
    }

    // Fetch campaign structure from Growth Tools
    const cleanCustomerId = customerId.replace(/-/g, "");
    let res: Response;
    try {
      res = await fetch(
        `${GROWTH_TOOLS_URL}/api/google-ads/campaigns?customerId=${cleanCustomerId}`,
        {
          headers: { "x-internal-key": INTERNAL_API_KEY },
          signal: AbortSignal.timeout(30000),
        },
      );
    } catch (fetchErr) {
      console.error("[negative-keyword-lists/campaigns] Growth Tools fetch failed:", fetchErr);
      return NextResponse.json({
        ok: true,
        campaigns: [],
        note: "Could not reach Growth Tools. The endpoint may not be deployed yet. You can type the campaign name manually.",
      });
    }

    if (!res.ok) {
      // If Growth Tools doesn't have this endpoint yet, return empty with a note
      const text = await res.text().catch(() => "");
      console.error(`[negative-keyword-lists/campaigns] Growth Tools returned ${res.status}: ${text}`);
      return NextResponse.json({
        ok: true,
        campaigns: [],
        note: res.status === 404
          ? "Campaign listing endpoint not yet deployed in Growth Tools. You can type the campaign name manually."
          : `Growth Tools error (${res.status}). You can type the campaign name manually.`,
      });
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, campaigns: data.campaigns || [] });
  } catch (err) {
    console.error("[negative-keyword-lists/campaigns] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch campaigns", details: String(err) },
      { status: 500 },
    );
  }
}
