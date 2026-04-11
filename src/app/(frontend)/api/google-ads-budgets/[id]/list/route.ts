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

  const { customerId } = audit;
  if (!customerId) {
    return NextResponse.json(
      { error: "Missing required field: customerId" },
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

      // Store/update each campaign budget in the CMS collection
      for (const campaign of campaigns) {
        await payload.create({
          collection: BUDGETS_COLLECTION,
          data: {
            audit: id,
            customerId: customerId,
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            dailyBudget: campaign.dailyBudget,
            bidStrategy: campaign.bidStrategy || "manual_cpc",
            bidStrategyId: campaign.bidStrategyId,
            locationIds: campaign.locationIds || [],
            locationNames: campaign.locationNames || [],
            metricsLastUpdated: new Date().toISOString(),
            impressions: campaign.impressions || 0,
            clicks: campaign.clicks || 0,
            avgCpc: campaign.avgCpc || 0,
            conversions: campaign.conversions || 0,
          } as any,
          overrideAccess: true,
        }).catch(() => {
          // Record may already exist - update instead
          return payload.find({
            collection: BUDGETS_COLLECTION,
            where: {
              audit: { equals: id },
              campaignId: { equals: campaign.campaignId },
            },
            limit: 1,
            overrideAccess: true,
          }).then(async (existing) => {
            if (existing.totalDocs > 0) {
              await payload.update({
                collection: BUDGETS_COLLECTION,
                id: existing.docs[0].id,
                data: {
                  dailyBudget: campaign.dailyBudget,
                  bidStrategy: campaign.bidStrategy || "manual_cpc",
                  bidStrategyId: campaign.bidStrategyId,
                  locationIds: campaign.locationIds || [],
                  locationNames: campaign.locationNames || [],
                  metricsLastUpdated: new Date().toISOString(),
                  impressions: campaign.impressions || 0,
                  clicks: campaign.clicks || 0,
                  avgCpc: campaign.avgCpc || 0,
                  conversions: campaign.conversions || 0,
                },
                overrideAccess: true,
              });
            } else {
              await payload.create({
                collection: BUDGETS_COLLECTION,
                data: {
                  audit: id,
                  customerId: customerId,
                  campaignId: campaign.campaignId,
                  campaignName: campaign.campaignName,
                  dailyBudget: campaign.dailyBudget,
                  bidStrategy: campaign.bidStrategy || "manual_cpc",
                  bidStrategyId: campaign.bidStrategyId,
                  locationIds: campaign.locationIds || [],
                  locationNames: campaign.locationNames || [],
                  metricsLastUpdated: new Date().toISOString(),
                  impressions: campaign.impressions || 0,
                  clicks: campaign.clicks || 0,
                  avgCpc: campaign.avgCpc || 0,
                  conversions: campaign.conversions || 0,
                },
                overrideAccess: true,
              });
            }
          });
        });
      }

      return NextResponse.json({
        success: true,
        campaigns,
        totalCount: campaigns.length,
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
