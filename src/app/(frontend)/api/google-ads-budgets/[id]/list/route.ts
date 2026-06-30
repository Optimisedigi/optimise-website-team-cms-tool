import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { hasValidApiKey } from "@/collections/api-key-access";
import { isCampaignLifecycleActive } from "@/lib/google-ads-budget-email";

// Collection slug type (use 'as any' to bypass strict type checking for new collections)
const BUDGETS_COLLECTION = "google-ads-campaign-budgets" as any;

export const maxDuration = 300;

type BudgetMetricsRange = "THIS_MONTH" | "LAST_MONTH" | "LAST_30_DAYS" | "LAST_60_DAYS" | "LAST_180_DAYS";
type GrowthToolsDateRange = Exclude<BudgetMetricsRange, "LAST_180_DAYS">;

type GrowthToolsBudgetMetricsRequest = {
  dateRange: GrowthToolsDateRange;
  startDate?: string;
  endDate?: string;
};

function parseMetricsRange(value: string | null): BudgetMetricsRange {
  return value === "LAST_MONTH" || value === "LAST_30_DAYS" || value === "LAST_60_DAYS" || value === "LAST_180_DAYS"
    ? value
    : "THIS_MONTH";
}

function formatGoogleAdsDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getLast180DaysRequest(now = new Date()): GrowthToolsBudgetMetricsRequest {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 179);
  return {
    dateRange: "LAST_30_DAYS",
    startDate: formatGoogleAdsDate(start),
    endDate: formatGoogleAdsDate(end),
  };
}

function getGrowthToolsMetricsRequest(range: BudgetMetricsRange): GrowthToolsBudgetMetricsRequest {
  return range === "LAST_180_DAYS" ? getLast180DaysRequest() : { dateRange: range };
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

function buildRecommendationSignals(
  campaigns: any[],
  last60ByCampaign: Map<string, any>,
): Map<string, { action: "increase" | "decrease" | "hold"; score: number; reason: string; cpa: number | null; conversions: number }> {
  const rows = campaigns.map((campaign) => {
    const last60 = last60ByCampaign.get(String(campaign.campaignId)) ?? campaign;
    const conversions = numberValue(last60.conversions);
    const spend = numberValue(last60.cost ?? last60.spend);
    const cpa = conversions > 0 ? spend / conversions : null;
    const budgetPercentage = numberValue(campaign.budgetPercentage);
    return { campaign, conversions, spend, cpa, budgetPercentage };
  });

  const cpaValues = rows.map((row) => row.cpa).filter((value): value is number => value !== null && value > 0);
  const minCpa = cpaValues.length > 0 ? Math.min(...cpaValues) : 0;
  const maxCpa = cpaValues.length > 0 ? Math.max(...cpaValues) : 0;
  const maxConversions = rows.reduce((max, row) => Math.max(max, row.conversions), 0);
  const totalBudgetPercentage = rows.reduce((sum, row) => sum + Math.max(0, row.budgetPercentage), 0) || 100;

  const rawScores = rows.map((row) => {
    const convScore = maxConversions > 0 ? row.conversions / maxConversions : 0;
    let cpaScore = 0;
    if (row.cpa !== null && row.cpa > 0) {
      cpaScore = maxCpa === minCpa ? 1 : (maxCpa - row.cpa) / (maxCpa - minCpa);
    }
    return {
      ...row,
      performanceScore: row.conversions > 0 ? (convScore * 0.45) + (cpaScore * 0.55) : 0,
    };
  });

  const totalPerformanceScore = rawScores.reduce((sum, row) => sum + row.performanceScore, 0);
  const signals = new Map<string, { action: "increase" | "decrease" | "hold"; score: number; reason: string; cpa: number | null; conversions: number }>();

  for (const row of rawScores) {
    const currentShare = Math.max(0, row.budgetPercentage) / totalBudgetPercentage;
    const deservedShare = totalPerformanceScore > 0 ? row.performanceScore / totalPerformanceScore : currentShare;
    const score = Math.round((deservedShare - currentShare) * 1000) / 10;
    const action = score >= 5 ? "increase" : score <= -5 ? "decrease" : "hold";
    const cpaText = row.cpa === null ? "no CPA" : `$${row.cpa.toFixed(0)} CPA`;
    const reason = action === "increase"
      ? `Increase: last 60 days show ${row.conversions.toFixed(0)} conversions at ${cpaText}, stronger than its current allocation.`
      : action === "decrease"
        ? `Decrease: last 60 days performance is weaker than its current allocation (${row.conversions.toFixed(0)} conversions, ${cpaText}).`
        : `Hold: last 60 days performance broadly matches its current allocation (${row.conversions.toFixed(0)} conversions, ${cpaText}).`;
    signals.set(String(row.campaign.campaignId), { action, score, reason, cpa: row.cpa, conversions: row.conversions });
  }

  return signals;
}

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
  const metricsRange = parseMetricsRange(req.nextUrl.searchParams.get("range"));
  const reportOnly = req.nextUrl.searchParams.get("reportOnly") === "1";
  const competitiveRange: BudgetMetricsRange = metricsRange === "THIS_MONTH" ? "LAST_30_DAYS" : metricsRange;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user && !hasValidApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch only stable audit columns. Payload findByID selects every
  // google_ads_audits field, so schema drift in unrelated proposal columns can
  // break budget pacing before this route reads customer/budget data.
  let audit: any;
  try {
    const dbClient = (payload.db as unknown as { client?: { execute: (sql: string) => Promise<{ rows?: Array<Record<string, unknown>> }> } }).client;
    const result = await dbClient?.execute(
      `SELECT id, customer_id, client_id, monthly_budget FROM google_ads_audits WHERE id = ${auditId} LIMIT 1`,
    );
    const row = result?.rows?.[0];
    if (!row) throw new Error("Audit not found");
    audit = {
      id: row.id,
      customerId: row.customer_id,
      client: row.client_id,
      monthlyBudget: row.monthly_budget,
    };
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
        depth: 0,
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
  const growthToolsUrl = process.env.GROWTH_TOOLS_URL;
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (growthToolsUrl && internalApiKey) {
    const resolvedInternalApiKey = internalApiKey;
    try {
      async function fetchCampaignBudgetMetrics(range: BudgetMetricsRange) {
        const metricsRequest = getGrowthToolsMetricsRequest(range);
        const response = await fetch(
          `${growthToolsUrl}/api/google-ads/campaign-budgets/list`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-key": resolvedInternalApiKey,
            },
            body: JSON.stringify({
              customerId: customerId.replace(/-/g, ""),
              ...metricsRequest,
              ...(conversionActions.length > 0 && { conversionActions }),
            }),
          }
        );
        return response;
      }

      const response = await fetchCampaignBudgetMetrics(metricsRange);

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

      const competitiveByCampaign = new Map<string, any>();
      if (!reportOnly && competitiveRange !== metricsRange) {
        try {
          const competitiveResponse = await fetchCampaignBudgetMetrics(competitiveRange);
          if (competitiveResponse.ok) {
            const competitiveResult = await competitiveResponse.json();
            for (const campaign of competitiveResult.campaigns || []) {
              competitiveByCampaign.set(String(campaign.campaignId), campaign);
            }
          }
        } catch {
          /* Competitive metrics are helpful but non-critical. */
        }
      }

      const last60ByCampaign = new Map<string, any>();
      if (!reportOnly) {
        try {
          const last60Response = await fetchCampaignBudgetMetrics("LAST_60_DAYS");
          if (last60Response.ok) {
            const last60Result = await last60Response.json();
            for (const campaign of last60Result.campaigns || []) {
              last60ByCampaign.set(String(campaign.campaignId), campaign);
            }
          }
        } catch {
          /* Recommendation signal falls back to saved recommendation fields. */
        }
      }

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

      // Store/update each campaign budget in CMS. Google Ads experiments can stay
      // ENABLED after their end date, so lifecycle active means status + dates.
      const isActive = (campaign: any) => isCampaignLifecycleActive({
        campaignName: campaign.campaignName,
        campaignStatus: campaign.campaignStatus,
        campaignStartDate: campaign.campaignStartDate ?? campaign.campaign_start_date ?? null,
        campaignEndDate: campaign.campaignEndDate ?? campaign.campaign_end_date ?? null,
      });

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
              updateData.enabled = isActive(campaign);
            }
            await payload.update({
              collection: BUDGETS_COLLECTION,
              id: doc.id,
              data: updateData,
              overrideAccess: true,
            });
          } else {
            // New record: set enabled from Google Ads campaign status and active dates
            (cmsData as any).enabled = isActive(campaign);
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

      const campaignsForSignals = campaigns.map((campaign: any) => ({
        ...campaign,
        budgetPercentage: savedMap.get(campaign.campaignId)?.budgetPercentage ?? 0,
      }));
      const recommendationSignals = buildRecommendationSignals(campaignsForSignals, last60ByCampaign);

      // Normalize for frontend component, merging saved allocations.
      // `searchImpressionShare` and `searchBudgetLostIS` are pass-through from
      // Growth Tools when present (Search/Shopping). They power the
      // "Limited by budget" badge — absent values just hide the badge.
      const normalized = campaigns.map((c: any) => {
        const saved = savedMap.get(c.campaignId);
        // Growth Tools may emit either snake_case or camelCase; accept both.
        const competitive = competitiveByCampaign.get(String(c.campaignId));
        const signal = recommendationSignals.get(String(c.campaignId));
        const rawSearchIS =
          competitive?.searchImpressionShare ??
          competitive?.search_impression_share ??
          c.searchImpressionShare ?? c.search_impression_share;
        const rawBudgetLostIS =
          competitive?.searchBudgetLostIS ??
          competitive?.search_budget_lost_impression_share ??
          competitive?.budgetLostImpressionShare ??
          c.searchBudgetLostIS ??
          c.search_budget_lost_impression_share ??
          c.budgetLostImpressionShare;
        const lifecycleActive = isActive(c);
        return {
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          campaignStartDate: c.campaignStartDate ?? c.campaign_start_date ?? null,
          campaignEndDate: c.campaignEndDate ?? c.campaign_end_date ?? null,
          budgetPercentage: saved?.budgetPercentage ?? 0,
          calculatedDailyBudget: saved?.calculatedDailyBudget ?? (c.dailyBudget || 0),
          actualDailyBudget: c.dailyBudget || 0,
          bidStrategy: mapBidStrategy(c.biddingStrategyType || c.bidStrategy || ""),
          bidStrategyId: c.biddingStrategyId || c.bidStrategyId || null,
          enabled: lifecycleActive && (saved
            ? (saved.enabled !== undefined ? saved.enabled : (saved.budgetPercentage > 0))
            : true),
          standalone: saved?.standalone ?? false,
          standaloneBudget: saved?.standaloneBudget ?? 0,
          standaloneStartDate: saved?.standaloneStartDate ?? null,
          standaloneEndDate: saved?.standaloneEndDate ?? null,
          impressions: c.impressions || 0,
          clicks: c.clicks || 0,
          avgCpc: c.avgCpc || 0,
          conversions: c.conversions || 0,
          mtdSpend: c.cost || 0, // Actual MTD spend from Google Ads
          campaignStatus: c.campaignStatus,
          channelType: c.channelType,
          searchImpressionShare: parseImpressionShare(rawSearchIS),
          searchBudgetLostIS: parseImpressionShare(rawBudgetLostIS),
          recommendationAction: signal?.action ?? "hold",
          recommendationScore: signal?.score ?? 0,
          recommendationReason: signal?.reason ?? null,
          recommendationCpaLast60: signal?.cpa ?? null,
          recommendationConversionsLast60: signal?.conversions ?? 0,
          // Advisory monthly recommendation (read-only; set by the monthly cron).
          recommendedDailyBudget: saved?.recommendedDailyBudget ?? null,
          recommendationGeneratedAt: saved?.recommendationGeneratedAt ?? null,
        };
      });

      return NextResponse.json({
        success: true,
        campaigns: normalized,
        totalCount: normalized.length,
        monthlyBudget: audit.monthlyBudget || 0,
        range: metricsRange,
        competitiveRange,
        recommendationRange: reportOnly ? null : "LAST_60_DAYS",
        reportOnly,
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
