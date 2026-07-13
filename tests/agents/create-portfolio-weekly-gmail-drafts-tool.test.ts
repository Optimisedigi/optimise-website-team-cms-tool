import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '@/lib/agents/_shared/tool'

const mocks = vi.hoisted(() => ({
  loadAccounts: vi.fn(),
  executeWeekly: vi.fn(),
  executeDraft: vi.fn(),
}))

vi.mock('@/lib/agents/optimate-google-ads/tools/_portfolio-accounts', () => ({
  loadPortfolioAccounts: mocks.loadAccounts,
  customerKey: (value: string) => value.replace(/-/g, ''),
}))

vi.mock('@/lib/agents/optimate-google-ads/tools/get-weekly-metric-table', () => ({
  getWeeklyMetricTable: { execute: mocks.executeWeekly },
}))

vi.mock('@/lib/agents/optimate-google-ads/tools/create-gmail-draft', () => ({
  createGmailDraftTool: { execute: mocks.executeDraft },
}))

import { createPortfolioWeeklyGmailDraftsTool } from '@/lib/agents/optimate-google-ads/tools/create-portfolio-weekly-gmail-drafts'

const ctx: ToolContext = {
  agentName: 'optimate-google-ads',
  agentRunId: 'run_portfolio_weekly',
  context: { mode: 'portfolio', selectedAccountRefs: [4, 5], userId: 12 },
  log: vi.fn(),
}

describe('create_portfolio_weekly_gmail_drafts', () => {
  beforeEach(() => {
    mocks.loadAccounts.mockReset()
    mocks.executeWeekly.mockReset()
    mocks.executeDraft.mockReset()
  })

  it('creates separate weekly-only drafts with a weekly subject and one-sentence spend summary', async () => {
    mocks.loadAccounts.mockResolvedValue([
      {
        accountRef: 4,
        clientId: 9,
        displayName: 'Berendsen',
        customerId: '123-456-7890',
        maskedCustomerId: '•••-7890',
        source: 'audit',
        active: true,
        managed: true,
      },
      {
        accountRef: 5,
        clientId: 10,
        displayName: 'EPG',
        customerId: '098-765-4321',
        maskedCustomerId: '•••-4321',
        source: 'audit',
        active: true,
        managed: true,
      },
    ])
    mocks.executeWeekly
      .mockResolvedValueOnce({
        ok: true,
        data: {
          html: '<table data-testid="weekly-berendsen">weekly</table>',
          weeks: 1,
          rows: [
            {
              label: 'Jul 6 - Jul 12',
              totals: { spend: 620, clicks: 100, impressions: 1000, conversions: 4 },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          html: '<table data-testid="weekly-epg">weekly</table>',
          weeks: 1,
          rows: [
            {
              label: 'Jul 6 - Jul 12',
              totals: { spend: 300, clicks: 50, impressions: 600, conversions: 0 },
            },
          ],
        },
      })
    mocks.executeDraft
      .mockResolvedValueOnce({
        ok: true,
        data: { draftId: 'd1', messageId: 'm1', gmailUrl: 'https://gmail/d1' },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { draftId: 'd2', messageId: 'm2', gmailUrl: 'https://gmail/d2' },
      })

    const args = createPortfolioWeeklyGmailDraftsTool.validate!({
      accountRefs: [4, 5],
      weeks: 1,
      endDate: '2026-07-12',
    })
    const result = await createPortfolioWeeklyGmailDraftsTool.execute(args, ctx)

    expect(result.ok).toBe(true)
    expect(mocks.executeWeekly).toHaveBeenCalledTimes(2)
    expect(mocks.executeWeekly.mock.calls[0]?.[0]).toEqual({
      weeks: 1,
      endDate: '2026-07-12',
      metrics: ['spend', 'conversions', 'cpa'],
      title: 'Weekly Performance',
    })
    expect(mocks.executeWeekly.mock.calls[0]?.[1].context).toMatchObject({
      auditId: 4,
      clientId: 9,
      clientName: 'Berendsen',
      customerId: '123-456-7890',
    })

    const firstDraft = mocks.executeDraft.mock.calls[0]?.[0]
    expect(firstDraft.subject).toBe('Berendsen - Google Ads Weekly Report')
    expect(firstDraft.htmlBody).toContain(
      'Jul 6 - Jul 12 delivered 4 conversions at a CPA of $155; weekly spend pacing was $620.',
    )
    expect(firstDraft.htmlBody).toContain('data-testid="weekly-berendsen"')
    expect(firstDraft.htmlBody).not.toMatch(/July 2026|month-to-date|MTD/i)

    const data = result.data as { drafts: unknown[]; endDate: string }
    expect(data.drafts).toHaveLength(2)
    expect(data.endDate).toBe('2026-07-12')
  })

  it('rejects invalid dates and non-Sunday end dates', () => {
    const validate = createPortfolioWeeklyGmailDraftsTool.validate!
    expect(() => validate({ weeks: 1, endDate: '2026-02-30' })).toThrow(/valid calendar date/)
    expect(() => validate({ weeks: 1, endDate: '2026-07-15' })).toThrow(/must be a Sunday/)
  })
})
