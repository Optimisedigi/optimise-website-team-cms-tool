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

  // Fetch conversion actions from the lightweight Growth Tools endpoint.
  // Do not call the full dashboard endpoint here: unrelated dashboard GAQL
  // permission errors can fail even when the picker only needs action names.
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
    const warnings: string[] = [];
    let available: string[] = [];
    let catalog: string[] = [];

    const catalogUrl = `${GROWTH_TOOLS_URL}/api/google-ads/conversion-actions/${cleanCid}`;
    const catalogRes = await fetch(catalogUrl, {
      headers: { "x-internal-key": INTERNAL_API_KEY },
      cache: "no-store",
    });

    if (!catalogRes.ok) {
      const body = await catalogRes.text().catch(() => "");
      warnings.push(`Growth Tools conversion actions returned ${catalogRes.status}: ${body.slice(0, 300)}`);
    } else {
      const catalogData = await catalogRes.json();
      available = Array.isArray(catalogData?.availableConversionActions)
        ? catalogData.availableConversionActions
        : [];
      catalog = Array.isArray(catalogData?.conversionActions)
        ? catalogData.conversionActions
            .map((a: { name?: string }) => String(a?.name || "").trim())
            .filter(Boolean)
        : [];
      if (Array.isArray(catalogData?.warnings)) {
        warnings.push(...catalogData.warnings.map(String));
      }
    }

    return NextResponse.json({
      available,
      catalog,
      saved,
      customerId: client.googleAdsCustomerId,
      warnings,
    });
  } catch (err) {
    return NextResponse.json({
      available: [],
      catalog: [],
      saved,
      customerId: client.googleAdsCustomerId,
      warnings: [`Growth Tools conversion actions fetch failed: ${err instanceof Error ? err.message : String(err)}`],
    });
  }
}
