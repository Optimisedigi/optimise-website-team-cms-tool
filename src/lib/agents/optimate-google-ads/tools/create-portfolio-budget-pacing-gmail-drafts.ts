import type { CanonicalTool, ToolContext } from '@/lib/agents/_shared/tool'
import { createGmailDraftTool } from './create-gmail-draft'
import { getBudgetManagementEmail } from './get-budget-management-email'
import { getPortfolioPerformanceSummary } from './get-portfolio-performance-summary'
import {
  customerKey,
  loadPortfolioAccounts,
  selectPortfolioAccountsByAccountRefs,
} from './_portfolio-accounts'
import { copySeed, pickVariant } from './_email-copy-variants'

interface CreatePortfolioBudgetPacingGmailDraftsArgs {
  accountRefs?: Array<string | number>
  to?: string
  period?: 'this_month' | 'last_month'
  summarySentences?: 1 | 2 | 3
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
      "Create separate Gmail drafts for each selected audit-backed Google Ads account's current-month budget pacing or last completed month's performance in one deterministic server-side operation. Explicitly pass period='last_month' for 'last month', 'previous month', or 'completed month'; otherwise use period='this_month'. It leaves recipients blank unless explicitly provided.",
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
        period: {
          type: 'string',
          enum: ['this_month', 'last_month'],
          description: "Report period. Use last_month for 'last month', 'previous month', or 'completed month'.",
        },
        summarySentences: {
          type: 'number',
          enum: [1, 2, 3],
          description: 'Number of short factual summary sentences above each report.',
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
      if (obj.period === 'this_month' || obj.period === 'last_month') out.period = obj.period
      if (obj.summarySentences !== undefined) {
        const count = Number(obj.summarySentences)
        if (![1, 2, 3].includes(count)) throw new Error('summarySentences must be 1, 2, or 3')
        out.summarySentences = count as 1 | 2 | 3
      }
      return out
    },
    async execute(args, ctx) {
      const period = args.period ?? 'this_month'
      const summarySentences = args.summarySentences ?? (period === 'last_month' ? 2 : 1)
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
          range: period === 'last_month' ? 'LAST_MONTH' : 'THIS_MONTH',
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
          { mode: period, auditId },
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
        // Seeded per account + period so a batch of drafts does not repeat the
        // same sentence structure, while a re-run reproduces identical copy.
        const summary = buildPerformanceSummary(
          account.displayName,
          perf,
          period,
          summarySentences,
          copySeed(account.displayName, account.customerId, period, performance.rangeLabel),
        )
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
          rangeLabel: performance.rangeLabel ?? (period === 'last_month' ? 'Last month' : 'This month'),
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
  period: 'this_month' | 'last_month',
  sentenceCount: 1 | 2 | 3,
  seed = 0,
): string {
  const periodLabel = period === 'last_month' ? 'last month' : 'this month'
  if (!row) {
    return pickVariant(
      [
        `${displayName}'s ${periodLabel} performance and budget details are shown below.`,
        `Below are ${displayName}'s ${periodLabel} performance and budget details.`,
        `Here is how ${displayName} tracked ${periodLabel}, with the budget detail below.`,
      ],
      seed,
      'pacing-no-row',
    )
  }

  const spendText = formatCurrency(row.spend ?? 0)
  const tail: string[] = []
  if (typeof row.conversions === 'number')
    tail.push(`generated ${formatNumber(row.conversions)} conversions`)
  if (typeof row.cpa === 'number' && Number.isFinite(row.cpa))
    tail.push(`at a ${formatCurrency(row.cpa)} CPA`)
  else if (typeof row.clicks === 'number') tail.push(`with ${formatNumber(row.clicks)} clicks`)

  const lead = pickVariant(
    [
      `${displayName} spent ${spendText} ${periodLabel}`,
      `${displayName} put ${spendText} through Google Ads ${periodLabel}`,
      `${displayName} used ${spendText} of Google Ads budget ${periodLabel}`,
      `${displayName} ran ${spendText} of Google Ads spend ${periodLabel}`,
    ],
    seed,
    'pacing-lead',
  )

  const sentences = [`${[lead, ...tail].join(', ')}.`]
  if (sentenceCount >= 2) {
    if (typeof row.clicks === 'number' && typeof row.impressions === 'number') {
      const ctr = row.impressions > 0
        ? ` at a ${formatNumber((row.clicks / row.impressions) * 100)}% CTR`
        : ''
      const clicksText = formatNumber(row.clicks)
      const impressionsText = formatNumber(row.impressions)
      sentences.push(
        pickVariant(
          [
            `The account recorded ${clicksText} clicks from ${impressionsText} impressions${ctr}.`,
            `That came from ${clicksText} clicks against ${impressionsText} impressions${ctr}.`,
            `Traffic sat at ${clicksText} clicks from ${impressionsText} impressions${ctr}.`,
            `Across ${impressionsText} impressions the account drew ${clicksText} clicks${ctr}.`,
          ],
          seed,
          'pacing-traffic',
        ),
      )
    } else {
      sentences.push(
        pickVariant(
          [
            `The completed ${periodLabel} budget and campaign tables are included below.`,
            `The ${periodLabel} budget and campaign tables are set out below.`,
            `Budget and campaign tables for ${periodLabel} follow below.`,
          ],
          seed,
          'pacing-tables',
        ),
      )
    }
  }
  if (sentenceCount >= 3) {
    const avgCpc = typeof row.clicks === 'number' && row.clicks > 0
      ? (row.spend ?? 0) / row.clicks
      : null
    sentences.push(
      avgCpc !== null
        ? pickVariant(
            [
              `Average CPC was ${formatCurrency(avgCpc)}.`,
              `Average cost per click landed at ${formatCurrency(avgCpc)}.`,
              `Average cost per click came in at ${formatCurrency(avgCpc)}.`,
            ],
            seed,
            'pacing-cpc',
          )
        : pickVariant(
            [
              `The report below provides the supporting account detail.`,
              `Supporting account detail is in the report below.`,
              `The detail behind these numbers is in the report below.`,
            ],
            seed,
            'pacing-detail',
          ),
    )
  }
  return sentences.slice(0, sentenceCount).join(' ')
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
