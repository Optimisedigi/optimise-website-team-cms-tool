// Pure helpers for auto-hiding monthly search terms that are already covered by
// a phrase/exact negative on a selected suppression NKL. Kept dependency-free
// and side-effect-free so the matching semantics are unit-testable in isolation
// from the React component and Payload.

export type SuppressionMatchType = 'exact' | 'phrase'

export type SuppressionNegative = {
  keyword: string
  matchType: SuppressionMatchType
  listName: string
  // The review month (YYYY-MM) this negative was established in, when known.
  // Informational only — a live negative suppresses ALL review months: once the
  // team has negated a term, re-reviewing it in any month is pointless (the
  // page exists to surface irrelevant terms, not already-handled ones).
  establishedMonth: string | null
}

// Minimal shape of an NKL needed to derive suppression negatives. Mirrors the
// `depth=0` payload from /api/negative-keyword-lists.
export type SuppressionNkl = {
  name?: string | null
  keywords?: Array<{ keyword?: string | null; matchType?: string | null; negatedAt?: string | null }> | null
}

const QUALIFYING_NAME_FRAGMENTS = ['accountwide', 'competitor', 'brand'] as const

/**
 * Until a client saves an explicit suppression-list selection, these name
 * fragments preserve the previous default suppression behaviour. Spaces/hyphens
 * are ignored so both "Account-wide negatives" and "Account wide negatives"
 * qualify.
 */
export function isQualifyingListName(name: string | null | undefined): boolean {
  if (!name) return false
  const lower = name.toLowerCase().replace(/[\s-]+/g, '')
  return QUALIFYING_NAME_FRAGMENTS.some((fragment) => lower.includes(fragment))
}

/** Lowercase, trim, and collapse internal runs of whitespace to single spaces. */
export function normalizeTermText(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Normalized whitespace tokens of a term/keyword. Empty input yields []. */
export function tokenize(value: string): string[] {
  const normalized = normalizeTermText(value)
  return normalized.length === 0 ? [] : normalized.split(' ')
}

/**
 * Whether a search term is covered by a negative.
 * - exact: the whole normalized term equals the normalized keyword.
 * - phrase: every token of the keyword appears in the term's token set
 *   (order-independent). This intentionally does not require adjacency so it
 *   only hides terms that the negative genuinely blocks across word orders.
 */
export function termMatchesNegative(
  term: string,
  negative: { keyword: string; matchType: SuppressionMatchType },
): boolean {
  if (negative.matchType === 'exact') {
    return normalizeTermText(term) === normalizeTermText(negative.keyword)
  }
  const keywordTokens = tokenize(negative.keyword)
  if (keywordTokens.length === 0) return false
  const termTokens = new Set(tokenize(term))
  return keywordTokens.every((token) => termTokens.has(token))
}

function establishedMonthFor(
  keyword: string,
  matchType: SuppressionMatchType,
  establishedMonthByKey: Map<string, string>,
  negatedAt: string | null | undefined,
): string | null {
  const fromApplied = establishedMonthByKey.get(`${keyword.toLowerCase()}|${matchType}`)
  if (fromApplied) return fromApplied
  if (typeof negatedAt === 'string' && /^\d{4}-\d{2}/.test(negatedAt)) {
    return negatedAt.slice(0, 7)
  }
  return null
}

/**
 * Flatten selected NKLs into suppression negatives. Only `phrase` and `exact`
 * keywords participate (broad is ignored). Each negative's establishment month
 * is taken from `establishedMonthByKey` (the earliest review month it was
 * applied in via this tool) and falls back to the keyword's `negatedAt` month.
 */
export function buildSuppressionNegatives(
  nkls: SuppressionNkl[],
  establishedMonthByKey: Map<string, string>,
): SuppressionNegative[] {
  const negatives: SuppressionNegative[] = []
  for (const nkl of nkls) {
    const listName = nkl.name || 'Unnamed NKL'
    for (const kw of Array.isArray(nkl.keywords) ? nkl.keywords : []) {
      const keyword = typeof kw?.keyword === 'string' ? kw.keyword : ''
      const matchType = kw?.matchType
      if (!keyword || (matchType !== 'exact' && matchType !== 'phrase')) continue
      negatives.push({
        keyword,
        matchType,
        listName,
        establishedMonth: establishedMonthFor(keyword, matchType, establishedMonthByKey, kw?.negatedAt ?? null),
      })
    }
  }
  return negatives
}

/**
 * Split a review month's terms into still-visible terms and ones already
 * covered by a selected suppression negative. A live negative suppresses EVERY
 * review month — past and future — because once a term is negated there's nothing
 * left to decide about it; the review exists to catch irrelevant terms, not
 * already-handled ones. (`reviewMonth` is kept for call-site symmetry and the
 * "Already negated" panel's context.)
 */
export function partitionTermsByNegation<T extends { term: string }>(
  _reviewMonth: string,
  terms: T[],
  negatives: SuppressionNegative[],
): { visible: T[]; negated: Array<{ term: T; negative: SuppressionNegative }> } {
  const visible: T[] = []
  const negated: Array<{ term: T; negative: SuppressionNegative }> = []
  for (const term of terms) {
    const match = negatives.find((negative) => termMatchesNegative(term.term, negative))
    if (match) negated.push({ term, negative: match })
    else visible.push(term)
  }
  return { visible, negated }
}
