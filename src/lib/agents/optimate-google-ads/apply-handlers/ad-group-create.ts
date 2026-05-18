/**
 * Apply handler: ad-group-create
 *
 * Creates ONE new ad group in an existing campaign, PAUSED. Optionally
 * clones the top RSA + default Max CPC + target_cpa/target_roas overrides +
 * audience signals + bid modifiers + ad-group-level negatives from a source
 * ad group (same customer).
 *
 * Mirrors the Growth Tools call pattern of `applyCampaignBuild` —
 * resolveCustomerId → postGrowthTools → return summary.
 *
 * Expected payload:
 *   {
 *     auditId: string|number,
 *     campaignId: string,
 *     campaignName: string,
 *     adGroupName: string,
 *     keywords: Array<{ text, matchType (lowercase), cpcBidMicros? }>,
 *     cloneFromAdGroupId?: string | null,
 *     cloneFromAdGroupName?: string | null,
 *   }
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { resolveCustomerId, postGrowthTools } from "./_helpers";

type MatchTypeLower = "exact" | "phrase" | "broad";
type MatchTypeUpper = "EXACT" | "PHRASE" | "BROAD";

interface KeywordPayload {
  text: string;
  matchType: MatchTypeLower;
  cpcBidMicros?: number;
}

interface GrowthToolsKeyword {
  text: string;
  matchType: MatchTypeUpper;
  cpcBidMicros?: number;
}

interface CreateAdGroupResult {
  adGroupId?: string;
  adGroupResourceName?: string;
  keywordsAdded?: number;
  cloned?: {
    ad?: boolean;
    defaultCpcMicros?: boolean;
    targetCpa?: boolean;
    targetRoas?: boolean;
    audienceCriteria?: number;
    bidModifiers?: number;
    negativeKeywords?: number;
  };
  warnings?: string[];
}

const MATCH_TYPE_MAP: Record<MatchTypeLower, MatchTypeUpper> = {
  exact: "EXACT",
  phrase: "PHRASE",
  broad: "BROAD",
};

export const applyAdGroupCreate: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const { payload: pl } = ctx;

  const auditId = payload.auditId as string | number | undefined;
  if (!auditId) throw new Error("ad-group-create payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("ad-group-create: auditId must be numeric");

  const campaignId = String(payload.campaignId ?? "").trim();
  if (!campaignId) throw new Error("ad-group-create: payload missing campaignId");
  const campaignName = String(payload.campaignName ?? "").trim();
  const adGroupName = String(payload.adGroupName ?? "").trim();
  if (!adGroupName) throw new Error("ad-group-create: payload missing adGroupName");

  const rawKeywords = Array.isArray(payload.keywords) ? (payload.keywords as unknown[]) : [];
  if (rawKeywords.length === 0) throw new Error("ad-group-create: keywords array is empty");

  const keywords: GrowthToolsKeyword[] = rawKeywords.map((k, i) => {
    const ko = k as Record<string, unknown>;
    const text = String(ko.text ?? "").trim();
    if (!text) throw new Error(`ad-group-create: keywords[${i}] missing text`);
    const matchTypeLower = String(ko.matchType ?? "").toLowerCase() as MatchTypeLower;
    const matchType = MATCH_TYPE_MAP[matchTypeLower];
    if (!matchType) throw new Error(`ad-group-create: keywords[${i}] invalid matchType "${ko.matchType}"`);
    const out: GrowthToolsKeyword = { text, matchType };
    if (ko.cpcBidMicros !== undefined && ko.cpcBidMicros !== null) {
      const cpc = Number(ko.cpcBidMicros);
      if (!Number.isFinite(cpc) || cpc < 0) {
        throw new Error(`ad-group-create: keywords[${i}] invalid cpcBidMicros`);
      }
      out.cpcBidMicros = cpc;
    }
    return out;
  });

  const cloneFromAdGroupId =
    typeof payload.cloneFromAdGroupId === "string" && payload.cloneFromAdGroupId.trim()
      ? payload.cloneFromAdGroupId.trim()
      : undefined;

  const { customerId } = await resolveCustomerId(pl, auditIdNum as number);

  const body: Record<string, unknown> = {
    customerId,
    campaignId,
    name: adGroupName,
    keywords,
  };
  if (cloneFromAdGroupId) body.cloneFromAdGroupId = cloneFromAdGroupId;

  const res = await postGrowthTools("/api/google-ads/ad-groups/create", body);
  if (!res.ok) {
    throw new Error(`Growth Tools ad-group create failed: ${res.error}`);
  }

  const data = (res.data ?? {}) as CreateAdGroupResult;
  const adGroupId = data.adGroupId;
  const keywordsAdded = Number(data.keywordsAdded ?? keywords.length);
  const cloned = data.cloned;
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];

  const dest = campaignName ? `${campaignName} → ${adGroupName}` : adGroupName;
  const clonedPart = cloned?.ad ? " Source ad cloned." : "";
  const warningsPart = warnings.length ? ` ${warnings.length} warning${warnings.length === 1 ? "" : "s"} returned.` : "";

  return {
    message: `Created ad group "${dest}" (PAUSED). ${keywordsAdded} keyword${keywordsAdded === 1 ? "" : "s"} added.${clonedPart}${warningsPart}`,
    detail: {
      auditId: auditIdNum,
      customerId,
      campaignId,
      adGroupId: adGroupId ?? null,
      adGroupResourceName: data.adGroupResourceName ?? null,
      keywordsAdded,
      cloned: cloned ?? null,
      warnings: warnings.slice(0, 10),
    },
  };
};

// Re-export the keyword payload type for the propose tool / tests.
export type { KeywordPayload };
