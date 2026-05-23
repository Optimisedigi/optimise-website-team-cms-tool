import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { postGrowthTools, resolveCustomerId } from "./_helpers";

export const applyKeywordPause: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const auditId = payload.auditId as string | number | undefined;
  const campaignId = String(payload.campaignId ?? "").trim();
  const adGroupId = String(payload.adGroupId ?? "").trim();
  const keywordId = typeof payload.keywordId === "string" ? payload.keywordId.trim() : undefined;
  const keywordText = String(payload.keywordText ?? "").trim();
  const operation = String(payload.operation ?? "").trim();
  if (!auditId) throw new Error("keyword-pause payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("keyword-pause: auditId must be numeric");
  if (!campaignId) throw new Error("keyword-pause payload missing campaignId");
  if (!adGroupId) throw new Error("keyword-pause payload missing adGroupId");
  if (!keywordId && !keywordText) throw new Error("keyword-pause payload missing keywordId or keywordText");
  if (operation !== "pause" && operation !== "enable") {
    throw new Error('keyword-pause operation must be "pause" or "enable"');
  }

  const { customerId } = await resolveCustomerId(ctx.payload, auditIdNum as number);

  const res = await postGrowthTools("/api/google-ads/keywords/pause", {
    customerId,
    campaignId,
    adGroupId,
    keywordId,
    keywordText,
    matchType: typeof payload.matchType === "string" ? payload.matchType : undefined,
    operation,
  });
  if (!res.ok) {
    const endpointNote = res.status === 404
      ? " Growth Tools endpoint /api/google-ads/keywords/pause is not available yet."
      : "";
    throw new Error(`Growth Tools keyword pause failed: ${res.error}.${endpointNote}`);
  }

  return {
    message: `${operation === "pause" ? "Paused" : "Enabled"} keyword ${keywordId ?? keywordText}.`,
    detail: { auditId: auditIdNum, customerId, campaignId, adGroupId, keywordId, keywordText, operation, response: res.data as Record<string, unknown> | null },
  };
};
