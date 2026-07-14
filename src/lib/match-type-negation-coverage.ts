/**
 * Campaign-scoped negative-keyword coverage for the Match-Type Monitor.
 *
 * When the Growth Tools detector returns a match-type violation, we suppress it
 * if the offending search term is ALREADY blocked by a negative keyword in an
 * NKL that actually applies to the violation's campaign / ad group. Unlike the
 * old exact-full-string check, this honours the NKL's routing (`scope` +
 * `campaignRegex`) and phrase/broad negatives — a phrase negative that genuinely
 * blocks the term hides the violation, so the review list only shows terms the
 * team still has to act on.
 */

import { matchesPattern } from "@/lib/nkl-routing";

export type CoverageMatchType = "broad" | "phrase" | "exact";

/** Minimal NKL shape needed to decide coverage. Mirrors a `depth=0` NKL row. */
export interface CoverageNkl {
  name?: string | null;
  scope?: "account" | "campaign" | "ad_group" | null;
  campaignRegex?: string | null;
  adGroupName?: string | null;
  isActive?: boolean | null;
  keywords?: Array<{ keyword?: string | null; matchType?: string | null }> | null;
}

/** The campaign/ad-group context of the violation being tested. */
export interface CoverageContext {
  campaignName?: string | null;
  adGroupName?: string | null;
}

/** The negative that covered a term, for logging / notes. */
export interface CoverageMatch {
  keyword: string;
  matchType: CoverageMatchType;
  listName: string;
}

/**
 * True when an NKL's negatives apply to the violation's campaign / ad group.
 *   - account scope: applies account-wide (every campaign).
 *   - ad_group scope: applies when its `adGroupName` matches the violation's ad
 *     group, or its `campaignRegex` matches the ad group or campaign name.
 *   - campaign scope: applies when its `campaignRegex` matches the campaign name.
 * A blank `campaignRegex` on a campaign/ad_group list means "not auto-attached",
 * so it covers nothing (matches the field's documented behaviour). Inactive
 * lists never apply.
 */
export function nklAppliesToViolation(nkl: CoverageNkl, ctx: CoverageContext): boolean {
  if (nkl.isActive === false) return false;

  const scope = nkl.scope ?? "account";
  if (scope === "account") return true;

  const regex = String(nkl.campaignRegex ?? "").trim();
  const campaignName = String(ctx.campaignName ?? "").trim();
  const adGroupName = String(ctx.adGroupName ?? "").trim();

  if (scope === "ad_group") {
    const listAdGroup = String(nkl.adGroupName ?? "").trim();
    if (listAdGroup && adGroupName && listAdGroup.toLowerCase() === adGroupName.toLowerCase()) {
      return true;
    }
    if (regex && adGroupName && matchesPattern(adGroupName, regex)) return true;
    if (regex && campaignName && matchesPattern(campaignName, regex)) return true;
    return false;
  }

  // campaign scope
  return Boolean(regex && campaignName && matchesPattern(campaignName, regex));
}

/**
 * Find the first negative that already covers `term` among NKLs that apply to
 * the violation's campaign, or `null` when the term is uncovered.
 *
 * Coverage follows the Google Ads match type of the negative:
 *   - exact: the whole normalized term equals the keyword.
 *   - phrase: keyword words appear consecutively and in order in the term.
 *   - broad: every keyword word appears in the term, in any order.
 *
 * This deliberately does not reuse the monthly-review suppression helper: that
 * view uses token-subset matching for phrase negatives, which would incorrectly
 * hide a violation such as "agency temp" for the phrase negative "temp agency".
 */
function normaliseText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function negativeCoversTerm(term: string, keyword: string, matchType: CoverageMatchType): boolean {
  const normalisedTerm = normaliseText(term);
  const normalisedKeyword = normaliseText(keyword);
  if (!normalisedTerm || !normalisedKeyword) return false;
  if (matchType === "exact") return normalisedTerm === normalisedKeyword;

  const termWords = normalisedTerm.split(" ");
  const keywordWords = normalisedKeyword.split(" ");
  if (matchType === "phrase") {
    return termWords.some((_, start) =>
      termWords.slice(start, start + keywordWords.length).join(" ") === normalisedKeyword,
    );
  }

  const termWordSet = new Set(termWords);
  return keywordWords.every((word) => termWordSet.has(word));
}

export function findCoveringNegative(
  term: string,
  ctx: CoverageContext,
  nkls: readonly CoverageNkl[],
): CoverageMatch | null {
  for (const nkl of nkls) {
    if (!nklAppliesToViolation(nkl, ctx)) continue;
    const keywords = Array.isArray(nkl.keywords) ? nkl.keywords : [];
    for (const kw of keywords) {
      const keyword = typeof kw?.keyword === "string" ? kw.keyword : "";
      if (!keyword) continue;
      const raw = String(kw?.matchType ?? "").toLowerCase();
      const matchType: CoverageMatchType =
        raw === "exact" ? "exact" : raw === "broad" ? "broad" : "phrase";
      if (negativeCoversTerm(term, keyword, matchType)) {
        return { keyword, matchType, listName: nkl.name || "Unnamed NKL" };
      }
    }
  }
  return null;
}

/** Convenience boolean wrapper around {@link findCoveringNegative}. */
export function isTermCoveredByCampaignNegatives(
  term: string,
  ctx: CoverageContext,
  nkls: readonly CoverageNkl[],
): boolean {
  return findCoveringNegative(term, ctx, nkls) !== null;
}
