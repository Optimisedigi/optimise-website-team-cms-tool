import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// Collection slug type (use 'as any' to bypass strict type checking for new collections)
const BUDGETS_COLLECTION = "google-ads-campaign-budgets" as any;

/**
 * GET /api/google-ads-budgets/[id]/list
 * List campaign budgets with 30-day metrics for a Google Ads audit.
 * Updates the GoogleAdsCampaignBudgets collection with the data.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the audit record
  let audit: any;
  try {
    audit = await payload.findByID({
      collection: "google-ads-audits",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Prefer client account ID over audit's (which may be MCC)
  let customerId = audit.customerId;
  if (audit.client) {
    try {
      const clientId = typeof audit.client === 'object' ? audit.client.id : audit.client;
      const client = typeof audit.client === 'object' ? audit.client : await payload.findByID({
        collection: "clients",
        id: clientId,
        overrideAccess: true,
      });
      if (client?.googleAdsCustomerId) {
        customerId = client.googleAdsCustomerId;
      }
    } catch { /* client lookup failed, use audit customerId */ }
  }
  if (!customerId) {
    return NextResponse.json(
      { error: "No Google Ads customer ID found on audit or linked client" },
      { status: 400 }
    );
  }

  // If Growth Tools URL is configured, fetch from there
  if (GROWTH_TOOLS_URL && INTERNAL_API_KEY) {
    try {
      const response = await fetch(
        `${GROWTH_TOOLS_URL}/api/google-ads/campaign-budgets/list`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-key": INTERNAL_API_KEY!,
          },
          body: JSON.stringify({
            customerId: customerId.replace(/-/g, ""),
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        if (errorBody.includes("REQUESTED_METRICS_FOR_MANAGER")) {
          return NextResponse.json(
            { error: "This is a manager (MCC) account. Enter the client account ID instead — find it under the MCC in Google Ads." },
            { status: 400 }
          );
        }
        throw new Error(
          `Growth tools error (${response.status}): ${errorBody}`
        );
      }

      const result = await response.json();
      const campaigns = result.campaigns || [];

      // Map Growth Tools bid strategy names to collection values
      function mapBidStrategy(raw: string): string {
        const map: Record<string, string> = {
          MANUAL_CPC: "manual_cpc",
          MAXIMIZE_CONVERSIONS: "maximize_conversions",
          MAXIMIZE_CONVERSION_VALUE: "maximize_conversion_value",
          TARGET_CPA: "target_cpa",
          TARGET_ROAS: "target_roas",
          TARGET_IMPRESSION_SHARE: "target_impressions",
          MAXIMIZE_CLICKS: "maximize_clicks",
        };
        return map[raw] || map[raw?.toUpperCase()] || "manual_cpc";
      }

      // Store/update each campaign budget in CMS
      for (const campaign of campaigns) {
        const cmsData: Record<string, any> = {
          audit: id,
          customerId: customerId,
          campaignId: campaign.campaignId,
          campaignName: campaign.campaignName,
          actualDailyBudget: campaign.dailyBudget || 0,
          bidStrategy: mapBidStrategy(campaign.biddingStrategyType || campaign.bidStrategy || ""),
          bidStrategyId: campaign.biddingStrategyId || campaign.bidStrategyId || null,
          locationIds: (campaign.locationIds || []).map((lid: string) => ({ locationId: lid })),
          locationNames: (campaign.locationNames || []).map((n: string) => ({ name: n })),
          metricsLastUpdated: new Date().toISOString(),
          impressions: campaign.impressions || 0,
          clicks: campaign.clicks || 0,
          avgCpc: campaign.avgCpc || 0,
          conversions: campaign.conversions || 0,
        };

        try {
          const existing = await payload.find({
            collection: BUDGETS_COLLECTION,
            where: {
              audit: { equals: id },
              campaignId: { equals: campaign.campaignId },
            },
            limit: 1,
            overrideAccess: true,
          });

          if (existing.totalDocs > 0) {
            const { audit: _a, customerId: _c, campaignId: _ci, campaignName: _cn, ...updateData } = cmsData;
            await payload.update({
              collection: BUDGETS_COLLECTION,
              id: existing.docs[0].id,
              data: updateData,
              overrideAccess: true,
            });
          } else {
            await payload.create({
              collection: BUDGETS_COLLECTION,
              data: cmsData as any,
              overrideAccess: true,
            });
          }
        } catch (e: any) {
          console.error(`[GoogleAdsBudgets] Failed to save campaign ${campaign.campaignId}:`, e.message);
        }
      }

      // Normalize for frontend component
      const normalized = campaigns.map((c: any) => ({
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        budgetPercentage: 0, // User sets this in UI
        calculatedDailyBudget: c.dailyBudget || 0,
        actualDailyBudget: c.dailyBudget || 0,
        bidStrategy: mapBidStrategy(c.biddingStrategyType || c.bidStrategy || ""),
        bidStrategyId: c.biddingStrategyId || c.bidStrategyId || null,
        impressions: c.impressions || 0,
        clicks: c.clicks || 0,
        avgCpc: c.avgCpc || 0,
        conversions: c.conversions || 0,
        campaignStatus: c.campaignStatus,
        channelType: c.channelType,
      }));

      return NextResponse.json({
        success: true,
        campaigns: normalized,
        totalCount: normalized.length,
      });
    } catch (e: any) {
      console.error("[GoogleAdsBudgets] List error:", e.message);
      return NextResponse.json(
        { error: `Failed to fetch budgets: ${e.message}` },
        { status: 500 }
      );
    }
  }

  // Fallback: return cached data from CMS collection
  try {
    const cachedBudgets = await payload.find({
      collection: BUDGETS_COLLECTION,
      where: { audit: { equals: id } },
      limit: 100,
      overrideAccess: true,
    });

    return NextResponse.json({
      success: true,
      campaigns: cachedBudgets.docs,
      totalCount: cachedBudgets.totalDocs,
      source: "cache",
    });
  } catch (e: any) {
    console.error("[GoogleAdsBudgets] Cache fetch error:", e.message);
    return NextResponse.json(
      { error: `Failed to fetch cached budgets: ${e.message}` },
      { status: 500 }
    );
  }
}
