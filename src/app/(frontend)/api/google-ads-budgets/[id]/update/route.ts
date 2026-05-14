import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { hasValidApiKey } from "@/collections/api-key-access";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const BUDGETS_COLLECTION: any = "google-ads-campaign-budgets";

interface UpdateBudgetRequest {
  campaignId: string;
  dailyBudget?: number;
  bidStrategy?: string;
  bidStrategyId?: string;
  locationIds?: string[];
  locationNames?: string[];
}

/**
 * POST /api/google-ads-budgets/[id]/update
 * Update campaign budget, bid strategy, or location targeting.
 * Updates both Google Ads API and the CMS collection.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user && !hasValidApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const auditIdNum = Number(id);

  // Save monthly budget to audit record
  if (body._saveMonthlyBudget !== undefined) {
    try {
      await payload.update({
        collection: "google-ads-audits",
        id: auditIdNum,
        data: { monthlyBudget: body._saveMonthlyBudget },
        overrideAccess: true,
      });
      return NextResponse.json({ success: true });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // Load saved allocations from CMS
  if (body._loadSaved) {
    try {
      const [saved, audit] = await Promise.all([
        payload.find({
          collection: BUDGETS_COLLECTION,
          where: { audit: { equals: auditIdNum } },
          limit: 100,
          overrideAccess: true,
        }),
        payload.findByID({
          collection: "google-ads-audits",
          id: auditIdNum,
          overrideAccess: true,
        }),
      ]);
      return NextResponse.json({
        monthlyBudget: audit.monthlyBudget || 0,
        campaigns: saved.docs.map((d: any) => ({
          campaignId: d.campaignId,
          campaignName: d.campaignName,
          budgetPercentage: d.budgetPercentage ?? 0,
          calculatedDailyBudget: d.calculatedDailyBudget ?? 0,
          actualDailyBudget: d.actualDailyBudget ?? 0,
          enabled: d.enabled !== undefined ? d.enabled : (d.budgetPercentage > 0),
          standalone: d.standalone ?? false,
          standaloneBudget: d.standaloneBudget ?? 0,
          standaloneStartDate: d.standaloneStartDate ?? null,
          standaloneEndDate: d.standaloneEndDate ?? null,
          bidStrategy: d.bidStrategy,
          impressions: d.impressions ?? 0,
          clicks: d.clicks ?? 0,
          avgCpc: d.avgCpc ?? 0,
          conversions: d.conversions ?? 0,
          mtdSpend: 0,
        })),
      });
    } catch {
      return NextResponse.json({ campaigns: [] });
    }
  }

  // Bulk save: save budget allocations to CMS only (no Google Ads push)
  if (body.campaigns && Array.isArray(body.campaigns)) {
    // Get customerId from audit for creating new records
    let auditCustomerId = '';
    try {
      const audit = await payload.findByID({ collection: "google-ads-audits", id: auditIdNum, overrideAccess: true });
      auditCustomerId = audit.customerId || '';
    } catch { /* use empty */ }

    const errors: string[] = [];
    for (const campaign of body.campaigns) {
      try {
        const existing = await payload.find({
          collection: BUDGETS_COLLECTION,
          where: {
            audit: { equals: auditIdNum },
            campaignId: { equals: campaign.campaignId },
          },
          limit: 1,
          overrideAccess: true,
        });

        const cmsData: Record<string, any> = {
          budgetPercentage: campaign.budgetPercentage,
          calculatedDailyBudget: campaign.calculatedDailyBudget,
          bidStrategy: campaign.bidStrategy,
          enabled: campaign.enabled !== undefined ? campaign.enabled : (campaign.budgetPercentage > 0),
        };

        if (campaign.standalone !== undefined) cmsData.standalone = campaign.standalone;
        if (campaign.standaloneBudget !== undefined) cmsData.standaloneBudget = campaign.standaloneBudget;
        if (campaign.standaloneStartDate !== undefined) cmsData.standaloneStartDate = campaign.standaloneStartDate;
        if (campaign.standaloneEndDate !== undefined) cmsData.standaloneEndDate = campaign.standaloneEndDate;

        if (existing.totalDocs > 0) {
          await payload.update({
            collection: BUDGETS_COLLECTION,
            id: existing.docs[0].id,
            data: cmsData,
            overrideAccess: true,
          });
        } else {
          await payload.create({
            collection: BUDGETS_COLLECTION,
            data: {
              audit: auditIdNum,
              customerId: auditCustomerId,
              campaignId: campaign.campaignId,
              campaignName: campaign.campaignName || campaign.campaignId,
              ...cmsData,
            } as any,
            overrideAccess: true,
          });
        }
      } catch (e: any) {
        errors.push(`${campaign.campaignId}: ${e.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      saved: body.campaigns.length - errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  }

  // Single campaign update (original logic)
  const { campaignId, dailyBudget, bidStrategy, bidStrategyId, locationIds, locationNames } = body as UpdateBudgetRequest;

  if (!campaignId) {
    return NextResponse.json(
      { error: "Missing required field: campaignId" },
      { status: 400 }
    );
  }

  // Fetch the audit record
  let audit: any;
  try {
    audit = await payload.findByID({
      collection: "google-ads-audits",
      id: auditIdNum,
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

  // Find existing budget record
  let existingBudget: any;
  try {
    const existing = await payload.find({
      collection: BUDGETS_COLLECTION,
      where: {
        audit: { equals: auditIdNum },
        campaignId: { equals: campaignId },
      },
      limit: 1,
      overrideAccess: true,
    });

    if (existing.totalDocs > 0) {
      existingBudget = existing.docs[0];
    }
  } catch {
    // No existing budget - will create one
  }

  // Update Google Ads via Growth Tools
  if (GROWTH_TOOLS_URL && INTERNAL_API_KEY) {
    try {
      const updatePayload: Record<string, any> = {
        customerId: customerId.replace(/-/g, ""),
        campaignId,
      };

      if (dailyBudget !== undefined) updatePayload.dailyBudget = dailyBudget;
      if (bidStrategy) updatePayload.bidStrategy = bidStrategy;
      if (bidStrategyId) updatePayload.bidStrategyId = bidStrategyId;
      if (locationIds) updatePayload.locationIds = locationIds;
      if (locationNames) updatePayload.locationNames = locationNames;

      const response = await fetch(
        `${GROWTH_TOOLS_URL}/api/google-ads/campaign-budgets/update`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-key": INTERNAL_API_KEY!,
          },
          body: JSON.stringify(updatePayload),
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
          `Growth tools update failed (${response.status}): ${errorBody}`
        );
      }

      const result = await response.json();

      // Update CMS record with the response
      const cmsData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };

      if (dailyBudget !== undefined) cmsData.dailyBudget = dailyBudget;
      if (bidStrategy) cmsData.bidStrategy = bidStrategy;
      if (bidStrategyId) cmsData.bidStrategyId = bidStrategyId;
      if (locationIds) {
        cmsData.locationIds = locationIds.map((locId: string) => ({ locationId: locId }));
      }
      if (locationNames) {
        cmsData.locationNames = locationNames.map((name: string) => ({ name }));
      }

      if (existingBudget) {
        await payload.update({
          collection: BUDGETS_COLLECTION,
          id: existingBudget.id,
          data: cmsData,
          overrideAccess: true,
        });
      }

      return NextResponse.json({
        success: true,
        campaign: result.campaign || { campaignId, ...updatePayload },
      });
    } catch (e: any) {
      console.error("[GoogleAdsBudgets] Update error:", e.message);
      return NextResponse.json(
        { error: `Failed to update budget: ${e.message}` },
        { status: 500 }
      );
    }
  }

  // Fallback: Update CMS record only (no Google Ads update)
  if (existingBudget) {
    const cmsData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (dailyBudget !== undefined) cmsData.dailyBudget = dailyBudget;
    if (bidStrategy) cmsData.bidStrategy = bidStrategy;
    if (bidStrategyId) cmsData.bidStrategyId = bidStrategyId;
    if (locationIds) {
      cmsData.locationIds = locationIds.map((locId: string) => ({ locationId: locId }));
    }
    if (locationNames) {
      cmsData.locationNames = locationNames.map((name: string) => ({ name }));
    }

    await payload.update({
      collection: BUDGETS_COLLECTION,
      id: existingBudget.id,
      data: cmsData,
      overrideAccess: true,
    });

    return NextResponse.json({
      success: true,
      campaign: { campaignId, ...cmsData },
      source: "cache",
    });
  }

  return NextResponse.json(
    { error: "No existing budget record found and Growth Tools not configured" },
    { status: 404 }
  );
}
