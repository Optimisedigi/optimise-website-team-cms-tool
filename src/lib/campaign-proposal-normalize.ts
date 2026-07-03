type KeywordLike = Record<string, unknown> | string | null | undefined;

type NormalizedKeyword = {
  text: string;
  matchType: "PHRASE" | "EXACT" | "BROAD";
  monthlySearchVolume: number;
  competition: string;
  competitionIndex: number;
  lowCpcMicros: number;
  highCpcMicros: number;
  existingCampaign?: string;
  existingAdGroup?: string;
  existingClicks?: number;
  existingImpressions?: number;
  existingCost?: number;
  existingConversions?: number;
};

const KEYWORD_ARRAY_FIELDS = [
  "keywords",
  "topKeywords",
  "keywordIdeas",
  "keywordsUsed",
] as const;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeMatchType(value: unknown): "PHRASE" | "EXACT" | "BROAD" {
  const matchType = asString(value).toUpperCase();
  if (matchType === "EXACT" || matchType === "BROAD") return matchType;
  return "PHRASE";
}

function normalizeKeyword(keyword: KeywordLike): NormalizedKeyword | null {
  if (typeof keyword === "string") {
    const text = keyword.trim();
    if (!text) return null;
    return {
      text,
      matchType: "PHRASE",
      monthlySearchVolume: 0,
      competition: "UNKNOWN",
      competitionIndex: 0,
      lowCpcMicros: 0,
      highCpcMicros: 0,
    };
  }

  const source = asObject(keyword);
  if (!source) return null;

  const text = [
    source.text,
    source.keyword,
    source.phrase,
    source.searchTerm,
    source.name,
  ].map(asString).find(Boolean) || "";
  if (!text) return null;

  const normalized: NormalizedKeyword = {
    text,
    matchType: normalizeMatchType(source.matchType),
    monthlySearchVolume: asFiniteNumber(
      source.monthlySearchVolume ?? source.volume ?? source.searchVolume ?? source.avgMonthlySearches,
    ),
    competition: asString(source.competition) || "UNKNOWN",
    competitionIndex: asFiniteNumber(source.competitionIndex),
    lowCpcMicros: asFiniteNumber(source.lowCpcMicros),
    highCpcMicros: asFiniteNumber(source.highCpcMicros),
  };

  const existingCampaign = asString(source.existingCampaign);
  if (existingCampaign) normalized.existingCampaign = existingCampaign;
  const existingAdGroup = asString(source.existingAdGroup);
  if (existingAdGroup) normalized.existingAdGroup = existingAdGroup;

  const existingClicks = source.existingClicks;
  if (existingClicks != null) normalized.existingClicks = asFiniteNumber(existingClicks);
  const existingImpressions = source.existingImpressions;
  if (existingImpressions != null) normalized.existingImpressions = asFiniteNumber(existingImpressions);
  const existingCost = source.existingCost;
  if (existingCost != null) normalized.existingCost = asFiniteNumber(existingCost);
  const existingConversions = source.existingConversions;
  if (existingConversions != null) normalized.existingConversions = asFiniteNumber(existingConversions);

  return normalized;
}

function collectKeywords(adGroup: Record<string, unknown>): NormalizedKeyword[] {
  const byText = new Map<string, NormalizedKeyword>();

  for (const field of KEYWORD_ARRAY_FIELDS) {
    const value = adGroup[field];
    if (!Array.isArray(value)) continue;

    for (const candidate of value) {
      const keyword = normalizeKeyword(candidate as KeywordLike);
      if (!keyword) continue;

      const key = keyword.text.toLowerCase();
      const existing = byText.get(key);
      if (!existing || keyword.monthlySearchVolume > existing.monthlySearchVolume) {
        byText.set(key, keyword);
      }
    }
  }

  return Array.from(byText.values()).sort((a, b) => b.monthlySearchVolume - a.monthlySearchVolume);
}

export function normalizeCampaignProposalKeywords<T>(campaignProposal: T): T {
  const proposal = asObject(campaignProposal);
  if (!proposal || !Array.isArray(proposal.proposedCampaigns)) return campaignProposal;

  return {
    ...proposal,
    proposedCampaigns: proposal.proposedCampaigns.map((campaign) => {
      const campaignObject = asObject(campaign);
      if (!campaignObject || !Array.isArray(campaignObject.adGroups)) return campaign;

      const adGroups = campaignObject.adGroups.map((adGroup) => {
        const adGroupObject = asObject(adGroup);
        if (!adGroupObject) return adGroup;

        const keywords = collectKeywords(adGroupObject);
        if (keywords.length === 0) {
          return {
            ...adGroupObject,
            keywords: [],
          };
        }

        const existingVolume = asFiniteNumber(adGroupObject.totalMonthlyVolume, NaN);
        const keywordVolume = keywords.reduce((sum, keyword) => sum + keyword.monthlySearchVolume, 0);

        return {
          ...adGroupObject,
          keywords,
          totalMonthlyVolume: Number.isFinite(existingVolume) && existingVolume > 0
            ? existingVolume
            : keywordVolume,
        };
      });

      const existingVolume = asFiniteNumber(campaignObject.totalMonthlyVolume, NaN);
      const adGroupVolume = adGroups.reduce((sum, adGroup) => {
        const adGroupObject = asObject(adGroup);
        return sum + asFiniteNumber(adGroupObject?.totalMonthlyVolume);
      }, 0);

      return {
        ...campaignObject,
        adGroups,
        totalMonthlyVolume: Number.isFinite(existingVolume) && existingVolume > 0
          ? existingVolume
          : adGroupVolume,
      };
    }),
  } as T;
}
