/**
 * Negative-keyword-list (NKL) routing helpers.
 *
 * Single source of truth for the "which NKL does this campaign / ad group map
 * to" logic used by both the campaign-preview UI and the match-type-violation
 * approve flow. The `campaignRegex` field on an NKL is matched against a
 * campaign or ad group name: plain text (letters/numbers/spaces/-/_) is treated
 * as a `.*text.*` case-insensitive substring; otherwise it is compiled as a
 * regex, falling back to a plain substring match when the pattern is invalid.
 */

/** Scope of a negative keyword list, mirroring the collection's `scope` field. */
export type NklScope = "account" | "campaign" | "ad_group";

/** Minimal NKL shape needed for routing decisions. */
export interface RoutableNkl {
  id: string | number;
  scope?: NklScope | null;
  adGroupName?: string | null;
  campaignRegex?: string | null;
  isActive?: boolean | null;
}

/** Candidate context used to pick a matching ad-group NKL. */
export interface RoutingContext {
  adGroupName?: string | null;
  campaignName?: string | null;
}

/**
 * True when `campaignRegex` matches `name`. Plain text is wrapped as a
 * case-insensitive `.*text.*` substring; a regex pattern is compiled and tested,
 * and an invalid pattern degrades to a lowercase substring containment check.
 * An empty/blank pattern matches everything (the "no filter" case).
 */
export function matchesPattern(name: string, campaignRegex: string | null | undefined): boolean {
  const target = String(name ?? "");
  const raw = String(campaignRegex ?? "").trim();
  if (!raw) return true;

  let regexStr = raw;
  // Plain text (only letters, numbers, spaces, hyphens, underscores) → .*text.*
  if (/^[a-zA-Z0-9 _-]+$/.test(regexStr)) {
    regexStr = `.*${regexStr}.*`;
  }
  try {
    return new RegExp(regexStr, "i").test(target);
  } catch {
    return target.toLowerCase().includes(raw.toLowerCase());
  }
}

/**
 * Pick the best active NKL whose scope/regex matches the candidate's ad group.
 * Preference order:
 *   1. `scope: 'ad_group'` with an exact (case-insensitive) `adGroupName` match.
 *   2. `scope: 'ad_group'` whose `campaignRegex` matches the ad group name.
 *   3. Any active list whose `campaignRegex` matches the campaign name.
 * Returns `null` when nothing matches.
 */
export function pickAdGroupList<T extends RoutableNkl>(
  lists: readonly T[],
  ctx: RoutingContext,
): T | null {
  const active = lists.filter((l) => l.isActive !== false);
  const adGroupName = String(ctx.adGroupName ?? "").trim();
  const campaignName = String(ctx.campaignName ?? "").trim();

  if (adGroupName) {
    const exact = active.find(
      (l) =>
        l.scope === "ad_group" &&
        String(l.adGroupName ?? "").trim().toLowerCase() === adGroupName.toLowerCase(),
    );
    if (exact) return exact;

    const regexAdGroup = active.find(
      (l) => l.scope === "ad_group" && !!l.campaignRegex && matchesPattern(adGroupName, l.campaignRegex),
    );
    if (regexAdGroup) return regexAdGroup;
  }

  if (campaignName) {
    const regexCampaign = active.find(
      (l) => !!l.campaignRegex && matchesPattern(campaignName, l.campaignRegex),
    );
    if (regexCampaign) return regexCampaign;
  }

  return null;
}
