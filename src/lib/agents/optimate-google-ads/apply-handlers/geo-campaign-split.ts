/**
 * Apply handler: geo-campaign-split
 *
 * Calls Growth Tools' safe geo split endpoint after human approval. Existing
 * campaign/ad group statuses are preserved by the Growth Tools service; the new
 * campaign batch is created PAUSED with provenance + activation labels.
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { resolveCustomerId, postGrowthTools } from "./_helpers";

type MatchType = "exact" | "phrase";

function toGoogleMatchType(matchType: unknown): "EXACT" | "PHRASE" {
  const normalised = String(matchType ?? "exact").toLowerCase();
  if (normalised === "phrase") return "PHRASE";
  if (normalised === "exact") return "EXACT";
  throw new Error(`geo-campaign-split: unsupported match type "${normalised}"`);
}

export const applyGeoCampaignSplit: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const auditId = payload.auditId as string | number | undefined;
  if (!auditId) throw new Error("geo-campaign-split payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("geo-campaign-split: auditId must be numeric");

  const { customerId } = await resolveCustomerId(ctx.payload, auditIdNum as number);

  const adGroups = Array.isArray(payload.adGroups) ? payload.adGroups as Array<Record<string, unknown>> : [];
  if (adGroups.length === 0) throw new Error("geo-campaign-split: adGroups is required");

  const body = {
    customerId,
    batchId: String(payload.batchId ?? "").trim(),
    newCampaign: {
      name: String(payload.newCampaignName ?? "").trim(),
      dailyBudgetMicros: Number(payload.dailyBudgetMicros),
      geoTargetIds: Array.isArray(payload.geoTargetIds) ? payload.geoTargetIds.map(Number) : [],
      adGroups: adGroups.map((ag) => ({
        name: String(ag.name ?? "").trim(),
        ...(ag.cpcBidMicros !== undefined ? { cpcBidMicros: Number(ag.cpcBidMicros) } : {}),
        keywords: (Array.isArray(ag.keywords) ? ag.keywords as Array<Record<string, unknown>> : []).map((kw) => ({
          ...(typeof kw.sourceKeyword === "string" ? { sourceKeyword: kw.sourceKeyword } : {}),
          text: String(kw.text ?? "").trim(),
          matchType: toGoogleMatchType(kw.matchType as MatchType),
          ...(kw.cpcBidMicros !== undefined ? { cpcBidMicros: Number(kw.cpcBidMicros) } : {}),
          ...(typeof kw.finalUrl === "string" ? { finalUrl: kw.finalUrl } : {}),
        })),
        adCopy: ag.adCopy,
      })),
    },
    parentIsolation: {
      sourceCampaignId: String(payload.sourceCampaignId ?? "").trim(),
      sourceCampaignName: String(payload.sourceCampaignName ?? "").trim(),
      negativeLocationGeoTargetIds: Array.isArray(payload.negativeLocationGeoTargetIds) ? payload.negativeLocationGeoTargetIds.map(Number) : [],
      negativeKeywords: (Array.isArray(payload.negativeKeywordsForSource) ? payload.negativeKeywordsForSource as Array<Record<string, unknown>> : []).map((nk) => ({
        text: String(nk.text ?? "").trim(),
        matchType: toGoogleMatchType(nk.matchType),
      })),
    },
    labels: {
      createdBy: "Created by Optimise Digital",
      pendingActivation: "Pending activation - Optimise Digital",
      ...(payload.labels && typeof payload.labels === "object" ? payload.labels as Record<string, unknown> : {}),
    },
  };

  const res = await postGrowthTools("/api/google-ads/geo-split/apply", body);
  if (!res.ok) throw new Error(`Growth Tools geo split failed: ${res.error}`);

  return {
    message: `Geo split build applied for audit #${auditIdNum}. New campaign batch is PAUSED and labelled for later activation; existing campaign statuses were not changed.`,
    detail: { auditId: auditIdNum, customerId, growthToolsResponse: res.data },
  };
};
