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
    const res = await fetch(
      `${GROWTH_TOOLS_URL}/api/google-ads/campaigns?customerId=${cleanCustomerId}`,
      {
        headers: { "x-internal-key": INTERNAL_API_KEY },
        next: { revalidate: 0 },
      },
    );

    if (!res.ok) {
      // If Growth Tools doesn't have this endpoint yet, return empty
      if (res.status === 404) {
        return NextResponse.json({ ok: true, campaigns: [], note: "Campaign listing not yet available in Growth Tools" });
      }
      const text = await res.text();
      return NextResponse.json({ error: `Growth Tools: ${text}` }, { status: res.status });
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
