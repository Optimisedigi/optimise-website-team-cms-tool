import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '@/lib/agents/_shared/tool'

const mocks = vi.hoisted(() => ({
  loadAccounts: vi.fn(),
  executeWeekly: vi.fn(),
  executeBudget: vi.fn(),
  executeDraft: vi.fn(),
  executeComponents: vi.fn(),
}))

vi.mock('@/lib/agents/optimate-google-ads/tools/_portfolio-accounts', () => ({
  loadPortfolioAccounts: mocks.loadAccounts,
  selectPortfolioAccountsByAccountRefs: (
    accounts: Array<{ accountRef?: string | number }>,
    refs: Array<string | number>,
  ) => {
    const selected = new Set(refs.map(String))
    return accounts.filter(
      (account) => account.accountRef !== undefined && selected.has(String(account.accountRef)),
    )
  },
}))

vi.mock('@/lib/agents/optimate-google-ads/tools/get-weekly-metric-table', () => ({
  getWeeklyMetricTable: { execute: mocks.executeWeekly },
}))

vi.mock('@/lib/agents/optimate-google-ads/tools/get-budget-management-email', () => ({
  getBudgetManagementEmail: { execute: mocks.executeBudget },
}))

vi.mock('@/lib/agents/optimate-google-ads/tools/create-gmail-draft', () => ({
  createGmailDraftTool: { execute: mocks.executeDraft },
}))

vi.mock('@/lib/agents/optimate-google-ads/tools/get-dashboard-email-components', () => ({
  getDashboardEmailComponents: { execute: mocks.executeComponents },
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
    mocks.executeBudget.mockReset()
    mocks.executeDraft.mockReset()
    mocks.executeComponents.mockReset()
    mocks.executeComponents.mockResolvedValue({
      ok: true,
      data: {
        html: '<div id="graphs">graphs</div>',
        components: ['keyword_relevancy', 'cpa_trend'],
        warnings: [],
      },
    })
  })

  it('creates canonical weekly budget-management drafts with comparison summaries', async () => {
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
      {
        accountRef: 1,
        clientId: 4,
        displayName: 'Profiterole Patisserie',
        customerId: '111-111-1111',
        maskedCustomerId: '•••-1111',
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
          weeks: 4,
          rows: [
            {
              label: 'Jun 29 - Jul 5',
              totals: { spend: 600, clicks: 90, impressions: 900, conversions: 3 },
            },
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
          weeks: 4,
          rows: [
            {
              label: 'Jun 29 - Jul 5',
              totals: { spend: 280, clicks: 45, impressions: 550, conversions: 1 },
            },
            {
              label: 'Jul 6 - Jul 12',
              totals: { spend: 300, clicks: 50, impressions: 600, conversions: 0 },
            },
          ],
        },
      })
    mocks.executeBudget
      .mockResolvedValueOnce({
        ok: true,
        data: {
          html: '<div data-testid="budget-berendsen">budget</div>',
          budget: {
            monthlyBudget: 6000,
            totalSpend: 1200,
            targetSpendToDate: 2000,
            pacingDifference: -800,
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          html: '<div data-testid="budget-epg">budget</div>',
          budget: {
            monthlyBudget: 4000,
            totalSpend: 1600,
            targetSpendToDate: 1400,
            pacingDifference: 200,
          },
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
      weeks: 4,
      endDate: '2026-07-12',
    })
    const result = await createPortfolioWeeklyGmailDraftsTool.execute(args, ctx)

    expect(result.ok).toBe(true)
    expect(mocks.executeWeekly).toHaveBeenCalledTimes(2)
    expect(mocks.executeWeekly.mock.calls[0]?.[0]).toEqual({
      weeks: 4,
      endDate: '2026-07-12',
      metrics: ['spend', 'conversions', 'cpa'],
      title: 'Weekly Performance Trend',
    })
    expect(mocks.executeWeekly.mock.calls[0]?.[1].context).toMatchObject({
      auditId: 4,
      clientId: 9,
      clientName: 'Berendsen',
      customerId: '123-456-7890',
    })

    const firstDraft = mocks.executeDraft.mock.calls[0]?.[0]
    expect(firstDraft.subject).toBe('Berendsen - Google Ads Weekly Report')
    expect(firstDraft.htmlBody).toMatch(/>(Hey team,|Hi team,|Hey all,|Hi all,|Morning team,)</)
    // The summary now comes from the shared builder used by the individual
    // account view, so every weekly draft reads the same way regardless of
    // surface: week-on-week performance, then component insight, then pacing.
    expect(firstDraft.htmlBody).toMatch(/4 conversions|conversions.*\b4\b|\b4\b conversions/)
    expect(firstDraft.htmlBody).toMatch(/\$155/)
    // Week-on-week: the prior completed week's figures must appear too.
    expect(firstDraft.htmlBody).toMatch(/\b3\b/)
    expect(firstDraft.htmlBody).toMatch(/\$200/)
    expect(firstDraft.htmlBody).toMatch(/under budget|under the month-to-date target|below the month-to-date target|under target|below budget/)
    expect(firstDraft.htmlBody).toMatch(/Jul 6 - Jul 12/)
    expect(firstDraft.htmlBody).toContain('data-testid="weekly-berendsen"')
    expect(firstDraft.htmlBody).toContain('data-testid="budget-berendsen"')
    expect(mocks.executeBudget.mock.calls[0]?.[0]).toEqual({ mode: 'this_month', auditId: 4 })

    const data = result.data as { drafts: unknown[]; endDate: string }
    expect(data.drafts).toHaveLength(2)
    expect(data.endDate).toBe('2026-07-12')
  })

  it('varies the copy per account and reproduces the same copy on a re-run', async () => {
    const accounts = ['Alpha Co', 'Bravo Co', 'Charlie Co', 'Delta Co', 'Echo Co'].map(
      (displayName, index) => ({
        accountRef: index + 1,
        clientId: index + 1,
        displayName,
        customerId: `10${index}-000-0000`,
        maskedCustomerId: `\u2022\u2022\u2022-000${index}`,
        source: 'audit',
        active: true,
        managed: true,
      }),
    )
    const weeklyPayload = {
      ok: true,
      data: {
        html: '<table>weekly</table>',
        weeks: 4,
        rows: [
          { label: 'Jun 29 - Jul 5', totals: { spend: 600, clicks: 90, impressions: 900, conversions: 3 } },
          { label: 'Jul 6 - Jul 12', totals: { spend: 620, clicks: 100, impressions: 1000, conversions: 4 } },
        ],
      },
    }
    const budgetPayload = {
      ok: true,
      data: {
        html: '<div>budget</div>',
        budget: {
          monthlyBudget: 6000,
          totalSpend: 1200,
          targetSpendToDate: 2000,
          pacingDifference: -800,
        },
      },
    }

    const runOnce = async () => {
      mocks.loadAccounts.mockReset()
      mocks.executeWeekly.mockReset()
      mocks.executeBudget.mockReset()
      mocks.executeDraft.mockReset()
      mocks.loadAccounts.mockResolvedValue(accounts)
      mocks.executeWeekly.mockResolvedValue(weeklyPayload)
      mocks.executeBudget.mockResolvedValue(budgetPayload)
      mocks.executeDraft.mockResolvedValue({
        ok: true,
        data: { draftId: 'd', messageId: 'm', gmailUrl: 'https://gmail/d' },
      })

      const args = createPortfolioWeeklyGmailDraftsTool.validate!({
        accountRefs: [1, 2, 3, 4, 5],
        weeks: 4,
        endDate: '2026-07-12',
      })
      await createPortfolioWeeklyGmailDraftsTool.execute(args, ctx)
      return mocks.executeDraft.mock.calls.map((call) => String(call[0].htmlBody))
    }

    const first = await runOnce()
    expect(first).toHaveLength(5)
    // Identical data for every account, yet the prose must not be identical.
    expect(new Set(first).size).toBeGreaterThan(1)

    const second = await runOnce()
    expect(second).toEqual(first)
  })

  describe('dashboard graph parity with the single-account weekly tool', () => {
    const validate = createPortfolioWeeklyGmailDraftsTool.validate!

    it('defaults to both graphs and a 4-week trend so shortcut drafts match individual drafts', () => {
      // The deterministic multi-account shortcut has no LLM turn available to
      // answer a clarification, so omitting components must not drop the graphs.
      expect(validate({})).toMatchObject({
        weeks: 4,
        components: ['keyword_relevancy', 'cpa_trend'],
      })
    })

    it('accepts an explicit graph subset and rejects unknown graphs', () => {
      expect(validate({ components: ['cpa_trend'] })).toMatchObject({ components: ['cpa_trend'] })
      expect(() => validate({ components: ['quality_score'] })).toThrow(
        /Unknown weekly report graph/,
      )
    })

    it('renders the graphs between the weekly table and the budget tracker', async () => {
      mocks.loadAccounts.mockResolvedValue([
        { accountRef: 4, clientId: 9, displayName: 'Berendsen', customerId: '123-456-7890' },
      ])
      mocks.executeWeekly.mockResolvedValue({
        ok: true,
        data: {
          html: '<table id="weekly"></table>',
          rows: [{ label: 'Aug 3 - Aug 9', totals: { spend: 100, conversions: 4 } }],
          weeks: 4,
        },
      })
      mocks.executeBudget.mockResolvedValue({ ok: true, data: { html: '<div id="budget"></div>' } })
      mocks.executeDraft.mockResolvedValue({
        ok: true,
        data: { draftId: 'd', messageId: 'm', gmailUrl: 'https://gmail/d' },
      })

      const result = await createPortfolioWeeklyGmailDraftsTool.execute(
        validate({ accountRefs: [4] }),
        ctx,
      )

      expect(result.ok).toBe(true)
      expect(mocks.executeComponents).toHaveBeenCalledWith(
        expect.objectContaining({ components: ['keyword_relevancy', 'cpa_trend'] }),
        expect.anything(),
      )
      const html = String(mocks.executeDraft.mock.calls[0][0].htmlBody)
      expect(html.indexOf('id="weekly"')).toBeLessThan(html.indexOf('id="graphs"'))
      expect(html.indexOf('id="graphs"')).toBeLessThan(html.indexOf('id="budget"'))
    })

    it('still creates the draft when graph rendering throws, recording a warning', async () => {
      mocks.loadAccounts.mockResolvedValue([
        { accountRef: 4, clientId: 9, displayName: 'Berendsen', customerId: '123-456-7890' },
      ])
      mocks.executeWeekly.mockResolvedValue({
        ok: true,
        data: { html: '<table id="weekly"></table>', rows: [], weeks: 4 },
      })
      mocks.executeBudget.mockResolvedValue({ ok: true, data: { html: '<div id="budget"></div>' } })
      mocks.executeDraft.mockResolvedValue({
        ok: true,
        data: { draftId: 'd', messageId: 'm', gmailUrl: 'https://gmail/d' },
      })
      mocks.executeComponents.mockRejectedValue(new Error('quickchart exploded'))

      const result = await createPortfolioWeeklyGmailDraftsTool.execute(
        validate({ accountRefs: [4] }),
        ctx,
      )

      expect(result.ok).toBe(true)
      const data = result.data as {
        createdCount: number
        componentWarnings: Array<{ warning: string }>
      }
      expect(data.createdCount).toBe(1)
      expect(data.componentWarnings[0].warning).toMatch(/quickchart exploded/)
    })
  })

  it('rejects invalid dates and non-Sunday end dates', () => {
    const validate = createPortfolioWeeklyGmailDraftsTool.validate!
    expect(() => validate({ weeks: 1, endDate: '2026-02-30' })).toThrow(/valid calendar date/)
    expect(() => validate({ weeks: 1, endDate: '2026-07-15' })).toThrow(/must be a Sunday/)
  })
})
