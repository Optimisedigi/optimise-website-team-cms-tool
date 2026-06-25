export interface SynonymRuleInput {
  id?: string | number;
  termA?: string | null;
  termB?: string | null;
  contextTerms?: string | null;
  active?: boolean | null;
}

export interface SynonymCandidateContext {
  searchTerm?: string | null;
  triggeringKeyword?: string | null;
  campaignName?: string | null;
  adGroupName?: string | null;
}

export const DEFAULT_SYNONYM_GROUPS: string[][] = [
  ['assistant', 'assistants', 'va', 'admin', 'administrator', 'receptionist', 'receptionists', 'staff', 'support'],
  ['outsource', 'outsourcing', 'outsourced', 'hire', 'hiring', 'recruit', 'recruitment', 'staffing'],
  ['service', 'services', 'agency', 'company', 'provider', 'consultant', 'consultants'],
  ['price', 'pricing', 'cost', 'costs', 'quote', 'quotes', 'fee', 'fees', 'rate', 'rates'],
  ['management', 'managed', 'manager'],
  ['software', 'platform', 'tool', 'tools', 'system', 'systems'],
];

const STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  // Keep “it” because in Google Ads keywords it commonly means Information Technology
  // (e.g. “IT services”) and needs to be teachable as a synonym token.
  'of', 'with', 'by', 'from', 'is', 'as', 'be', 'are', 'this',
  'that', 'these', 'those', 'your', 'our', 'their', 'my', 'near', 'me',
]);

export function canonMatchTypeToken(token: string): string {
  const s = String(token ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  if (s.length <= 3) return s;
  if (s.endsWith('ies')) return s.slice(0, -3) + 'y';
  if (s.endsWith('es')) return s.slice(0, -2);
  if (s.endsWith('s')) return s.slice(0, -1);
  return s;
}

export function contentWords(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(canonMatchTypeToken)
    .filter((word) => word && !STOPWORDS.has(word));
}

function contextTokens(contextTerms: string | null | undefined): string[] {
  return String(contextTerms ?? '')
    .split(/[\n,]+/)
    .flatMap((term) => contentWords(term));
}

function ruleTokens(term: string | null | undefined): string[] {
  return contentWords(String(term ?? ''));
}

function hasAny(words: readonly string[], candidates: readonly string[]): boolean {
  if (words.length === 0 || candidates.length === 0) return false;
  const set = new Set(words);
  return candidates.some((candidate) => set.has(candidate));
}

function contextMatches(rule: SynonymRuleInput, candidateContext?: SynonymCandidateContext): boolean {
  const required = contextTokens(rule.contextTerms);
  if (required.length === 0) return true;

  const context = [
    candidateContext?.searchTerm,
    candidateContext?.triggeringKeyword,
    candidateContext?.campaignName,
    candidateContext?.adGroupName,
  ].filter(Boolean).join(' ');
  const candidateTokens = contentWords(context);
  return hasAny(candidateTokens, required);
}

export function buildSynonymGroups(rules: SynonymRuleInput[] = []): Set<string>[] {
  const groups = DEFAULT_SYNONYM_GROUPS.map((group) => new Set(group.map(canonMatchTypeToken)));
  for (const rule of rules) {
    if (rule.active === false) continue;
    if (contextTokens(rule.contextTerms).length > 0) continue;
    const tokens = [...ruleTokens(rule.termA), ...ruleTokens(rule.termB)];
    if (tokens.length >= 2) groups.push(new Set(tokens));
  }
  return groups;
}

export function countSynonymOverlap(
  searchWords: readonly string[],
  keywordWords: readonly string[],
  rules: SynonymRuleInput[] = [],
  candidateContext?: SynonymCandidateContext,
): number {
  let count = 0;
  const search = searchWords.map(canonMatchTypeToken);
  const keyword = keywordWords.map(canonMatchTypeToken);

  for (const group of buildSynonymGroups(rules)) {
    const hasSearchWord = search.some((word) => group.has(word));
    const hasKeywordWord = keyword.some((word) => group.has(word));
    const hasDirectSharedWord = search.some((word) => keyword.includes(word) && group.has(word));
    if (hasSearchWord && hasKeywordWord && !hasDirectSharedWord) count += 1;
  }

  for (const rule of rules) {
    if (rule.active === false) continue;
    if (contextTokens(rule.contextTerms).length === 0) continue;
    if (!contextMatches(rule, candidateContext)) continue;

    const a = ruleTokens(rule.termA);
    const b = ruleTokens(rule.termB);
    if (a.length === 0 || b.length === 0) continue;

    const searchHasA = hasAny(search, a);
    const searchHasB = hasAny(search, b);
    const keywordHasA = hasAny(keyword, a);
    const keywordHasB = hasAny(keyword, b);
    if ((searchHasA && keywordHasB) || (searchHasB && keywordHasA)) {
      count += 1;
    }
  }

  return count;
}
