import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { postGrowthTools, resolveCustomerId } from "./_helpers";

export const applyAdGroupPause: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const auditId = payload.auditId as string | number | undefined;
  if (!auditId) throw new Error("ad-group-pause payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("ad-group-pause: auditId must be numeric");

  const adGroups = normaliseAdGroupStatusPayload(payload);
  if (adGroups.length === 0) throw new Error("ad-group-pause payload missing ad group changes");

  const { customerId } = await resolveCustomerId(ctx.payload, auditIdNum as number);

  const res = await postGrowthTools("/api/google-ads/ad-groups/pause", { customerId, adGroups });
  if (!res.ok) {
    const endpointNote = res.status === 404
      ? " Growth Tools endpoint /api/google-ads/ad-groups/pause is not available yet."
      : "";
    throw new Error(`Growth Tools ad-group pause failed: ${res.error}.${endpointNote}`);
  }

  const changedCount = Array.isArray((res.data as { changed?: unknown[] } | null)?.changed)
    ? ((res.data as { changed?: unknown[] }).changed ?? []).length
    : adGroups.length;

  return {
    message: `Applied ad group status change for ${changedCount} ad group${changedCount === 1 ? "" : "s"}.`,
    detail: { auditId: auditIdNum, customerId, adGroups, response: res.data as Record<string, unknown> | null },
  };
};

function normaliseAdGroupStatusPayload(payload: Record<string, unknown>): Array<{
  campaignId: string;
  campaignName?: string;
  adGroupId: string;
  adGroupName?: string;
  expectedStatus?: string;
  operation: "pause" | "enable";
}> {
  const rawAdGroups = Array.isArray(payload.adGroups) ? payload.adGroups as Record<string, unknown>[] : [payload];
  return rawAdGroups.map((entry, index) => {
    const campaignId = String(entry.campaignId ?? "").trim();
    const adGroupId = String(entry.adGroupId ?? "").trim();
    const operation = String(entry.operation ?? "").trim();
    if (!campaignId) throw new Error(`ad-group-pause adGroups[${index}] missing campaignId`);
    if (!adGroupId) throw new Error(`ad-group-pause adGroups[${index}] missing adGroupId`);
    if (operation !== "pause" && operation !== "enable") {
      throw new Error(`ad-group-pause adGroups[${index}] operation must be pause or enable`);
    }
    return {
      campaignId,
      campaignName: typeof entry.campaignName === "string" ? entry.campaignName : undefined,
      adGroupId,
      adGroupName: typeof entry.adGroupName === "string" ? entry.adGroupName : undefined,
      expectedStatus: typeof entry.expectedStatus === "string" ? entry.expectedStatus : undefined,
      operation,
    };
  });
}
