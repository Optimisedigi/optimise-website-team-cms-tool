import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '@/lib/agents/_shared/tool'

const mocks = vi.hoisted(() => ({
  loadAccounts: vi.fn(),
  executePerformance: vi.fn(),
  executeBudget: vi.fn(),
  executeDraft: vi.fn(),
  executeComponents: vi.fn(),
  executeMonthly: vi.fn(),
}))

vi.mock('@/lib/agents/optimate-google-ads/tools/_portfolio-accounts', () => ({
  customerKey: (customerId: string) => customerId.replace(/-/g, ''),
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

vi.mock('@/lib/agents/optimate-google-ads/tools/get-portfolio-performance-summary', () => ({
  getPortfolioPerformanceSummary: { execute: mocks.executePerformance },
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

vi.mock('@/lib/agents/optimate-google-ads/tools/get-monthly-metric-table', () => ({
  getMonthlyMetricTable: { execute: mocks.executeMonthly },
}))

import { createPortfolioBudgetPacingGmailDraftsTool } from '@/lib/agents/optimate-google-ads/tools/create-portfolio-budget-pacing-gmail-drafts'

const ctx: ToolContext = {
  agentName: 'optimate-google-ads',
  agentRunId: 'run_portfolio_last_month',
  context: { mode: 'portfolio', selectedAccountRefs: [4], userId: 12 },
  log: vi.fn(),
}

describe('create_portfolio_budget_pacing_gmail_drafts', () => {
  beforeEach(() => {
    mocks.loadAccounts.mockReset()
    mocks.executePerformance.mockReset()
    mocks.executeBudget.mockReset()
    mocks.executeDraft.mockReset()
    mocks.executeMonthly.mockReset()
    mocks.executeMonthly.mockResolvedValue({
      ok: true,
      data: {
        html: '<table data-testid="monthly-trend">monthly</table>',
        rows: [
          { label: 'June 2026', totals: { spend: 1000, conversions: 4 }, metrics: { cpa: 250 } },
          { label: 'July 2026', totals: { spend: 1200, conversions: 6 }, metrics: { cpa: 200 } },
        ],
      },
    })
    mocks.executeComponents.mockReset()
    mocks.executeComponents.mockResolvedValue({
      ok: true,
      data: {
        html: '<div id="components">components</div>',
        components: ['keyword_relevancy', 'cpa_trend', 'quality_score', 'top_converters'],
        warnings: [],
      },
    })
  })

  describe('dashboard component parity with the single-account monthly tool', () => {
    const validate = createPortfolioBudgetPacingGmailDraftsTool.validate!

    it('defaults to all four components when none are supplied', () => {
      // The deterministic shortcut calls this tool without an LLM turn, so an
      // omitted component list must fall back to the full set, not to none.
      expect(validate({})).toMatchObject({
        components: ['keyword_relevancy', 'cpa_trend', 'quality_score', 'top_converters'],
      })
    })

    it('accepts an explicit subset and rejects unknown components', () => {
      expect(validate({ components: ['quality_score'] })).toMatchObject({
        components: ['quality_score'],
      })
      expect(() => validate({ components: ['not_a_component'] })).toThrow(/Unknown component/)
    })

    it('renders components above the budget tracker and survives a component failure', async () => {
      mocks.loadAccounts.mockResolvedValue([
        { accountRef: 4, clientId: 9, displayName: 'Berendsen', customerId: '123-456-7890' },
      ])
      mocks.executePerformance.mockResolvedValue({
        ok: true,
        data: {
          rangeLabel: 'August 2026',
          accounts: [{ accountRef: 4, displayName: 'Berendsen', spend: 100, conversions: 5 }],
        },
      })
      mocks.executeBudget.mockResolvedValue({
        ok: true,
        data: { subject: 'Berendsen - Budget', html: '<div id="budget"></div>' },
      })
      mocks.executeDraft.mockResolvedValue({
        ok: true,
        data: { draftId: 'd', messageId: 'm', gmailUrl: 'https://gmail/d', subject: 's' },
      })

      const ok = await createPortfolioBudgetPacingGmailDraftsTool.execute(
        validate({ accountRefs: [4] }),
        ctx,
      )
      expect(ok.ok).toBe(true)
      const html = String(mocks.executeDraft.mock.calls[0][0].htmlBody)
      expect(html.indexOf('id="components"')).toBeLessThan(html.indexOf('id="budget"'))

      mocks.executeDraft.mockClear()
      mocks.executeComponents.mockRejectedValue(new Error('chart backend down'))
      const degraded = await createPortfolioBudgetPacingGmailDraftsTool.execute(
        validate({ accountRefs: [4] }),
        ctx,
      )
      expect(degraded.ok).toBe(true)
      const degradedData = degraded.data as {
        createdCount: number
        componentWarnings: Array<{ warning: string }>
      }
      expect(degradedData.createdCount).toBe(1)
      expect(degradedData.componentWarnings[0].warning).toMatch(/chart backend down/)
    })
  })

  it('uses completed-month data for both the summary and budget report', async () => {
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
    ])
    mocks.executePerformance.mockResolvedValue({
      ok: true,
      data: {
        rangeLabel: 'Last month',
        accounts: [
          {
            accountRef: 4,
            displayName: 'Berendsen',
            spend: 1200,
            conversions: 6,
            cpa: 200,
            clicks: 100,
            impressions: 2000,
          },
        ],
      },
    })
    mocks.executeBudget.mockResolvedValue({
      ok: true,
      data: {
        subject: 'Berendsen - Google Ads Budget Report - July 2026',
        html: '<div data-testid="july-budget">July budget</div>',
      },
    })
    mocks.executeDraft.mockResolvedValue({
      ok: true,
      data: { draftId: 'd1', messageId: 'm1', gmailUrl: 'https://gmail/d1' },
    })

    const args = createPortfolioBudgetPacingGmailDraftsTool.validate!({
      accountRefs: [4],
      period: 'last_month',
      summarySentences: 2,
    })
    const result = await createPortfolioBudgetPacingGmailDraftsTool.execute(args, ctx)

    expect(result.ok).toBe(true)
    expect(mocks.executePerformance).toHaveBeenCalledWith(
      { accountRefs: ['1234567890'], range: 'LAST_MONTH', limit: 1 },
      ctx,
    )
    // Completed-month reports reuse the current-month budget block with last
    // month's campaign metrics, matching create_monthly_budget_gmail_draft.
    expect(mocks.executeBudget).toHaveBeenCalledWith(
      { mode: 'this_month', campaignMetricsRange: 'LAST_MONTH', auditId: 4 },
      ctx,
    )
    expect(mocks.executeDraft).toHaveBeenCalledTimes(1)
    const draft = mocks.executeDraft.mock.calls[0]?.[0]
    expect(draft.subject).toBe('Berendsen - Google Ads Budget Report - July 2026')
    // A completed-month request is a monthly performance report, so it carries
    // the month-on-month trend table and the shared monthly summary rather than
    // the current-month pacing copy.
    expect(draft.htmlBody).toContain('data-testid="monthly-trend"')
    expect(draft.htmlBody).toMatch(/July 2026/)
    expect(draft.htmlBody).toMatch(/\b6\b/)
    expect(draft.htmlBody).toMatch(/\b4\b/)
    expect(draft.htmlBody).toMatch(/\$200/)
    expect(draft.htmlBody).toMatch(/\$250/)
    expect(draft.htmlBody).toContain('data-testid="july-budget"')
    // Section order: summary, monthly trend, components, budget tracker.
    expect(draft.htmlBody.indexOf('data-testid="monthly-trend"')).toBeLessThan(
      draft.htmlBody.indexOf('id="components"'),
    )
    expect(draft.htmlBody.indexOf('id="components"')).toBeLessThan(
      draft.htmlBody.indexOf('data-testid="july-budget"'),
    )
  })
})
