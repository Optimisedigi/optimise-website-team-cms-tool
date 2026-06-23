import {
  buildSuppressionNegatives,
  isQualifyingListName,
  normalizeTermText,
  partitionTermsByNegation,
  termMatchesNegative,
  tokenize,
  type SuppressionNegative,
} from '@/lib/negative-keyword-suppression'

describe('isQualifyingListName', () => {
  it('matches account-wide/account wide, competitor, and brand regardless of case', () => {
    expect(isQualifyingListName('Account-wide negatives')).toBe(true)
    expect(isQualifyingListName('[OD] Account wide negatives')).toBe(true)
    expect(isQualifyingListName('COMPETITOR terms')).toBe(true)
    expect(isQualifyingListName('Brand protection')).toBe(true)
  })
  it('rejects non-qualifying names and empty input', () => {
    expect(isQualifyingListName('General waste')).toBe(false)
    expect(isQualifyingListName('')).toBe(false)
    expect(isQualifyingListName(null)).toBe(false)
    expect(isQualifyingListName(undefined)).toBe(false)
  })
})

describe('normalizeTermText / tokenize', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeTermText('  Cheap   BLUE  Shoes ')).toBe('cheap blue shoes')
  })
  it('tokenizes into normalized whitespace tokens', () => {
    expect(tokenize('  Blue   Shoes ')).toEqual(['blue', 'shoes'])
    expect(tokenize('   ')).toEqual([])
  })
})

describe('termMatchesNegative', () => {
  it('exact matches only the whole normalized term', () => {
    expect(termMatchesNegative('blue shoes', { keyword: 'Blue  Shoes', matchType: 'exact' })).toBe(true)
    expect(termMatchesNegative('cheap blue shoes', { keyword: 'blue shoes', matchType: 'exact' })).toBe(false)
  })
  it('phrase matches order-independently when all keyword tokens are present', () => {
    expect(termMatchesNegative('cheap blue running shoes', { keyword: 'blue shoes', matchType: 'phrase' })).toBe(true)
    expect(termMatchesNegative('shoes blue', { keyword: 'blue shoes', matchType: 'phrase' })).toBe(true)
  })
  it('phrase does not match when a keyword token is missing', () => {
    expect(termMatchesNegative('blue socks', { keyword: 'blue shoes', matchType: 'phrase' })).toBe(false)
  })
})

describe('buildSuppressionNegatives', () => {
  it('includes selected lists, ignores broad keywords, and resolves established months', () => {
    const established = new Map<string, string>([['blue shoes|phrase', '2024-01']])
    const negatives = buildSuppressionNegatives(
      [
        {
          name: 'Competitor list',
          keywords: [
            { keyword: 'Blue Shoes', matchType: 'phrase' },
            { keyword: 'red hat', matchType: 'broad' },
            { keyword: 'green cap', matchType: 'exact', negatedAt: '2024-03-15T00:00:00.000Z' },
          ],
        },
        {
          name: 'General waste',
          keywords: [{ keyword: 'ignored', matchType: 'exact' }],
        },
      ],
      established,
    )
    expect(negatives).toHaveLength(3)
    const phrase = negatives.find((n) => n.keyword === 'Blue Shoes')
    expect(phrase).toMatchObject({ matchType: 'phrase', listName: 'Competitor list', establishedMonth: '2024-01' })
    const exact = negatives.find((n) => n.keyword === 'green cap')
    // Falls back to the negatedAt month when no applied selection exists.
    expect(exact).toMatchObject({ matchType: 'exact', establishedMonth: '2024-03' })
    expect(negatives.find((n) => n.keyword === 'ignored')).toMatchObject({ matchType: 'exact', listName: 'General waste' })
  })
  it('leaves establishedMonth null when no applied month and no negatedAt', () => {
    const negatives = buildSuppressionNegatives(
      [{ name: 'Brand', keywords: [{ keyword: 'acme', matchType: 'exact' }] }],
      new Map(),
    )
    expect(negatives[0]?.establishedMonth).toBeNull()
  })
})

describe('partitionTermsByNegation', () => {
  const negatives: SuppressionNegative[] = [
    { keyword: 'blue shoes', matchType: 'phrase', listName: 'Competitor', establishedMonth: '2024-01' },
  ]
  it('hides matching terms in any review month', () => {
    const terms = [{ term: 'cheap blue shoes' }, { term: 'blue socks' }]
    const after = partitionTermsByNegation('2024-02', terms, negatives)
    expect(after.visible.map((t) => t.term)).toEqual(['blue socks'])
    expect(after.negated).toHaveLength(1)
    expect(after.negated[0]?.negative.listName).toBe('Competitor')
  })
  it('hides a search term covered by a selected Account wide phrase negative', () => {
    const suppressionNegatives = buildSuppressionNegatives(
      [{ name: '[OD] Account wide negatives', keywords: [{ keyword: 'what is', matchType: 'phrase' }] }],
      new Map(),
    )
    const after = partitionTermsByNegation('2024-11', [{ term: 'what is outsourcing in business' }], suppressionNegatives)
    expect(after.visible).toHaveLength(0)
    expect(after.negated[0]?.negative.listName).toBe('[OD] Account wide negatives')
  })
  it('does not hide a search term when the matching NKL is not selected', () => {
    const suppressionNegatives = buildSuppressionNegatives([], new Map())
    const after = partitionTermsByNegation('2024-11', [{ term: 'what is outsourcing in business' }], suppressionNegatives)
    expect(after.visible.map((term) => term.term)).toEqual(['what is outsourcing in business'])
    expect(after.negated).toHaveLength(0)
  })
  it('hides in the establishment month and earlier too — a live negative covers all months', () => {
    const terms = [{ term: 'cheap blue shoes' }]
    expect(partitionTermsByNegation('2024-01', terms, negatives).negated).toHaveLength(1)
    expect(partitionTermsByNegation('2023-12', terms, negatives).negated).toHaveLength(1)
  })
  it('hides even when establishedMonth is null (e.g. bulk-imported keywords without negatedAt)', () => {
    const nullNeg: SuppressionNegative[] = [{ keyword: 'blue shoes', matchType: 'phrase', listName: 'X', establishedMonth: null }]
    const terms = [{ term: 'cheap blue shoes' }]
    expect(partitionTermsByNegation('2030-01', terms, nullNeg).negated).toHaveLength(1)
  })
})
