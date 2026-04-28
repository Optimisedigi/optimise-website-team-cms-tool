import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * GET /api/clients/[id]/google-ads-conversion-actions
 *
 * Returns the list of conversion actions available for this client's Google
 * Ads account, plus the currently saved default selection.
 *
 * Used by the admin Conversion Action Picker on the Client > Google Ads tab.
 *
 * Response:
 *   {
 *     available: string[],  // all conversion actions the customer has fired in last 730 days
 *     saved:     string[],  // names currently saved in client.dashboardConversionActions
 *     customerId: string,   // for display
 *   }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Auth check — admin tool, must be logged in
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load the client
  let client: any;
  try {
    client = await payload.findByID({
      collection: "clients",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (!client.googleAdsCustomerId) {
    return NextResponse.json(
      { error: "Client has no Google Ads customer ID set" },
      { status: 400 }
    );
  }

  // Parse currently saved selection (newline-separated textarea)
  const savedRaw: string = client.dashboardConversionActions || "";
  const saved = savedRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // Fetch available conversion actions from Growth Tools dashboard endpoint
  // (it returns availableConversionActions scoped to this customer over 730d).
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      {
        error: "Growth Tools service not configured",
        available: [],
        saved,
        customerId: client.googleAdsCustomerId,
      },
      { status: 503 }
    );
  }

  try {
    const cleanCid = String(client.googleAdsCustomerId).replace(/-/g, "");
    const qs = new URLSearchParams({
      range: "this_month",
      customerId: cleanCid,
      clientName: client.name || "",
    });
    const url = `${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${encodeURIComponent(client.slug || "")}?${qs}`;

    const res = await fetch(url, {
      headers: { "x-internal-key": INTERNAL_API_KEY },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Growth Tools returned ${res.status}: ${body.slice(0, 300)}`,
          available: [],
          saved,
          customerId: client.googleAdsCustomerId,
        },
        { status: 502 }
      );
    }

    const data = await res.json();
    const available: string[] = Array.isArray(data?.availableConversionActions)
      ? data.availableConversionActions
      : [];

    return NextResponse.json({
      available,
      saved,
      customerId: client.googleAdsCustomerId,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to fetch conversion actions: ${err instanceof Error ? err.message : String(err)}`,
        available: [],
        saved,
        customerId: client.googleAdsCustomerId,
      },
      { status: 500 }
    );
  }
}
