import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { getCampaignSnapshot } from "@/lib/google-ads-snapshots";
import { postGrowthTools, resolveCustomerId } from "./_helpers";

function microsToCurrency(micros: number): number {
  return micros / 1_000_000;
}

export const applyCampaignTargetCpaUpdate: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const auditId = payload.auditId as string | number | undefined;
  const campaignId = String(payload.campaignId ?? "").trim();
  const expectedBidStrategy = String(payload.expectedBidStrategy ?? "").trim();
  const currentTargetCpaMicros = Number(payload.currentTargetCpaMicros);
  const newTargetCpaMicros = Number(payload.newTargetCpaMicros);
  if (!auditId) throw new Error("campaign-target-cpa-update payload missing auditId");
  if (!campaignId) throw new Error("campaign-target-cpa-update payload missing campaignId");
  if (!expectedBidStrategy) throw new Error("campaign-target-cpa-update payload missing expectedBidStrategy");
  if (!Number.isFinite(currentTargetCpaMicros) || currentTargetCpaMicros <= 0) {
    throw new Error("campaign-target-cpa-update payload invalid currentTargetCpaMicros");
  }
  if (!Number.isFinite(newTargetCpaMicros) || newTargetCpaMicros <= 0) {
    throw new Error("campaign-target-cpa-update payload invalid newTargetCpaMicros");
  }

  const { customerId, auditDoc } = await resolveCustomerId(ctx.payload, auditId);
  const clientRef = auditDoc.client as { id?: number | string } | number | string | null | undefined;
  const clientId = typeof clientRef === "object" ? clientRef?.id : clientRef;
  if (clientId !== undefined && clientId !== null) {
    const snapshot = await getCampaignSnapshot(ctx.payload, { clientId, staleAfterMinutes: 1440 });
    const row = snapshot?.rows.find((r) => r.campaignId === campaignId);
    if (row) {
      if (row.bidStrategy && row.bidStrategy !== expectedBidStrategy) {
        throw new Error(`campaign-target-cpa-update aborted: bid strategy drifted from ${expectedBidStrategy} to ${row.bidStrategy}`);
      }
      if (typeof row.targetCpaMicros === "number") {
        const drift = Math.abs(row.targetCpaMicros - currentTargetCpaMicros) / currentTargetCpaMicros;
        if (drift > 0.05) {
          throw new Error("campaign-target-cpa-update aborted: target CPA drifted more than 5% since proposal");
        }
      }
    }
  }

  // docs/growth-tools-google-ads-budget-extensions.md proves only the shared
  // /campaign-budgets/update endpoint. It does not document target CPA fields,
  // but the local snapshot importer accepts targetCpaMicros and targetCpa; keep
  // both in the request so Growth Tools can support either without losing the
  // canonical micros value.
  const body: Record<string, unknown> = {
    customerId,
    campaignId,
    bidStrategy: expectedBidStrategy,
    bidStrategyId: typeof payload.bidStrategyId === "string" ? payload.bidStrategyId : undefined,
    targetCpaMicros: newTargetCpaMicros,
    targetCpa: microsToCurrency(newTargetCpaMicros),
  };

  const res = await postGrowthTools("/api/google-ads/campaign-budgets/update", body);
  if (!res.ok) throw new Error(`Growth Tools target CPA update failed: ${res.error}`);

  return {
    message: `Updated target CPA for campaign ${campaignId} to $${microsToCurrency(newTargetCpaMicros).toFixed(2)}.`,
    detail: { auditId, customerId, campaignId, currentTargetCpaMicros, newTargetCpaMicros, response: res.data as Record<string, unknown> | null },
  };
};
