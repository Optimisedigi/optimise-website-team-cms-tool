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
  const auditId = Number(id);

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

  // Read the client's default conversion actions (stored newline-separated on the
  // Clients collection, set via the Default Conversion Actions picker on the Google
  // Ads tab). Growth Tools uses these to filter metrics.conversions per campaign so
  // the Budget Management tab matches what the user expects — same scoping the
  // dashboard uses.
  const dashboardConversionActions: string = linkedClient?.dashboardConversionActions || "";
  const conversionActions: string[] = dashboardConversionActions
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // If Growth Tools URL is configured, fetch from there
  if (GROWTH_TOOLS_URL && INTERNAL_API_KEY) {
    try {
      // Fetch THIS_MONTH data for actual MTD spend
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
            dateRange: "THIS_MONTH",
            ...(conversionActions.length > 0 && { conversionActions }),
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
      const isActive = (status: string) => status !== 'PAUSED' && status !== 'REMOVED';

      for (const campaign of campaigns) {
        const cmsData: Record<string, any> = {
          audit: auditId,
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
              audit: { equals: auditId },
              campaignId: { equals: campaign.campaignId },
            },
            limit: 1,
            overrideAccess: true,
          });

          if (existing.totalDocs > 0) {
            const doc = existing.docs[0] as any;
            const { audit: _a, customerId: _c, campaignId: _ci, campaignName: _cn, ...updateData } = cmsData;
            // If user hasn't configured this campaign (no budget %), sync enabled from Google Ads status
            if (!doc.budgetPercentage || doc.budgetPercentage === 0) {
              updateData.enabled = isActive(campaign.campaignStatus);
            }
            await payload.update({
              collection: BUDGETS_COLLECTION,
              id: doc.id,
              data: updateData,
              overrideAccess: true,
            });
          } else {
            // New record: set enabled from Google Ads campaign status
            (cmsData as any).enabled = isActive(campaign.campaignStatus);
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

      // Read saved CMS records so we can merge user-set allocations back in
      let savedMap = new Map<string, any>();
      try {
        const saved = await payload.find({
          collection: BUDGETS_COLLECTION,
          where: { audit: { equals: auditId } },
          limit: 100,
          overrideAccess: true,
        });
        for (const doc of saved.docs) {
          savedMap.set((doc as any).campaignId, doc);
        }
      } catch { /* no saved data */ }

      // Normalize for frontend component, merging saved allocations
      const normalized = campaigns.map((c: any) => {
        const saved = savedMap.get(c.campaignId);
        return {
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          budgetPercentage: saved?.budgetPercentage ?? 0,
          calculatedDailyBudget: saved?.calculatedDailyBudget ?? (c.dailyBudget || 0),
          actualDailyBudget: c.dailyBudget || 0,
          bidStrategy: mapBidStrategy(c.biddingStrategyType || c.bidStrategy || ""),
          bidStrategyId: c.biddingStrategyId || c.bidStrategyId || null,
          enabled: saved
            ? (saved.enabled !== undefined ? saved.enabled : (saved.budgetPercentage > 0))
            : (c.campaignStatus !== 'PAUSED' && c.campaignStatus !== 'REMOVED'),
          impressions: c.impressions || 0,
          clicks: c.clicks || 0,
          avgCpc: c.avgCpc || 0,
          conversions: c.conversions || 0,
          mtdSpend: c.cost || 0, // Actual MTD spend from Google Ads
          campaignStatus: c.campaignStatus,
          channelType: c.channelType,
        };
      });

      return NextResponse.json({
        success: true,
        campaigns: normalized,
        totalCount: normalized.length,
        monthlyBudget: audit.monthlyBudget || 0,
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
      where: { audit: { equals: auditId } },
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
