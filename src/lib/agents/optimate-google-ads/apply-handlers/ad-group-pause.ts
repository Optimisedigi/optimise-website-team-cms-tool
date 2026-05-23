import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { postGrowthTools, resolveCustomerId } from "./_helpers";

export const applyAdGroupPause: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const auditId = payload.auditId as string | number | undefined;
  const campaignId = String(payload.campaignId ?? "").trim();
  const adGroupId = String(payload.adGroupId ?? "").trim();
  const operation = String(payload.operation ?? "").trim();
  if (!auditId) throw new Error("ad-group-pause payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("ad-group-pause: auditId must be numeric");
  if (!campaignId) throw new Error("ad-group-pause payload missing campaignId");
  if (!adGroupId) throw new Error("ad-group-pause payload missing adGroupId");
  if (operation !== "pause" && operation !== "enable") {
    throw new Error('ad-group-pause operation must be "pause" or "enable"');
  }

  const { customerId } = await resolveCustomerId(ctx.payload, auditIdNum as number);

  const res = await postGrowthTools("/api/google-ads/ad-groups/pause", {
    customerId,
    campaignId,
    adGroupId,
    adGroupName: typeof payload.adGroupName === "string" ? payload.adGroupName : undefined,
    expectedStatus: typeof payload.expectedStatus === "string" ? payload.expectedStatus : undefined,
    operation,
  });
  if (!res.ok) {
    const endpointNote = res.status === 404
      ? " Growth Tools endpoint /api/google-ads/ad-groups/pause is not available yet."
      : "";
    throw new Error(`Growth Tools ad-group pause failed: ${res.error}.${endpointNote}`);
  }

  return {
    message: `${operation === "pause" ? "Paused" : "Enabled"} ad group ${adGroupId}.`,
    detail: { auditId: auditIdNum, customerId, campaignId, adGroupId, operation, response: res.data as Record<string, unknown> | null },
  };
};
