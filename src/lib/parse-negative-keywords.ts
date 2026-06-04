export type ParsedNegativeKeyword = {
  keyword: string
  matchType: 'exact' | 'phrase'
}

/**
 * Parse negative keyword input using the CMS bulk-add convention:
 * - one keyword per line
 * - 'keyword' or "keyword" = phrase match
 * - bare keyword = exact match
 * - blank lines and duplicate keyword|matchType pairs are skipped
 */
export function parseNegativeKeywords(text: string): ParsedNegativeKeyword[] {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const seen = new Set<string>()
  const result: ParsedNegativeKeyword[] = []

  for (const line of lines) {
    let keyword = line
    let matchType: ParsedNegativeKeyword['matchType'] = 'exact'

    if (keyword.startsWith("'") && keyword.endsWith("'")) {
      keyword = keyword.slice(1, -1).trim()
      matchType = 'phrase'
    } else if (keyword.startsWith('"') && keyword.endsWith('"')) {
      keyword = keyword.slice(1, -1).trim()
      matchType = 'phrase'
    }

    if (!keyword) continue

    const key = `${keyword.toLowerCase()}|${matchType}`
    if (seen.has(key)) continue
    seen.add(key)

    result.push({ keyword, matchType })
  }

  return result
}

export function parseNegativeKeywordInput(text: string): ParsedNegativeKeyword | null {
  return parseNegativeKeywords(text)[0] || null
}
