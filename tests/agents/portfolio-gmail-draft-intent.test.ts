import { describe, expect, it } from 'vitest'
import { classifyPortfolioGmailDraftIntent } from '@/lib/agents/optimate-google-ads/portfolio-gmail-draft-intent'

describe('classifyPortfolioGmailDraftIntent', () => {
  it('routes the weekly starter prompt to a one-week weekly shortcut', () => {
    expect(
      classifyPortfolioGmailDraftIntent(
        "Create a separate Gmail draft for each selected account's last completed Monday-Sunday weekly report. Add 1 sentence on top summarising weekly performance and spend pacing. Never use monthly or MTD data.",
      ),
    ).toEqual({ kind: 'weekly', weeks: 1 })
  })

  it('keeps current-month portfolio pacing requests on the monthly shortcut', () => {
    expect(
      classifyPortfolioGmailDraftIntent(
        "Create separate Gmail drafts for each selected account's budget pacing this month, each with a 1 sentence performance summary on top.",
      ),
    ).toEqual({ kind: 'monthly' })
  })

  it('routes numeric and word-number week ranges to the weekly shortcut', () => {
    expect(
      classifyPortfolioGmailDraftIntent(
        "Create separate Gmail drafts for each selected account's spend pacing for the last 4 weeks.",
      ),
    ).toEqual({ kind: 'weekly', weeks: 4 })
    expect(
      classifyPortfolioGmailDraftIntent(
        "Create separate Gmail drafts for each selected account's spend pacing for the last twelve weeks.",
      ),
    ).toEqual({ kind: 'weekly', weeks: 12 })
  })

  it('does not classify unrelated portfolio requests', () => {
    expect(
      classifyPortfolioGmailDraftIntent('Summarise weekly performance for the selected accounts.'),
    ).toBeNull()
  })
})
