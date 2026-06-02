import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { hasValidApiKey } from "@/collections/api-key-access";

/**
 * GET /api/google-ads-budgets/[id]/ad-groups?campaignId=...
 *
 * Returns ad groups for a single campaign on the audit's linked Google Ads
 * account, including per-ad-group `searchImpressionShare` /
 * `searchBudgetLostIS` so the Budget Management table can surface a
 * "Limited by budget" badge at the ad-group level as well.
 *
 * Proxies to Growth Tools at `GET /api/google-ads/ad-groups/list` with the
 * resolved customerId + campaignId. If Growth Tools doesn't yet expose that
 * endpoint (404), the upstream error is surfaced verbatim so the team knows
 * what's missing rather than seeing a silent failure.
 */
export const maxDuration = 30;

interface AdGroupRow {
  adGroupId: string;
  adGroupName: string;
  status?: string;
  impressions: number;
  clicks: number;
  avgCpc: number;
  conversions: number;
  cost: number;
  searchImpressionShare?: number;
  searchBudgetLostIS?: number;
}

function parseImpressionShare(value: unknown): number | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return undefined;
    return value > 1 ? value / 100 : value;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "--" || trimmed === "< 10%") return undefined;
  const numeric = Number(trimmed.replace(/[%<>,\s]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return trimmed.includes("%") || numeric > 1 ? numeric / 100 : numeric;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auditId = Number(id);
  if (!Number.isFinite(auditId)) {
    return NextResponse.json({ error: "Invalid audit id" }, { status: 400 });
  }

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  if (!campaignId) {
    return NextResponse.json(
      { error: "Missing campaignId query parameter" },
      { status: 400 },
    );
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user && !hasValidApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const growthToolsUrl = process.env.GROWTH_TOOLS_URL;
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!growthToolsUrl || !internalApiKey) {
    return NextResponse.json(
      {
        error:
          "Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY",
      },
      { status: 500 },
    );
  }

  let audit: any;
  try {
    audit = await payload.findByID({
      collection: "google-ads-audits",
      id: auditId,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Mirror the list route's customer ID resolution: prefer the linked
  // client's googleAdsCustomerId, fall back to the audit's own.
  let customerId: string | undefined = audit.customerId;
  let linkedClient: any = null;
  if (audit.client) {
    try {
      const clientId =
        typeof audit.client === "object" ? audit.client.id : audit.client;
      linkedClient =
        typeof audit.client === "object"
          ? audit.client
          : await payload.findByID({
              collection: "clients",
              id: clientId,
              overrideAccess: true,
            });
      if (linkedClient?.googleAdsCustomerId) {
        customerId = linkedClient.googleAdsCustomerId;
      }
    } catch {
      /* fall through with audit.customerId */
    }
  }
  if (!customerId) {
    return NextResponse.json(
      { error: "No Google Ads customer ID found on audit or linked client" },
      { status: 400 },
    );
  }

  const dashboardConversionActions: string =
    linkedClient?.dashboardConversionActions || "";
  const conversionActions: string[] = dashboardConversionActions
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let upstream: Response;
  try {
    upstream = await fetch(
      `${growthToolsUrl}/api/google-ads/ad-groups/list`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": internalApiKey,
        },
        body: JSON.stringify({
          customerId: customerId.replace(/-/g, ""),
          campaignId,
          dateRange: "THIS_MONTH",
          ...(conversionActions.length > 0 && { conversionActions }),
        }),
      },
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: `Failed to reach Growth Tools: ${err?.message || "network error"}`,
      },
      { status: 502 },
    );
  }

  if (upstream.status === 404) {
    return NextResponse.json(
      {
        error:
          "Growth Tools doesn't expose /api/google-ads/ad-groups/list yet — the ad-group view will work once that endpoint ships.",
      },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      {
        error: `Growth Tools failed (${upstream.status})${
          detail ? `: ${detail.slice(0, 240)}` : ""
        }`,
      },
      { status: 502 },
    );
  }

  let body: any;
  try {
    body = await upstream.json();
  } catch {
    return NextResponse.json(
      { error: "Growth Tools returned a non-JSON response." },
      { status: 502 },
    );
  }

  const rawAdGroups: any[] = Array.isArray(body?.adGroups)
    ? body.adGroups
    : Array.isArray(body)
    ? body
    : [];

  // Sort by impressions desc so the biggest first inside the expanded panel.
  // Stable tiebreak on name keeps test/snapshot output deterministic.
  const adGroups: AdGroupRow[] = rawAdGroups
    .map((ag: any) => {
      const rawSearchIS =
        ag.searchImpressionShare ?? ag.search_impression_share;
      const rawBudgetLostIS =
        ag.searchBudgetLostIS ??
        ag.search_budget_lost_impression_share ??
        ag.budgetLostImpressionShare;
      return {
        adGroupId: String(ag.adGroupId ?? ag.id ?? ""),
        adGroupName: String(ag.adGroupName ?? ag.name ?? ""),
        status: ag.status ?? ag.adGroupStatus,
        impressions: Number(ag.impressions ?? 0),
        clicks: Number(ag.clicks ?? 0),
        avgCpc: Number(ag.avgCpc ?? 0),
        conversions: Number(ag.conversions ?? 0),
        cost: Number(ag.cost ?? ag.mtdSpend ?? 0),
        searchImpressionShare: parseImpressionShare(rawSearchIS),
        searchBudgetLostIS: parseImpressionShare(rawBudgetLostIS),
      };
    })
    .filter((ag) => ag.adGroupId)
    .sort((a, b) => {
      const impDiff = b.impressions - a.impressions;
      if (impDiff !== 0) return impDiff;
      return a.adGroupName.localeCompare(b.adGroupName);
    });

  return NextResponse.json({ ok: true, campaignId, adGroups });
}
