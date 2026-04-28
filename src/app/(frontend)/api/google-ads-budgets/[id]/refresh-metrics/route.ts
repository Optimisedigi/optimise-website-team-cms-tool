import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const BUDGETS_COLLECTION: any = "google-ads-campaign-budgets";

interface RefreshMetricsRequest {
  campaignIds?: string[];
  dateRange?: string; // e.g., "LAST_30_DAYS", "LAST_7_DAYS", "LAST_90_DAYS"
}

/**
 * POST /api/google-ads-budgets/[id]/refresh-metrics
 * Refresh performance metrics for specific campaigns.
 * Updates the GoogleAdsCampaignBudgets collection.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auditId = Number(id);

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: RefreshMetricsRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { campaignIds, dateRange = "LAST_30_DAYS" } = body;

  // Fetch the audit record
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

  // Prefer client account ID over audit's (which may be MCC).
  // Also capture the linked client so we can read its default conversion actions.
  let customerId = audit.customerId;
  let linkedClient: any = null;
  if (audit.client) {
    try {
      const clientId = typeof audit.client === 'object' ? audit.client.id : audit.client;
      linkedClient = typeof audit.client === 'object' ? audit.client : await payload.findByID({
        collection: "clients",
        id: clientId,
        overrideAccess: true,
      });
      if (linkedClient?.googleAdsCustomerId) {
        customerId = linkedClient.googleAdsCustomerId;
      }
    } catch { /* client lookup failed, use audit customerId */ }
  }
  if (!customerId) {
    return NextResponse.json(
      { error: "No Google Ads customer ID found on audit or linked client" },
      { status: 400 }
    );
  }

  // Read the client's default conversion actions (stored newline-separated on
  // the Clients collection). Growth Tools uses these to filter
  // metrics.conversions per campaign.
  const dashboardConversionActions: string = linkedClient?.dashboardConversionActions || "";
  const conversionActions: string[] = dashboardConversionActions
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Get all campaign budgets if no specific IDs provided
  let budgetsToUpdate: any[] = [];
  try {
    const budgets = await payload.find({
      collection: BUDGETS_COLLECTION,
      where: { audit: { equals: auditId } },
      limit: 100,
      overrideAccess: true,
    });

    if (campaignIds && campaignIds.length > 0) {
      budgetsToUpdate = budgets.docs.filter((b: any) =>
        campaignIds.includes(b.campaignId)
      );
    } else {
      budgetsToUpdate = budgets.docs;
    }
  } catch (e: any) {
    console.error("[GoogleAdsBudgets] Failed to fetch budgets:", e.message);
    return NextResponse.json(
      { error: "Failed to fetch budget records" },
      { status: 500 }
    );
  }

  if (budgetsToUpdate.length === 0) {
    return NextResponse.json(
      { error: "No budget records found to update" },
      { status: 404 }
    );
  }

  // Fetch metrics from Growth Tools
  if (GROWTH_TOOLS_URL && INTERNAL_API_KEY) {
    try {
      // Build the Growth Tools URL with query params (was previously built from
      // req.url which pointed at the CMS itself — bug fix)
      const url = new URL(`${GROWTH_TOOLS_URL}/api/google-ads/campaign-budgets/get-metrics`);
      url.searchParams.set("customerId", customerId.replace(/-/g, ""));
      url.searchParams.set("dateRange", dateRange);
      if (campaignIds) {
        url.searchParams.set("campaignIds", campaignIds.join(","));
      }
      if (conversionActions.length > 0) {
        url.searchParams.set("conversionActions", conversionActions.join(","));
      }

      const metricsResponse = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "x-internal-key": INTERNAL_API_KEY!,
        },
      });

      if (!metricsResponse.ok) {
        const errorBody = await metricsResponse.text();
        if (errorBody.includes("REQUESTED_METRICS_FOR_MANAGER")) {
          return NextResponse.json(
            { error: "This is a manager (MCC) account. Enter the client account ID instead — find it under the MCC in Google Ads." },
            { status: 400 }
          );
        }
        throw new Error(
          `Growth tools metrics failed (${metricsResponse.status}): ${errorBody}`
        );
      }

      const { metrics } = await metricsResponse.json();
      const metricsByCampaign = new Map<string, any>(
        (metrics || []).map((m: any) => [m.campaignId, m])
      );

      // Update each budget with fresh metrics
      const updatedBudgets: any[] = [];
      const now = new Date().toISOString();

      for (const budget of budgetsToUpdate) {
        const freshMetrics: any = metricsByCampaign.get(budget.campaignId);

        if (freshMetrics) {
          await payload.update({
            collection: BUDGETS_COLLECTION,
            id: budget.id,
            data: {
              metricsLastUpdated: now,
              impressions: freshMetrics.impressions || 0,
              clicks: freshMetrics.clicks || 0,
              avgCpc: freshMetrics.avgCpc || 0,
              conversions: freshMetrics.conversions || 0,
            },
            overrideAccess: true,
          });

          updatedBudgets.push({
            campaignId: budget.campaignId,
            campaignName: budget.campaignName,
            impressions: freshMetrics.impressions || 0,
            clicks: freshMetrics.clicks || 0,
            avgCpc: freshMetrics.avgCpc || 0,
            conversions: freshMetrics.conversions || 0,
          });
        }
      }

      return NextResponse.json({
        success: true,
        updatedCount: updatedBudgets.length,
        budgets: updatedBudgets,
      });
    } catch (e: any) {
      console.error("[GoogleAdsBudgets] Refresh metrics error:", e.message);
      return NextResponse.json(
        { error: `Failed to refresh metrics: ${e.message}` },
        { status: 500 }
      );
    }
  }

  // Fallback: Return current metrics from cache
  return NextResponse.json({
    success: true,
    updatedCount: 0,
    budgets: budgetsToUpdate.map((b: any) => ({
      campaignId: b.campaignId,
      campaignName: b.campaignName,
      impressions: b.impressions || 0,
      clicks: b.clicks || 0,
      avgCpc: b.avgCpc || 0,
      conversions: b.conversions || 0,
    })),
    source: "cache",
    message: "Growth Tools not configured - returning cached metrics",
  });
}
