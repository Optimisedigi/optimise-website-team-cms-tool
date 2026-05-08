/**
 * Apply handler: budget-update
 *
 * Updates the audit's saved budget allocations + (when configured) the
 * campaigns' actual budgets in Google Ads. Mirrors the `_saveMonthlyBudget`
 * and bulk-save paths of POST /api/google-ads-budgets/[id]/update plus the
 * single-campaign push.
 *
 * Two modes:
 *   1. monthly_budget        — sets audit.monthlyBudget (CMS only)
 *   2. campaign_allocations  — saves percent allocations to the
 *      google-ads-campaign-budgets collection (CMS only). Live push is a
 *      separate handler (budget-push-live) the agent must propose.
 *
 * Expected payload:
 *   {
 *     auditId: string|number,
 *     mode: "monthly_budget"|"campaign_allocations",
 *     monthlyBudget?: number,
 *     campaigns?: Array<{ campaignId, campaignName, budgetPercentage,
 *                        calculatedDailyBudget, bidStrategy?, enabled? }>,
 *   }
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { resolveCustomerId } from "./_helpers";

const BUDGETS_COLLECTION: any = "google-ads-campaign-budgets";

interface CampaignAllocationInput {
  campaignId: string;
  campaignName?: string;
  budgetPercentage: number;
  calculatedDailyBudget?: number;
  bidStrategy?: string;
  enabled?: boolean;
}

export const applyBudgetUpdate: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const { payload: pl } = ctx;
  const auditId = payload.auditId as string | number | undefined;
  if (!auditId) throw new Error("budget-update payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("budget-update: auditId must be numeric");

  const mode = String(payload.mode ?? "");
  if (mode === "monthly_budget") {
    const monthlyBudget = Number(payload.monthlyBudget);
    if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0) {
      throw new Error("budget-update: monthly_budget mode requires a non-negative monthlyBudget number");
    }
    await pl.update({
      collection: "google-ads-audits",
      id: auditIdNum as number,
      data: { monthlyBudget } as never,
      overrideAccess: true,
    });
    return {
      message: `Set audit #${auditIdNum} monthly budget to $${monthlyBudget.toLocaleString()}.`,
      detail: { auditId: auditIdNum, monthlyBudget },
    };
  }

  if (mode === "campaign_allocations") {
    const campaigns = Array.isArray(payload.campaigns)
      ? (payload.campaigns as unknown[]).map((c) => c as CampaignAllocationInput)
      : [];
    if (campaigns.length === 0) {
      throw new Error("budget-update: campaign_allocations mode requires a non-empty campaigns array");
    }

    // Need customerId for new rows.
    const { customerId } = await resolveCustomerId(pl, auditIdNum);

    const errors: string[] = [];
    let saved = 0;
    for (const c of campaigns) {
      try {
        if (!c.campaignId) throw new Error("missing campaignId");
        const existing = await pl.find({
          collection: BUDGETS_COLLECTION,
          where: {
            audit: { equals: auditIdNum },
            campaignId: { equals: c.campaignId },
          } as any,
          limit: 1,
          overrideAccess: true,
        });

        const cmsData: Record<string, unknown> = {
          budgetPercentage: c.budgetPercentage,
          ...(c.calculatedDailyBudget !== undefined ? { calculatedDailyBudget: c.calculatedDailyBudget } : {}),
          ...(c.bidStrategy !== undefined ? { bidStrategy: c.bidStrategy } : {}),
          enabled: c.enabled !== undefined ? c.enabled : (Number(c.budgetPercentage) > 0),
        };

        if (existing.totalDocs > 0) {
          await pl.update({
            collection: BUDGETS_COLLECTION,
            id: (existing.docs[0] as { id: number }).id,
            data: cmsData as never,
            overrideAccess: true,
          });
        } else {
          await pl.create({
            collection: BUDGETS_COLLECTION,
            data: {
              audit: auditIdNum,
              customerId,
              campaignId: c.campaignId,
              campaignName: c.campaignName ?? c.campaignId,
              ...cmsData,
            } as never,
            overrideAccess: true,
          });
        }
        saved += 1;
      } catch (err) {
        errors.push(`${c.campaignId}: ${(err as Error).message}`);
      }
    }

    return {
      message: `Saved budget allocations for ${saved}/${campaigns.length} campaigns on audit #${auditIdNum}${errors.length ? ` — ${errors.length} errors` : ""}. Live push not yet performed.`,
      detail: { auditId: auditIdNum, saved, attempted: campaigns.length, errors: errors.slice(0, 10) },
    };
  }

  throw new Error(`budget-update: unknown mode "${mode}"`);
};
