import type { CanonicalTool, ToolContext } from '@/lib/agents/_shared/tool'
import { createGmailDraftTool } from './create-gmail-draft'
import { getBudgetManagementEmail } from './get-budget-management-email'
import { getPortfolioPerformanceSummary } from './get-portfolio-performance-summary'
import {
  customerKey,
  loadPortfolioAccounts,
  selectPortfolioAccountsByAccountRefs,
} from './_portfolio-accounts'

interface CreatePortfolioBudgetPacingGmailDraftsArgs {
  accountRefs?: Array<string | number>
  to?: string
}

interface PerformanceSummaryData {
  rangeLabel?: string
  accounts?: PerformanceAccountRow[]
}

interface PerformanceAccountRow {
  accountRef?: string | number
  clientId?: string | number
  displayName: string
  spend?: number
  conversions?: number
  cpa?: number | null
  clicks?: number
  impressions?: number
  error?: string
}

interface BudgetEmailData {
  subject: string
  html: string
}

interface GmailDraftData {
  draftId: string
  messageId: string
  gmailUrl: string
  subject: string
}

const MAX_ACCOUNTS = 10

export const createPortfolioBudgetPacingGmailDraftsTool: CanonicalTool<CreatePortfolioBudgetPacingGmailDraftsArgs> =
  {
    name: 'create_portfolio_budget_pacing_gmail_drafts',
    description:
      "Create separate Gmail drafts for each selected audit-backed Google Ads account's current-month budget pacing in one deterministic server-side operation. Use this shortcut instead of separately calling get_portfolio_performance_summary, get_budget_management_email, and create_gmail_draft in a loop; it avoids long multi-step LLM tool chains and Vercel 504s. It leaves recipients blank unless a recipient is explicitly provided.",
    inputSchema: {
      type: 'object',
      properties: {
        accountRefs: {
          type: 'array',
          items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
          description:
            'Selected account refs/audit IDs. Omit to use the selected accounts from portfolio chat context.',
        },
        to: {
          type: 'string',
          description: 'Optional recipient. Leave blank unless the user explicitly provided one.',
        },
      },
      additionalProperties: false,
    },
    validate(raw) {
      const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      const out: CreatePortfolioBudgetPacingGmailDraftsArgs = {}
      if (obj.accountRefs !== undefined && obj.accountRefs !== null) {
        if (!Array.isArray(obj.accountRefs))
          throw new Error('accountRefs must be an array when provided')
        out.accountRefs = obj.accountRefs.filter(
          (value): value is string | number =>
            typeof value === 'string' || typeof value === 'number',
        )
      }
      if (typeof obj.to === 'string' && obj.to.trim()) out.to = obj.to.trim()
      return out
    },
    async execute(args, ctx) {
      const refs = normaliseRefs(args.accountRefs ?? contextSelectedAccountRefs(ctx))
      if (refs.length === 0) {
        return {
          ok: false,
          error:
            'No selected accounts were supplied. Select two or more audit-backed accounts first.',
        }
      }

      const accounts = selectPortfolioAccountsByAccountRefs(
        await loadPortfolioAccounts(),
        refs,
      )
      const capped = accounts.slice(0, MAX_ACCOUNTS)
      const skipped = accounts
        .filter(
          (account) =>
            account.accountRef === undefined ||
            account.accountRef === null ||
            account.accountRef === '',
        )
        .map((account) => ({
          displayName: account.displayName,
          reason: 'No audit-backed accountRef/auditId',
        }))
      const auditBackedAccounts = capped.filter(
        (account) =>
          account.accountRef !== undefined &&
          account.accountRef !== null &&
          account.accountRef !== '',
      )

      if (auditBackedAccounts.length === 0) {
        return {
          ok: false,
          error:
            'None of the selected accounts are audit-backed, so Budget Management draft HTML cannot be generated.',
        }
      }

      const performanceResult = await getPortfolioPerformanceSummary.execute(
        {
          accountRefs: auditBackedAccounts.map((account) => customerKey(account.customerId)),
          range: 'THIS_MONTH',
          limit: auditBackedAccounts.length,
        },
        ctx,
      )
      if (!performanceResult.ok) return performanceResult

      const performance = performanceResult.data as PerformanceSummaryData
      const performanceByRef = new Map<string, PerformanceAccountRow>()
      for (const row of performance.accounts ?? []) {
        if (row.accountRef !== undefined && row.accountRef !== null)
          performanceByRef.set(String(row.accountRef), row)
      }

      const drafts: Array<{
        accountRef: string | number
        displayName: string
        subject: string
        draftId: string
        messageId: string
        gmailUrl: string
        summary: string
      }> = []
      const failures: Array<{ accountRef?: string | number; displayName: string; error: string }> =
        []

      // Deliberately sequential: budget rendering self-calls CMS → Growth Tools → Google Ads.
      // Keeping one account in flight avoids backend bursts while still finishing quickly because
      // this shortcut removes the expensive LLM round-trip between each account.
      for (const account of auditBackedAccounts) {
        const auditId = account.accountRef as string | number
        const perf = performanceByRef.get(String(auditId))
        if (perf?.error) {
          failures.push({
            accountRef: auditId,
            displayName: account.displayName,
            error: perf.error,
          })
          continue
        }

        const budgetResult = await getBudgetManagementEmail.execute(
          { mode: 'this_month', auditId },
          ctx,
        )
        if (!budgetResult.ok) {
          failures.push({
            accountRef: auditId,
            displayName: account.displayName,
            error: budgetResult.error ?? 'Budget email generation failed',
          })
          continue
        }
        const budget = budgetResult.data as BudgetEmailData
        const summary = buildPerformanceSummary(account.displayName, perf)
        const htmlBody = `${summaryHtml(summary)}\n${budget.html}`
        const draftResult = await createGmailDraftTool.execute(
          { subject: budget.subject, htmlBody, ...(args.to ? { to: args.to } : {}) },
          ctx,
        )
        if (!draftResult.ok) {
          failures.push({
            accountRef: auditId,
            displayName: account.displayName,
            error: draftResult.error ?? 'Gmail draft creation failed',
          })
          continue
        }
        const draft = draftResult.data as GmailDraftData
        drafts.push({
          accountRef: auditId,
          displayName: account.displayName,
          subject: budget.subject,
          draftId: draft.draftId,
          messageId: draft.messageId,
          gmailUrl: draft.gmailUrl,
          summary,
        })
      }

      return {
        ok: true,
        data: {
          createdCount: drafts.length,
          requestedCount: refs.length,
          processedCount: auditBackedAccounts.length,
          rangeLabel: performance.rangeLabel ?? 'This month',
          drafts,
          skipped,
          failures,
          capped: accounts.length > capped.length,
          message: buildResultMessage(drafts.length, failures.length, skipped.length),
        },
      }
    },
  }

function contextSelectedAccountRefs(ctx: ToolContext): Array<string | number> {
  const raw = ctx.context.selectedAccountRefs
  return Array.isArray(raw)
    ? raw.filter(
        (value): value is string | number => typeof value === 'string' || typeof value === 'number',
      )
    : []
}

function normaliseRefs(refs: Array<string | number>): Array<string | number> {
  const seen = new Set<string>()
  const out: Array<string | number> = []
  for (const ref of refs) {
    const key = String(ref).trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}


function buildPerformanceSummary(
  displayName: string,
  row: PerformanceAccountRow | undefined,
): string {
  if (!row) return `${displayName} is pacing this month with the budget details below.`
  const parts = [`${displayName} has spent ${formatCurrency(row.spend ?? 0)} this month`]
  if (typeof row.conversions === 'number')
    parts.push(`generated ${formatNumber(row.conversions)} conversions`)
  if (typeof row.cpa === 'number' && Number.isFinite(row.cpa))
    parts.push(`at a ${formatCurrency(row.cpa)} CPA`)
  else if (typeof row.clicks === 'number') parts.push(`with ${formatNumber(row.clicks)} clicks`)
  return `${parts.join(', ')}.`
}

function summaryHtml(summary: string): string {
  return `<p style="margin:0 0 20px;width:100%;max-width:none;display:block;font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">${escapeHtml(summary)}</p>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 }).format(
    Number.isFinite(value) ? value : 0,
  )
}

function buildResultMessage(created: number, failures: number, skipped: number): string {
  const bits = [`Created ${created} separate Gmail draft${created === 1 ? '' : 's'}`]
  if (failures > 0) bits.push(`${failures} failed`)
  if (skipped > 0) bits.push(`${skipped} skipped because they are not audit-backed`)
  return `${bits.join('; ')}.`
}
