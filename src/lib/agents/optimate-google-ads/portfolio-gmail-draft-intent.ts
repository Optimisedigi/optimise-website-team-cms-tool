export type PortfolioGmailDraftIntent = { kind: 'weekly'; weeks: number } | { kind: 'monthly' }

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
 * Classifies deterministic multi-account pacing draft requests before the LLM
 * runs. Weekly language takes precedence so an explicit completed-week request
 * can never fall through to the legacy current-month pacing shortcut.
 */
export function classifyPortfolioGmailDraftIntent(text: string): PortfolioGmailDraftIntent | null {
  const lower = text.toLowerCase()
  const isSeparateDraftRequest =
    /\b(gmail|draft|email)\b/.test(lower) &&
    /\b(budget|pacing|spend)\b/.test(lower) &&
    /\b(separate|each|per[- ]account|for each)\b/.test(lower)

  if (!isSeparateDraftRequest) return null

  if (
    /\b(weekly|last week|completed week|monday\s*(?:-|–|to)\s*sunday|(?:last\s+)?\d{1,2}[- ]weeks?|(?:last\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[- ]weeks?)\b/.test(
      lower,
    )
  ) {
    return { kind: 'weekly', weeks: requestedCompletedWeeks(lower) }
  }

  return { kind: 'monthly' }
}

function requestedCompletedWeeks(text: string): number {
  if (/\b(last|most recently) completed\b[^.]{0,40}\b(?:week|weekly)\b/.test(text)) return 1
  if (/\blast week\b/.test(text)) return 1
  const wordCount = text.match(
    /\b(?:last\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[- ]weeks?\b/,
  )
  if (wordCount) return WEEK_COUNTS[wordCount[1] as keyof typeof WEEK_COUNTS]

  const explicit = text.match(/\b(?:last\s+)?(\d{1,2})[- ]weeks?\b/)
  if (explicit) return Math.max(1, Math.min(12, Number(explicit[1])))

  return 4
}
