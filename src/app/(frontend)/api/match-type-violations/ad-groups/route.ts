import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

interface AdGroupRow {
  adGroupId?: string;
  adGroupName?: string;
  campaignId?: string;
  campaignName?: string;
  status?: string;
  campaignStatus?: string;
  campaignEndDate?: string;
}

/**
 * GET /api/match-type-violations/ad-groups?client=<id>
 *
 * Lists the client's Google Ads ad groups (id, name, campaign) via Growth
 * Tools, for the Dismissed-tab ad-group picker. Payload session required.
 */
export async function GET(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = req.nextUrl.searchParams.get("client");
  if (!clientId) {
    return NextResponse.json({ error: "client is required" }, { status: 400 });
  }

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const clientDoc = await (payload.findByID as any)({
    collection: "clients",
    id: clientId,
    depth: 0,
    overrideAccess: true,
  }).catch(() => null);

  const customerId = String(clientDoc?.googleAdsCustomerId ?? "").replace(/-/g, "");
  if (!customerId) {
    return NextResponse.json(
      { error: "Client has no Google Ads customer ID" },
      { status: 400 },
    );
  }

  let res: Response;
  try {
    res = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/ad-groups/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({ customerId }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Network error calling Growth Tools: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const errMsg =
      data && typeof data === "object" && (data as { error?: unknown }).error
        ? String((data as { error?: unknown }).error)
        : `Growth Tools HTTP ${res.status}`;
    return NextResponse.json({ error: errMsg }, { status: 502 });
  }

  const adGroups: AdGroupRow[] = Array.isArray((data as any)?.adGroups)
    ? (data as any).adGroups
    : [];

  const today = new Date().toISOString().slice(0, 10);
  return NextResponse.json({
    adGroups: adGroups
      .filter((g) => {
        if (!g.adGroupId) return false;
        if (String(g.status ?? "").toUpperCase() !== "ENABLED") return false;
        const campaignStatus = String(g.campaignStatus ?? "ENABLED").toUpperCase();
        if (campaignStatus !== "ENABLED") return false;
        const endDate = String(g.campaignEndDate ?? "").trim();
        return !endDate || endDate >= today;
      })
      .map((g) => ({
        adGroupId: String(g.adGroupId),
        adGroupName: String(g.adGroupName ?? ""),
        campaignName: String(g.campaignName ?? ""),
        status: String(g.status ?? ""),
        campaignStatus: String(g.campaignStatus ?? ""),
        campaignEndDate: String(g.campaignEndDate ?? ""),
      })),
  });
}
