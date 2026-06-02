import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { hasValidApiKey } from "@/collections/api-key-access";
import { logActivity } from "@/lib/activity-log";

const BUDGETS_COLLECTION: any = "google-ads-campaign-budgets";

interface PushCampaignBudget {
  campaignId: string;
  dailyBudget: number;
  bidStrategy?: string;
  bidStrategyId?: string;
}

interface PushBudgetRequest {
  campaigns: PushCampaignBudget[];
}

/**
 * POST /api/google-ads-budgets/[id]/push
 * Push calculated budgets to Google Ads.
 * Updates the actualDailyBudget and lastPushedAt fields in CMS.
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
  if (!user && !hasValidApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: PushBudgetRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { campaigns } = body;

  if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
    return NextResponse.json(
      { error: "At least one campaign budget is required" },
      { status: 400 }
    );
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

  // Prefer client account ID over audit's (which may be MCC)
  let customerId = audit.customerId;
  let client: any = null;
  if (audit.client) {
    try {
      const clientId = typeof audit.client === 'object' ? audit.client.id : audit.client;
      client = typeof audit.client === 'object' ? audit.client : await payload.findByID({
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

  const now = new Date().toISOString();
  let pushedCount = 0;
  const errors: string[] = [];

  const growthToolsUrl = process.env.GROWTH_TOOLS_URL;
  const internalApiKey = process.env.INTERNAL_API_KEY;

  // Push to Google Ads via Growth Tools
  if (growthToolsUrl && internalApiKey) {
    try {
      const response = await fetch(
        `${growthToolsUrl}/api/google-ads/campaign-budgets/push`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-key": internalApiKey,
          },
          body: JSON.stringify({
            customerId: customerId.replace(/-/g, ""),
            campaigns,
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
          `Growth tools push failed (${response.status}): ${errorBody}`
        );
      }

      const result = await response.json();
      pushedCount = result.pushedCount || campaigns.length;
      // Surface any per-campaign errors from Growth Tools
      if (result.results) {
        for (const r of result.results) {
          if (!r.success) {
            errors.push(`${r.campaignId}: ${r.error || 'unknown error'}`);
          }
        }
      }
    } catch (e: any) {
      console.error("[GoogleAdsBudgets] Push error:", e.message);
      return NextResponse.json(
        { error: `Failed to push budgets to Google Ads: ${e.message}` },
        { status: 502 }
      );
    }
  } else {
    return NextResponse.json(
      { error: "Growth Tools not configured — cannot push to Google Ads" },
      { status: 503 }
    );
  }

  // Update CMS records with pushed values
  for (const campaign of campaigns) {
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
        await payload.update({
          collection: BUDGETS_COLLECTION,
          id: existing.docs[0].id,
          data: {
            actualDailyBudget: campaign.dailyBudget,
            lastPushedAt: now,
          },
          overrideAccess: true,
        });
      }
    } catch (e: any) {
      errors.push(`Failed to update ${campaign.campaignId}: ${e.message}`);
    }
  }

  // Log to activity feed — only on successful push (failures are surfaced in the
  // budget management UI; we only want a record of who pushed what, where, when).
  if (pushedCount > 0) {
    try {
      const userName = (user as any)?.name || (user as any)?.email || "Unknown user";
      const clientName = client?.name || audit.businessName || audit.clientName || "Unknown client";
      const pushedCampaigns = campaigns
        .slice(0, 5)
        .map((campaign) => `${campaign.campaignId}: $${campaign.dailyBudget.toFixed(2)}/day`)
        .join(", ");
      const extraCount = campaigns.length > 5 ? ` + ${campaigns.length - 5} more` : "";
      await logActivity(payload, {
        type: "google_ads_budget_pushed",
        title: `Google Ads budget pushed: ${clientName}`,
        description: `${userName} pushed ${pushedCount} campaign budget${pushedCount === 1 ? "" : "s"} to Google Ads for ${clientName} (CID ${customerId}). ${pushedCampaigns}${extraCount}`,
        user: user?.id,
        client: client?.id,
      });
    } catch (e: any) {
      console.error("[GoogleAdsBudgets] Failed to log activity:", e.message);
    }
  }

  return NextResponse.json({
    success: true,
    pushedCount,
    errors: errors.length > 0 ? errors : undefined,
    message: `Pushed budgets to ${pushedCount} campaigns. Changes will be reflected in Google Ads within a few minutes.`,
  });
}
