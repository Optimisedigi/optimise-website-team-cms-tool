/**
 * Apply handler: budget-push-live
 *
 * Pushes campaign budgets to Google Ads. Mirrors the body of
 * POST /api/google-ads-budgets/[id]/push — same Growth Tools endpoint, same
 * post-update of CMS rows with `actualDailyBudget` + `lastPushedAt`.
 *
 * Expected payload:
 *   {
 *     auditId: string|number,
 *     campaigns: Array<{ campaignId, dailyBudget, bidStrategy?, bidStrategyId? }>,
 *   }
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { assertCampaignsExistForCustomer } from "../tools/_campaign-validation";
import { resolveCustomerId, postGrowthTools } from "./_helpers";

const BUDGETS_COLLECTION: any = "google-ads-campaign-budgets";

interface PushCampaign {
  campaignId: string;
  dailyBudget: number;
  bidStrategy?: string;
  bidStrategyId?: string;
}

interface PushResult {
  pushedCount?: number;
  results?: Array<{ campaignId: string; success?: boolean; error?: string }>;
}

export const applyBudgetPushLive: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const { payload: pl } = ctx;
  const auditId = payload.auditId as string | number | undefined;
  if (!auditId) throw new Error("budget-push-live payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("budget-push-live: auditId must be numeric");

  const rawCampaigns = Array.isArray(payload.campaigns) ? (payload.campaigns as unknown[]) : [];
  if (rawCampaigns.length === 0) throw new Error("budget-push-live: campaigns array is empty");
  const source = typeof payload.source === "string" && payload.source.trim()
    ? payload.source.trim()
    : "agent";

  const campaigns: PushCampaign[] = rawCampaigns.map((c, i) => {
    const co = c as Record<string, unknown>;
    const campaignId = String(co.campaignId ?? "").trim();
    const dailyBudget = Number(co.dailyBudget);
    if (!campaignId) throw new Error(`budget-push-live: campaign[${i}] missing campaignId`);
    if (!Number.isFinite(dailyBudget) || dailyBudget < 0) {
      throw new Error(`budget-push-live: campaign[${i}] invalid dailyBudget`);
    }
    const out: PushCampaign = { campaignId, dailyBudget };
    if (typeof co.bidStrategy === "string") out.bidStrategy = co.bidStrategy;
    if (typeof co.bidStrategyId === "string") out.bidStrategyId = co.bidStrategyId;
    return out;
  });

  const { customerId } = await resolveCustomerId(pl, auditIdNum);
  await assertCampaignsExistForCustomer(customerId, campaigns.map((campaign) => ({ ...campaign, campaignName: campaign.campaignId })));

  const res = await postGrowthTools("/api/google-ads/campaign-budgets/push", {
    customerId,
    campaigns,
  });
  if (!res.ok) {
    throw new Error(`Growth Tools budget push failed: ${res.error}`);
  }

  const data = res.data as PushResult | null;
  const pushedCount = Number(data?.pushedCount ?? campaigns.length);
  const errs: string[] = [];
  if (Array.isArray(data?.results)) {
    for (const r of data!.results!) {
      if (!r.success) errs.push(`${r.campaignId}: ${r.error ?? "unknown error"}`);
    }
  }

  // Update CMS rows with the pushed values.
  const now = new Date().toISOString();
  for (const c of campaigns) {
    try {
      const existing = await pl.find({
        collection: BUDGETS_COLLECTION,
        where: {
          audit: { equals: auditIdNum },
          campaignId: { equals: c.campaignId },
        } as any,
        limit: 1,
        overrideAccess: true,
      });
      if (existing.totalDocs > 0) {
        await pl.update({
          collection: BUDGETS_COLLECTION,
          id: (existing.docs[0] as { id: number }).id,
          data: {
            actualDailyBudget: c.dailyBudget,
            lastPushedAt: now,
            lastPushedSource: source,
          } as never,
          overrideAccess: true,
        });
      }
    } catch (err) {
      errs.push(`update-cms ${c.campaignId}: ${(err as Error).message}`);
    }
  }

  return {
    message: `Pushed budgets to ${pushedCount}/${campaigns.length} campaigns. Changes propagate in Google Ads within minutes.${errs.length ? ` ${errs.length} errors logged.` : ""}`,
    detail: { auditId: auditIdNum, customerId, pushedCount, attempted: campaigns.length, errors: errs.slice(0, 10) },
  };
};
