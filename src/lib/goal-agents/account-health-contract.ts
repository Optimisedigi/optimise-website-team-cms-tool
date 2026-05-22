/**
 * Account Health Contract — read helpers for goal agents.
 *
 * Per-client invariants set once at onboarding (see
 * docs/goal-agents-architecture-and-build-plan.md §Layer 2). Goal agents
 * call these helpers to learn the spend policy, protected campaign IDs, and
 * brand campaign IDs before deciding on any action.
 *
 * Pure reads only — this module never writes and never calls external
 * services. Style matches src/lib/google-ads-snapshots/index.ts: an
 * injected `payload: Payload` first arg, explicit return types, zero `any`.
 */

import type { Payload } from "payload";

import type { Client } from "../../payload-types";

/** How this client's spend is paced. See architecture doc §Layer 3. */
export type PacingMode =
  | "fixed_monthly"
  | "performance_cap"
  | "roas_target"
  | "seasonal";

/**
 * Window the spend pacer evaluates against. Only calendar month is
 * supported today; the enum stays open for future windows.
 */
export type PacingWindow = "calendar_month";

/** Default lower bound of the acceptable spend variance band, percent. */
const DEFAULT_VARIANCE_LOW = 90;
/** Default upper bound of the acceptable spend variance band, percent. */
const DEFAULT_VARIANCE_HIGH = 105;
/** Default pacing window when the client has not set one explicitly. */
const DEFAULT_PACING_WINDOW: PacingWindow = "calendar_month";

export interface SpendPolicy {
  pacingMode: PacingMode | null;
  pacingWindow: PacingWindow;
  monthlyBudgetTarget: number | null;
  /** Default 90. */
  acceptableVariancePercentLow: number;
  /** Default 105. */
  acceptableVariancePercentHigh: number;
  hardFloor: number | null;
  hardCeiling: number | null;
}

export interface AccountHealthContract {
  clientId: string | number;
  spendPolicy: SpendPolicy;
  /** Normalised: trimmed, deduped, empty strings removed. */
  protectedCampaignIds: ReadonlyArray<string>;
  /** Normalised: trimmed, deduped, empty strings removed. */
  brandCampaignIds: ReadonlyArray<string>;
  /** True iff pacingMode is set OR monthlyBudgetTarget > 0. */
  hasPolicy: boolean;
}

/**
 * Normalise an `Array<{ campaignId?: string | null }>` (the shape Payload
 * generates for the `protectedCampaignIds` / `brandCampaignIds` arrays)
 * into a deduplicated, trimmed, non-empty list of strings. Order of first
 * occurrence is preserved.
 */
function normaliseCampaignIdList(
  raw: ReadonlyArray<{ campaignId?: string | null }> | null | undefined,
): string[] {
  if (!raw || raw.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const value = entry?.campaignId;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "") continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function buildSpendPolicy(raw: Client["spendPolicy"]): SpendPolicy {
  const sp = raw ?? {};
  const pacingMode: PacingMode | null = sp.pacingMode ?? null;
  const pacingWindow: PacingWindow = sp.pacingWindow ?? DEFAULT_PACING_WINDOW;
  const monthlyBudgetTarget: number | null =
    typeof sp.monthlyBudgetTarget === "number" ? sp.monthlyBudgetTarget : null;
  const acceptableVariancePercentLow: number =
    typeof sp.acceptableVariancePercentLow === "number"
      ? sp.acceptableVariancePercentLow
      : DEFAULT_VARIANCE_LOW;
  const acceptableVariancePercentHigh: number =
    typeof sp.acceptableVariancePercentHigh === "number"
      ? sp.acceptableVariancePercentHigh
      : DEFAULT_VARIANCE_HIGH;
  const hardFloor: number | null =
    typeof sp.hardFloor === "number" ? sp.hardFloor : null;
  const hardCeiling: number | null =
    typeof sp.hardCeiling === "number" ? sp.hardCeiling : null;
  return {
    pacingMode,
    pacingWindow,
    monthlyBudgetTarget,
    acceptableVariancePercentLow,
    acceptableVariancePercentHigh,
    hardFloor,
    hardCeiling,
  };
}

function computeHasPolicy(policy: SpendPolicy): boolean {
  if (policy.pacingMode !== null) return true;
  if (
    policy.monthlyBudgetTarget !== null &&
    policy.monthlyBudgetTarget > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Fetch a client's Account Health Contract. Returns `null` if the client
 * cannot be loaded (not found, access error, anything else). Never throws.
 *
 * Reads with `overrideAccess: true` and `depth: 0` — this is a low-level
 * helper for trusted agent code, not a request handler.
 */
export async function getAccountHealthContract(
  payload: Payload,
  clientId: string | number,
): Promise<AccountHealthContract | null> {
  let doc: Client;
  try {
    doc = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
      depth: 0,
    });
  } catch {
    return null;
  }
  const spendPolicy = buildSpendPolicy(doc.spendPolicy);
  const protectedCampaignIds = normaliseCampaignIdList(doc.protectedCampaignIds);
  const brandCampaignIds = normaliseCampaignIdList(doc.brandCampaignIds);
  return {
    clientId: doc.id,
    spendPolicy,
    protectedCampaignIds,
    brandCampaignIds,
    hasPolicy: computeHasPolicy(spendPolicy),
  };
}

function normaliseForMatch(value: string): string {
  return value.trim().toLowerCase();
}

function listIncludes(
  list: ReadonlyArray<string>,
  campaignId: string,
): boolean {
  if (list.length === 0) return false;
  const needle = normaliseForMatch(String(campaignId));
  if (needle === "") return false;
  for (const id of list) {
    if (normaliseForMatch(id) === needle) return true;
  }
  return false;
}

/**
 * True if `campaignId` is in the contract's protected list. Comparison is
 * case-insensitive and ignores surrounding whitespace on both sides.
 */
export function isCampaignProtected(
  contract: AccountHealthContract,
  campaignId: string,
): boolean {
  return listIncludes(contract.protectedCampaignIds, campaignId);
}

/**
 * True if `campaignId` is flagged as a brand campaign on the contract.
 * Comparison is case-insensitive and ignores surrounding whitespace.
 */
export function isBrandCampaign(
  contract: AccountHealthContract,
  campaignId: string,
): boolean {
  return listIncludes(contract.brandCampaignIds, campaignId);
}
