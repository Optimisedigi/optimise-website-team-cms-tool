import { canonMatchTypeToken } from "@/lib/match-type-synonyms";

export interface AllowListTermInput {
  term?: string | null;
  active?: boolean | null;
}

export const DEFAULT_ALLOW_LIST_TERMS = [
  "it",
  "hr",
  "seo",
  "ppc",
  "cpa",
  "smm",
  "crm",
  "erp",
  "saas",
  "ea",
  "va",
  "pa",
  "ux",
  "ui",
  "dev",
  "cto",
  "cfo",
  "coo",
  "ceo",
];

const DEFAULT_ALLOW_LIST_SET = new Set(DEFAULT_ALLOW_LIST_TERMS.map(canonMatchTypeToken));

export function normaliseAllowListTerm(term: string): string {
  return canonMatchTypeToken(term);
}

export function buildAllowListSet(savedAllowList: AllowListTermInput[] = []): Set<string> {
  const allowed = new Set(DEFAULT_ALLOW_LIST_SET);
  for (const item of savedAllowList) {
    if (item.active === false) continue;
    const term = normaliseAllowListTerm(String(item.term ?? ""));
    if (term) allowed.add(term);
  }
  return allowed;
}

export function isAllowedMatchTypeToken(token: string, savedAllowList: AllowListTermInput[] = []): boolean {
  const normalised = normaliseAllowListTerm(token);
  if (!normalised) return true;
  return buildAllowListSet(savedAllowList).has(normalised);
}

export function hasLikelyUnknownBrandToken(
  searchWords: readonly string[],
  keywordWords: readonly string[],
  savedAllowList: AllowListTermInput[] = [],
  dictionary: { has: (word: string) => boolean },
): boolean {
  const keywordSet = new Set(keywordWords.map(canonMatchTypeToken));
  const allowList = buildAllowListSet(savedAllowList);

  return searchWords.some((word) => {
    const normalised = canonMatchTypeToken(word);
    if (!normalised) return false;
    if (keywordSet.has(normalised)) return false;
    if (allowList.has(normalised)) return false;
    return !dictionary.has(normalised);
  });
}
