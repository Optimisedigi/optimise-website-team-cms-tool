/**
 * Apply handler: keywords-add
 *
 * Bulk-adds positive keywords to an existing ad group, PAUSED. Duplicates
 * (same text + matchType) are skipped server-side by Growth Tools.
 *
 * Expected payload:
 *   {
 *     auditId: string|number,
 *     adGroupId: string,
 *     adGroupName?: string,
 *     keywords: Array<{ text, matchType (lowercase), cpcBidMicros? }>,
 *   }
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { resolveCustomerId, postGrowthTools } from "./_helpers";

type MatchTypeLower = "exact" | "phrase" | "broad";
type MatchTypeUpper = "EXACT" | "PHRASE" | "BROAD";

interface GrowthToolsKeyword {
  text: string;
  matchType: MatchTypeUpper;
  cpcBidMicros?: number;
}

interface KeywordsAddResult {
  added?: number;
  skippedDuplicates?: number;
  duplicates?: Array<{ text: string; matchType: string }>;
  errors?: Array<{ text?: string; matchType?: string; error?: string }>;
}

const MATCH_TYPE_MAP: Record<MatchTypeLower, MatchTypeUpper> = {
  exact: "EXACT",
  phrase: "PHRASE",
  broad: "BROAD",
};

export const applyKeywordsAdd: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const { payload: pl } = ctx;

  const auditId = payload.auditId as string | number | undefined;
  if (!auditId) throw new Error("keywords-add payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("keywords-add: auditId must be numeric");

  const adGroupId = String(payload.adGroupId ?? "").trim();
  if (!adGroupId) throw new Error("keywords-add: payload missing adGroupId");
  const adGroupName = String(payload.adGroupName ?? "").trim() || adGroupId;

  const rawKeywords = Array.isArray(payload.keywords) ? (payload.keywords as unknown[]) : [];
  if (rawKeywords.length === 0) throw new Error("keywords-add: keywords array is empty");

  const keywords: GrowthToolsKeyword[] = rawKeywords.map((k, i) => {
    const ko = k as Record<string, unknown>;
    const text = String(ko.text ?? "").trim();
    if (!text) throw new Error(`keywords-add: keywords[${i}] missing text`);
    const matchTypeLower = String(ko.matchType ?? "").toLowerCase() as MatchTypeLower;
    const matchType = MATCH_TYPE_MAP[matchTypeLower];
    if (!matchType) throw new Error(`keywords-add: keywords[${i}] invalid matchType "${ko.matchType}"`);
    const out: GrowthToolsKeyword = { text, matchType };
    if (ko.cpcBidMicros !== undefined && ko.cpcBidMicros !== null) {
      const cpc = Number(ko.cpcBidMicros);
      if (!Number.isFinite(cpc) || cpc < 0) {
        throw new Error(`keywords-add: keywords[${i}] invalid cpcBidMicros`);
      }
      out.cpcBidMicros = cpc;
    }
    return out;
  });

  const { customerId } = await resolveCustomerId(pl, auditIdNum as number);

  const res = await postGrowthTools(
    `/api/google-ads/ad-groups/${encodeURIComponent(adGroupId)}/keywords/add`,
    { customerId, keywords },
  );
  if (!res.ok) {
    throw new Error(`Growth Tools keywords-add failed: ${res.error}`);
  }

  const data = (res.data ?? {}) as KeywordsAddResult;
  const added = Number(data.added ?? 0);
  const skippedDuplicates = Number(data.skippedDuplicates ?? 0);
  const errors = Array.isArray(data.errors) ? data.errors : [];

  const skippedPart = skippedDuplicates > 0 ? ` (skipped ${skippedDuplicates} duplicate${skippedDuplicates === 1 ? "" : "s"})` : "";
  const errorsPart = errors.length > 0 ? ` ${errors.length} keyword error${errors.length === 1 ? "" : "s"} returned.` : "";

  return {
    message: `Added ${added} keyword${added === 1 ? "" : "s"} to ad group "${adGroupName}" (PAUSED)${skippedPart}.${errorsPart}`,
    detail: {
      auditId: auditIdNum,
      customerId,
      adGroupId,
      added,
      skippedDuplicates,
      duplicates: data.duplicates ?? [],
      errors: errors.slice(0, 10),
    },
  };
};
