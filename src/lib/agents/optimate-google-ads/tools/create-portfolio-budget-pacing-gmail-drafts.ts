import type { CanonicalTool, ToolContext } from '@/lib/agents/_shared/tool'
import { createGmailDraftTool } from './create-gmail-draft'
import { getBudgetManagementEmail } from './get-budget-management-email'
import { getPortfolioPerformanceSummary } from './get-portfolio-performance-summary'
import { getDashboardEmailComponents } from './get-dashboard-email-components'
import { getMonthlyMetricTable } from './get-monthly-metric-table'
import { buildMonthlyEmailSummary, type MonthlySummaryRow } from './_monthly-email-summary'
import { prepareMonthlyBudgetBreakdownHtml } from './_monthly-budget-html'
import {
  GOOGLE_ADS_EMAIL_COMPONENT_KEYS,
  type GoogleAdsEmailComponentKey,
} from '@/lib/google-ads-email-components'
import {
  customerKey,
  loadPortfolioAccounts,
  selectPortfolioAccountsByAccountRefs,
} from './_portfolio-accounts'
import { copySeed, pickGreeting, pickVariant, seedCustomerId } from './_email-copy-variants'
import { loadClientEmailCopy } from '@/lib/agents/_shared/client-email-copy'
import type { EmailComponentData } from './_email-component-insights'

interface CreatePortfolioBudgetPacingGmailDraftsArgs {
  accountRefs?: Array<string | number>
  to?: string
  period?: 'this_month' | 'last_month'
  summarySentences?: 1 | 2 | 3
  components: GoogleAdsEmailComponentKey[]
}

interface DashboardComponentsData {
  html: string
  components: GoogleAdsEmailComponentKey[]
  warnings?: string[]
  componentData?: EmailComponentData
}

/** Completed months shown in the monthly trend table, matching the single-account tool. */
const MONTHLY_TREND_MONTHS = 4

/** Month span ending on the last completed calendar month. */
function monthSpanEndingPreviousMonth(
  months: number,
  now = new Date(),
): { startMonth: string; endMonth: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const start = new Date(end)
  start.setUTCMonth(start.getUTCMonth() - Math.max(1, months) + 1)
  const toMonth = (date: Date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  return { startMonth: toMonth(start), endMonth: toMonth(end) }
}

/** Months of history behind the trend graphs, matching the single-account tool. */
const DASHBOARD_TREND_MONTHS = 14

const SUPPORTED_COMPONENTS = new Set<GoogleAdsEmailComponentKey>(GOOGLE_ADS_EMAIL_COMPONENT_KEYS)

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
    // Creates real Gmail drafts, so the agent loop must de-duplicate repeats.
    sideEffect: true,
    description:
      "Create separate Gmail drafts for each selected audit-backed Google Ads account's current-month budget pacing or last completed month's performance in one deterministic server-side operation. Explicitly pass period='last_month' for 'last month', 'previous month', or 'completed month'; otherwise use period='this_month'. Supports the same dashboard components as create_monthly_budget_gmail_draft (keyword_relevancy, cpa_trend, quality_score, top_converters), defaulting to all four when omitted, so portfolio drafts match single-account drafts. It leaves recipients blank unless explicitly provided.",
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
        components: {
          type: 'array',
          items: { type: 'string', enum: GOOGLE_ADS_EMAIL_COMPONENT_KEYS as unknown as string[] },
          description:
            'Ordered dashboard components to render above the budget tracker: keyword_relevancy, cpa_trend, quality_score, top_converters. Defaults to all four when omitted.',
        },
      },
      additionalProperties: false,
    },
    validate(raw) {
      const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      const out: CreatePortfolioBudgetPacingGmailDraftsArgs = {
        components: [...GOOGLE_ADS_EMAIL_COMPONENT_KEYS],
      }
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

      // Default to the full component set rather than asking for clarification:
      // the deterministic multi-account shortcut calls this tool with no LLM turn
      // available to answer a follow-up question.
      const components: GoogleAdsEmailComponentKey[] = []
      if (obj.components !== undefined && obj.components !== null) {
        if (!Array.isArray(obj.components))
          throw new Error('components must be an array when provided')
        for (const item of obj.components) {
          if (typeof item !== 'string' || !SUPPORTED_COMPONENTS.has(item as GoogleAdsEmailComponentKey)) {
            throw new Error(
              `Unknown component "${String(item)}". Valid: ${GOOGLE_ADS_EMAIL_COMPONENT_KEYS.join(', ')}`,
            )
          }
          const key = item as GoogleAdsEmailComponentKey
          if (!components.includes(key)) components.push(key)
        }
      }
      out.components =
        components.length > 0 ? components : [...GOOGLE_ADS_EMAIL_COMPONENT_KEYS]

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
      const componentWarnings: Array<{
        accountRef?: string | number
        displayName: string
        warning: string
      }> = []

      // Deliberately sequential: budget rendering self-calls CMS → Growth Tools → Google Ads.
      // Keeping one account in flight avoids backend bursts while still finishing quickly because
      // this shortcut removes the expensive LLM round-trip between each account.
      // Span ending on the last completed calendar month, shared by the trend
      // table and the dashboard components so both describe the same month.
      const monthSpan = monthSpanEndingPreviousMonth(MONTHLY_TREND_MONTHS)
      // Loaded once for the whole batch: every draft shares the same wording rules.
      const copy = await loadClientEmailCopy()

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

        // A completed-month report reuses the current-month budget block with
        // last month's campaign metrics, exactly as the single-account monthly
        // tool does, then rewrites it into its monthly form below.
        const budgetResult = await getBudgetManagementEmail.execute(
          period === 'last_month'
            ? { mode: 'this_month', campaignMetricsRange: 'LAST_MONTH', auditId }
            : { mode: period, auditId },
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

        // Rendered per account against that account's own audit context. A
        // component failure degrades to an email without graphs rather than
        // failing the account's draft outright.
        let dashboard: DashboardComponentsData | null = null
        let dashboardError: string | null = null
        try {
          const dashboardResult = await getDashboardEmailComponents.execute(
            {
              components: args.components,
              months: DASHBOARD_TREND_MONTHS,
              // A completed-month report anchors trend components on that month,
              // or Quality Score reports the current partial month instead.
              ...(period === 'last_month' ? { endMonth: monthSpan.endMonth } : {}),
              range: period === 'last_month' ? 'LAST_MONTH' : 'LAST_30_DAYS',
              auditId,
            },
            ctx,
          )
          if (dashboardResult.ok) dashboard = dashboardResult.data as DashboardComponentsData
          else dashboardError = dashboardResult.error ?? 'component rendering failed'
        } catch (error) {
          dashboardError = error instanceof Error ? error.message : String(error)
        }
        if (dashboardError) {
          componentWarnings.push({
            accountRef: auditId,
            displayName: account.displayName,
            warning: `Dashboard components omitted: ${dashboardError}`,
          })
        } else if (dashboard?.warnings?.length) {
          for (const warning of dashboard.warnings) {
            componentWarnings.push({
              accountRef: auditId,
              displayName: account.displayName,
              warning,
            })
          }
        }

        // A completed-month request is a monthly performance report, so it gets
        // the same month-on-month trend table and shared summary as
        // create_monthly_budget_gmail_draft. A current-month request stays a
        // budget pacing email and keeps the pacing-oriented summary.
        let monthlyTableHtml: string | null = null
        let summary: string
        if (period === 'last_month') {
          const monthlyResult = await getMonthlyMetricTable.execute(
            {
              startMonth: monthSpan.startMonth,
              endMonth: monthSpan.endMonth,
              metrics: ['spend', 'conversions', 'cpa'],
            },
            {
              ...ctx,
              context: {
                ...ctx.context,
                auditId,
                ...(account.clientId !== undefined ? { clientId: account.clientId } : {}),
                clientName: account.displayName,
                customerId: account.customerId,
                // Without the account's conversion-action filters the trend table
                // counts every conversion action, so older months disagree with
                // the single-account report for the same account.
                conversionActions: account.conversionActions ?? '',
                conversionActionCategories: account.conversionActionCategories ?? '',
              },
            },
          )
          if (!monthlyResult.ok) {
            failures.push({
              accountRef: auditId,
              displayName: account.displayName,
              error: monthlyResult.error ?? 'Monthly performance generation failed',
            })
            continue
          }
          const monthly = monthlyResult.data as { html: string; rows: MonthlySummaryRow[] }
          monthlyTableHtml = monthly.html
          summary = buildMonthlyEmailSummary({
            rows: monthly.rows,
            components: args.components,
            dashboardData: dashboard?.componentData,
            seed: copySeed(
              account.displayName,
              seedCustomerId(account.customerId),
              'monthly',
              monthSpan.endMonth,
            ),
            copy,
          })
        } else {
          // Seeded per account + period so a batch of drafts does not repeat the
          // same sentence structure, while a re-run reproduces identical copy.
          summary = buildPerformanceSummary(
            account.displayName,
            perf,
            period,
            summarySentences,
            copySeed(account.displayName, account.customerId, period, performance.rangeLabel),
          )
        }
        // Section order matches create_monthly_budget_gmail_draft: greeting and
        // summary, then the monthly trend table, then components, then budget.
        const htmlBody = [
          // Completed-month reports open with a greeting, matching
          // create_monthly_budget_gmail_draft. Current-month pacing emails keep
          // their existing greeting-free format.
          ...(period === 'last_month'
            ? [
                `<p style="margin:0 0 20px;width:100%;max-width:none;display:block;font-family:Arial,sans-serif;font-size:14px;color:#1e293b">${escapeHtml(
                  pickGreeting(
                    copySeed(
                      account.displayName,
                      seedCustomerId(account.customerId),
                      'monthly',
                      monthSpan.endMonth,
                    ),
                    copy,
                  ),
                )}</p>`,
              ]
            : []),
          summaryHtml(summary),
          ...(monthlyTableHtml ? [monthlyTableHtml] : []),
          ...(dashboard ? [dashboard.html] : []),
          period === 'last_month' ? prepareMonthlyBudgetBreakdownHtml(budget.html) : budget.html,
        ].join('\n')
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
          components: args.components,
          drafts,
          skipped,
          failures,
          componentWarnings,
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
              `Average CPC was ${formatCpc(avgCpc)}.`,
              `Average cost per click landed at ${formatCpc(avgCpc)}.`,
              `Average cost per click came in at ${formatCpc(avgCpc)}.`,
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

/** CPC is the one email figure kept to cents - whole dollars lose too much of it. */
function formatCpc(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
