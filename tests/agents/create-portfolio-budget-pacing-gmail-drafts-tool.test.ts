import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '@/lib/agents/_shared/tool'

const mocks = vi.hoisted(() => ({
  loadAccounts: vi.fn(),
  executePerformance: vi.fn(),
  executeBudget: vi.fn(),
  executeDraft: vi.fn(),
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
    expect(mocks.executeBudget).toHaveBeenCalledWith({ mode: 'last_month', auditId: 4 }, ctx)
    expect(mocks.executeDraft).toHaveBeenCalledTimes(1)
    const draft = mocks.executeDraft.mock.calls[0]?.[0]
    expect(draft.subject).toBe('Berendsen - Google Ads Budget Report - July 2026')
    expect(draft.htmlBody).toContain('Berendsen')
    expect(draft.htmlBody).toContain('$1,200')
    expect(draft.htmlBody).toContain('generated 6 conversions, at a $200 CPA.')
    expect(draft.htmlBody).toContain('100 clicks')
    expect(draft.htmlBody).toContain('2,000 impressions')
    expect(draft.htmlBody).toContain('5% CTR')
    expect(draft.htmlBody).toContain('data-testid="july-budget"')
  })
})
