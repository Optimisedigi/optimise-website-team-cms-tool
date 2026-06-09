/**
 * Match-Type Monitor scope filtering.
 *
 * Single source of truth for which violations a client actually polices, applied
 * CMS-side after the Growth Tools detector returns account-wide violations. Two
 * independent gates: a match-type gate (separate EXACT / PHRASE toggles) and an
 * optional campaign / ad-group allow-list. A violation is kept only when it
 * passes both gates. All reads are null-safe so pre-migration client rows behave
 * exactly as before (both match types on, no allow-list).
 */

import { matchesPattern } from "@/lib/nkl-routing";

/** Per-client monitoring scope derived from the `gadsAuto` group. */
export interface MatchTypeMonitorScope {
  exact: boolean;
  phrase: boolean;
  allowList: Array<{ scope: "campaign" | "ad_group"; pattern: string }>;
}

/** Minimal violation shape needed to decide whether it is monitored. */
export interface FilterableViolation {
  matchType: "EXACT" | "PHRASE";
  campaignName?: string | null;
  adGroupName?: string | null;
}

/**
 * Read the monitoring scope off a client document. Missing fields default to
 * both match types enabled and an empty allow-list, so a client that predates
 * these columns is monitored account-wide just like today. Allow-list entries
 * with a blank pattern are ignored.
 */
export function readScope(clientDoc: unknown): MatchTypeMonitorScope {
  const gadsAuto = (clientDoc as { gadsAuto?: Record<string, unknown> } | null)?.gadsAuto ?? {};
  const exact = gadsAuto.matchTypeMonitorExact ?? true;
  const phrase = gadsAuto.matchTypeMonitorPhrase ?? true;
  const rawList = Array.isArray(gadsAuto.matchTypeMonitorAllowList)
    ? gadsAuto.matchTypeMonitorAllowList
    : [];

  const allowList: MatchTypeMonitorScope["allowList"] = [];
  for (const entry of rawList) {
    const scope = (entry as { scope?: unknown })?.scope;
    const pattern = String((entry as { pattern?: unknown })?.pattern ?? "").trim();
    if (!pattern) continue;
    if (scope !== "campaign" && scope !== "ad_group") continue;
    allowList.push({ scope, pattern });
  }

  return { exact: Boolean(exact), phrase: Boolean(phrase), allowList };
}

/**
 * True when a violation should be kept under the given scope. Passes the
 * match-type gate when the violation's match type is enabled, and the allow-list
 * gate when the list is empty or at least one entry matches the relevant name.
 */
export function isMonitored(v: FilterableViolation, scope: MatchTypeMonitorScope): boolean {
  // Match-type gate
  if (v.matchType === "EXACT" && !scope.exact) return false;
  if (v.matchType === "PHRASE" && !scope.phrase) return false;

  // Allow-list gate (empty list = monitor everything)
  if (scope.allowList.length === 0) return true;

  return scope.allowList.some((entry) =>
    entry.scope === "campaign"
      ? matchesPattern(v.campaignName ?? "", entry.pattern)
      : matchesPattern(v.adGroupName ?? "", entry.pattern),
  );
}

/** Keep only the violations monitored under the given scope. */
export function filterViolations<T extends FilterableViolation>(
  violations: readonly T[],
  scope: MatchTypeMonitorScope,
): T[] {
  return violations.filter((v) => isMonitored(v, scope));
}
