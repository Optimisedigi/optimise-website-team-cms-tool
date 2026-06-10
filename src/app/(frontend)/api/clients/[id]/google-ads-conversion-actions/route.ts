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
 *     available: string[],  // conversion actions the customer has fired in last 730 days (metrics-driven)
 *     catalog:   string[],  // ALL conversion actions defined for the account, incl. zero-conversion ones
 *     saved:     string[],  // names currently saved in client.dashboardConversionActions
 *     customerId: string,   // for display
 *   }
 *
 * `available` powers the checkbox list (things that actually have data).
 * `catalog` powers the manual-add autocomplete so the team can pick exact
 * action names that have never recorded a conversion yet.
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

  // Fetch available conversion actions from Growth Tools dashboard endpoint.
  // We request the widest range (all_time) because availableConversionActions
  // is scoped to the requested range: a short range (e.g. this_month) hides
  // actions that haven't fired recently, so the picker would miss valid
  // conversion actions the account still uses.
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
      range: "all_time",
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

    // Fetch the full catalog of DEFINED conversion actions (including ones that
    // have never fired) so the picker can offer exact names as autocomplete.
    // Best-effort: a failure here must not break the metrics-driven list.
    let catalog: string[] = [];
    try {
      const catalogUrl = `${GROWTH_TOOLS_URL}/api/google-ads/conversion-actions/${cleanCid}`;
      const catalogRes = await fetch(catalogUrl, {
        headers: { "x-internal-key": INTERNAL_API_KEY },
        cache: "no-store",
      });
      if (catalogRes.ok) {
        const catalogData = await catalogRes.json();
        catalog = Array.isArray(catalogData?.conversionActions)
          ? catalogData.conversionActions
              .map((a: { name?: string }) => String(a?.name || "").trim())
              .filter(Boolean)
          : [];
      }
    } catch {
      // Ignore — catalog is an enhancement, not required.
    }

    return NextResponse.json({
      available,
      catalog,
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
