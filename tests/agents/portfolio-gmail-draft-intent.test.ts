import { describe, expect, it } from 'vitest'
import { classifyPortfolioGmailDraftIntent } from '@/lib/agents/optimate-google-ads/portfolio-gmail-draft-intent'

describe('classifyPortfolioGmailDraftIntent', () => {
  it('routes weekly starter prompts with four weeks of comparison context', () => {
    expect(
      classifyPortfolioGmailDraftIntent(
        'Create separate Gmail drafts for each selected account using the last 4 completed Monday-Sunday weeks. Summarise last week against prior weeks, then include current-month Budget Management pacing components. Keep the performance report weekly.',
      ),
    ).toEqual({ kind: 'weekly', weeks: 4 })
    expect(
      classifyPortfolioGmailDraftIntent(
        "Create a separate Gmail draft for each selected account's last completed Monday-Sunday weekly report. Add 1 sentence on top summarising weekly performance and spend pacing. Never use monthly or MTD data.",
      ),
    ).toEqual({ kind: 'weekly', weeks: 4 })
  })

  it('keeps current-month portfolio pacing requests on the current-month shortcut', () => {
    expect(
      classifyPortfolioGmailDraftIntent(
        "Create separate Gmail drafts for each selected account's budget pacing this month, each with a 1 sentence performance summary on top.",
      ),
    ).toEqual({ kind: 'monthly', period: 'this_month', summarySentences: 1 })
  })

  it('routes plain-English last-month performance requests to completed-month drafts', () => {
    expect(
      classifyPortfolioGmailDraftIntent(
        "Create separate Gmail drafts for each selected account's for last month's performance, each with a 2-3 unique sentence performance summary above the tables.",
      ),
    ).toEqual({ kind: 'monthly', period: 'last_month', summarySentences: 2 })
    expect(
      classifyPortfolioGmailDraftIntent(
        'Email a separate previous month report for each selected account.',
      ),
    ).toEqual({ kind: 'monthly', period: 'last_month', summarySentences: 2 })
    expect(
      classifyPortfolioGmailDraftIntent(
        'Create separate Gmail drafts for each selected account completed-month report with three sentences.',
      ),
    ).toEqual({ kind: 'monthly', period: 'last_month', summarySentences: 3 })
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

  it('does not classify unrelated or period-ambiguous portfolio requests', () => {
    expect(
      classifyPortfolioGmailDraftIntent('Summarise weekly performance for the selected accounts.'),
    ).toBeNull()
    expect(
      classifyPortfolioGmailDraftIntent('Create separate Gmail reports for each selected account.'),
    ).toBeNull()
  })
})
