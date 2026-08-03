export type PortfolioGmailDraftIntent =
  | { kind: 'weekly'; weeks: number }
  | { kind: 'monthly'; period: 'this_month' | 'last_month'; summarySentences: 1 | 2 | 3 }

const WEEK_COUNTS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
} as const

/**
 * Classifies deterministic multi-account report draft requests before the LLM
 * runs. Explicit weekly and completed-month language takes precedence so these
 * requests cannot fall through to the current-month pacing shortcut.
 */
export function classifyPortfolioGmailDraftIntent(text: string): PortfolioGmailDraftIntent | null {
  const lower = text.toLowerCase()
  const isSeparateDraftRequest =
    /\b(gmail|drafts?|emails?)\b/.test(lower) &&
    /\b(budgets?|pacing|spend|performance|reports?)\b/.test(lower) &&
    /\b(separate|each|per[- ]account|for each)\b/.test(lower)

  if (!isSeparateDraftRequest) return null

  if (
    /\b(weekly|last week|completed week|monday\s*(?:-|–|to)\s*sunday|(?:last\s+)?\d{1,2}[- ]weeks?|(?:last\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[- ]weeks?)\b/.test(
      lower,
    )
  ) {
    return { kind: 'weekly', weeks: requestedCompletedWeeks(lower) }
  }

  const isLastMonth = /\b(last|previous|prior|completed)[-\s]+month(?:'s)?\b/.test(lower)
  const isCurrentMonth =
    /\b(this|current)\s+month(?:'s)?\b|\bmonth[- ]to[- ]date\b|\bmtd\b/.test(lower)
  if (!isLastMonth && !isCurrentMonth) return null

  const period = isLastMonth ? 'last_month' : 'this_month'
  return {
    kind: 'monthly',
    period,
    summarySentences: requestedSummarySentences(lower, period),
  }
}

function requestedCompletedWeeks(text: string): number {
  if (/\b(last|most recently) completed\b[^.]{0,40}\b(?:week|weekly)\b/.test(text)) return 4
  if (/\blast week\b/.test(text)) return 4
  const wordCount = text.match(
    /\b(?:last\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[- ]weeks?\b/,
  )
  if (wordCount) return WEEK_COUNTS[wordCount[1] as keyof typeof WEEK_COUNTS]

  const explicit = text.match(/\b(?:last\s+)?(\d{1,2})[- ]weeks?\b/)
  if (explicit) return Math.max(1, Math.min(12, Number(explicit[1])))

  return 4
}

const SUMMARY_COUNT_WORDS = { one: 1, two: 2, three: 3 } as const
const SUMMARY_COUNT_TOKEN = '[1-3]|one|two|three'

function requestedSummarySentences(
  text: string,
  period: 'this_month' | 'last_month',
): 1 | 2 | 3 {
  const range = text.match(
    new RegExp(
      `\\b(${SUMMARY_COUNT_TOKEN})\\s*(?:-|–|to)\\s*(${SUMMARY_COUNT_TOKEN})[-\\s]+(?:unique[-\\s]+)?sentences?\\b`,
    ),
  )
  if (range) return Math.min(summaryCount(range[1]), summaryCount(range[2])) as 1 | 2 | 3
  const explicit = text.match(
    new RegExp(`\\b(${SUMMARY_COUNT_TOKEN})[-\\s]+(?:unique[-\\s]+)?sentences?\\b`),
  )
  if (explicit) return summaryCount(explicit[1])
  return period === 'last_month' ? 2 : 1
}

function summaryCount(value: string): 1 | 2 | 3 {
  if (value in SUMMARY_COUNT_WORDS) {
    return SUMMARY_COUNT_WORDS[value as keyof typeof SUMMARY_COUNT_WORDS]
  }
  return Number(value) as 1 | 2 | 3
}
