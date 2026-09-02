/**
 * After a search term is promoted to an EXACT keyword in target ad groups, the
 * term should stop serving via the original phrase/exact keyword that triggered
 * it. That is an ad-group-level EXACT negative on the source ad group — never a
 * shared negative keyword list (those attach at campaign level and can block
 * the new exacts).
 */
const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export interface SourceAdGroup {
  adGroupId: string;
  adGroupName: string;
  campaignName: string;
}

export interface AdGroupRow {
  adGroupId?: string;
  adGroupName?: string;
  campaignName?: string;
  status?: string;
}

export interface NegateResult {
  adGroupId: string;
  adGroupName: string;
  campaignName: string;
  alreadyPresent: boolean;
}

export function resolveSourceAdGroup(
  adGroups: AdGroupRow[],
  candidate: { adGroupName?: string | null; campaignName?: string | null },
): SourceAdGroup | null {
  const adGroupName = String(candidate.adGroupName ?? "").trim();
  const campaignName = String(candidate.campaignName ?? "").trim();
  if (!adGroupName || !campaignName) return null;

  const nameMatches = adGroups.filter(
    (g) => g.adGroupId && String(g.adGroupName ?? "").toLowerCase() === adGroupName.toLowerCase(),
  );
  const campaignMatches = nameMatches.filter(
    (g) => String(g.campaignName ?? "").toLowerCase() === campaignName.toLowerCase(),
  );
  const pool = campaignMatches.length > 0 ? campaignMatches : nameMatches;
  const enabled = pool.filter((g) => String(g.status ?? "ENABLED").toUpperCase() !== "REMOVED");
  const pick = (enabled.length > 0 ? enabled : pool)[0];
  if (!pick?.adGroupId) return null;
  return {
    adGroupId: String(pick.adGroupId),
    adGroupName: String(pick.adGroupName ?? adGroupName),
    campaignName: String(pick.campaignName ?? campaignName),
  };
}

export async function negateExactInSourceAdGroup(args: {
  customerId: string;
  source: SourceAdGroup;
  keywordText: string;
}): Promise<NegateResult> {
  const { customerId, source, keywordText } = args;
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    throw new Error("GROWTH_TOOLS_URL or INTERNAL_API_KEY is not configured");
  }
  const text = keywordText.trim();
  if (!text) throw new Error("No keyword text");

  let res: Response;
  try {
    res = await fetch(
      `${GROWTH_TOOLS_URL}/api/google-ads/ad-groups/${encodeURIComponent(source.adGroupId)}/negative-keywords/add`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          customerId,
          keywords: [{ text, matchType: "EXACT" }],
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch (err) {
    throw new Error(`Network error adding ad-group negative: ${(err as Error).message}`);
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const errMsg =
      parsed && typeof parsed === "object" && (parsed as { error?: unknown }).error
        ? String((parsed as { error?: unknown }).error)
        : `Growth Tools HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  const result = (parsed ?? {}) as {
    added?: number;
    skippedDuplicates?: number;
    errors?: Array<{ error?: string }>;
  };
  const added = Number(result.added ?? 0);
  const skipped = Number(result.skippedDuplicates ?? 0);
  if (added === 0 && skipped === 0) {
    const first = Array.isArray(result.errors) ? result.errors[0]?.error : null;
    throw new Error(first || "Growth Tools reported nothing added and no duplicates");
  }

  return {
    adGroupId: source.adGroupId,
    adGroupName: source.adGroupName,
    campaignName: source.campaignName,
    alreadyPresent: added === 0 && skipped > 0,
  };
}
