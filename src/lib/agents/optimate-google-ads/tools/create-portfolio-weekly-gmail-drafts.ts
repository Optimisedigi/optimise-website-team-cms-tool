import type { CanonicalTool, ToolContext } from '@/lib/agents/_shared/tool'
import type { WeeklyBucketRow } from '@/lib/google-ads-weekly-metric-table'
import { createGmailDraftTool } from './create-gmail-draft'
import { getBudgetManagementEmail } from './get-budget-management-email'
import {
  loadPortfolioAccounts,
  selectPortfolioAccountsByAccountRefs,
  type PortfolioAccount,
} from './_portfolio-accounts'
import { getWeeklyMetricTable } from './get-weekly-metric-table'

interface CreatePortfolioWeeklyGmailDraftsArgs {
  accountRefs?: Array<string | number>
  weeks: number
  endDate?: string
  to?: string
}

interface WeeklyMetricTableData {
  html: string
  rows: WeeklyBucketRow[]
  weeks: number
}

interface BudgetManagementEmailData {
  html: string
  budget?: {
    monthlyBudget: number
    totalSpend: number
    targetSpendToDate: number
    pacingDifference: number
  }
}

interface GmailDraftData {
  draftId: string
  messageId: string
  gmailUrl: string
}

const MAX_ACCOUNTS = 10
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const AGENCY_TIMEZONE = 'Australia/Brisbane'

export const createPortfolioWeeklyGmailDraftsTool: CanonicalTool<CreatePortfolioWeeklyGmailDraftsArgs> =
  {
    name: 'create_portfolio_weekly_gmail_drafts',
    description:
      'Create a separate Gmail draft for every selected Google Ads account using the canonical weekly budget-management template: greeting, client-friendly weekly performance summary, completed Monday-Sunday trend table, current-month Budget Management HTML, dashboard link, and closing. Current-month data is used only for budget pacing; the performance report remains weekly.',
    inputSchema: {
      type: 'object',
      properties: {
        accountRefs: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
        weeks: { type: 'integer', minimum: 1, maximum: 12 },
        endDate: {
          type: 'string',
          description:
            'Inclusive Sunday in YYYY-MM-DD format. Defaults to the previous Sunday in agency time.',
        },
        to: {
          type: 'string',
          description: 'Optional recipient. Leave blank unless explicitly provided.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    validate(raw) {
      const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      const weeks = Number(obj.weeks ?? 4)
      if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12)
        throw new Error('weeks must be an integer between 1 and 12')

      const out: CreatePortfolioWeeklyGmailDraftsArgs = { weeks }
      if (Array.isArray(obj.accountRefs)) {
        out.accountRefs = obj.accountRefs.filter(
          (value): value is string | number =>
            typeof value === 'string' || typeof value === 'number',
        )
      }
      if (obj.endDate !== undefined && obj.endDate !== null && String(obj.endDate).trim()) {
        const endDate = String(obj.endDate).trim()
        if (!ISO_DATE_RE.test(endDate)) throw new Error('endDate must be in YYYY-MM-DD format')
        const parsedEndDate = new Date(`${endDate}T00:00:00Z`)
        if (
          Number.isNaN(parsedEndDate.getTime()) ||
          parsedEndDate.toISOString().slice(0, 10) !== endDate
        ) {
          throw new Error('endDate must be a valid calendar date')
        }
        if (parsedEndDate.getUTCDay() !== 0) {
          throw new Error(
            'endDate must be a Sunday so the report contains completed Monday-Sunday weeks',
          )
        }
        out.endDate = endDate
      }
      if (typeof obj.to === 'string' && obj.to.trim()) out.to = obj.to.trim()
      return out
    },
    async execute(args, ctx) {
      const refs = normaliseRefs(args.accountRefs ?? contextSelectedAccountRefs(ctx))
      if (refs.length === 0) return { ok: false, error: 'No selected accounts were supplied.' }

      const accounts = selectPortfolioAccountsByAccountRefs(await loadPortfolioAccounts(), refs)
      const capped = accounts.slice(0, MAX_ACCOUNTS)
      if (capped.length === 0)
        return { ok: false, error: 'None of the selected Google Ads accounts could be found.' }

      const endDate = args.endDate ?? previousSundayInAgencyTime()
      const drafts: Array<{
        accountRef?: string | number
        displayName: string
        subject: string
        draftId: string
        messageId: string
        gmailUrl: string
        summary: string
      }> = []
      const failures: Array<{ accountRef?: string | number; displayName: string; error: string }> =
        []

      // Keep account rendering sequential: each weekly fetch reaches Growth Tools,
      // and bounded serial work avoids creating an upstream request burst.
      for (const account of capped) {
        const accountCtx = contextForAccount(ctx, account)
        const weeklyResult = await getWeeklyMetricTable.execute(
          {
            weeks: args.weeks,
            endDate,
            metrics: ['spend', 'conversions', 'cpa'],
            title: 'Weekly Performance Trend',
          },
          accountCtx,
        )
        if (!weeklyResult.ok) {
          failures.push({
            accountRef: account.accountRef,
            displayName: account.displayName,
            error: weeklyResult.error ?? 'Weekly performance generation failed',
          })
          continue
        }

        const weekly = weeklyResult.data as WeeklyMetricTableData
        const budgetResult = await getBudgetManagementEmail.execute(
          { mode: 'this_month', auditId: account.accountRef },
          accountCtx,
        )
        if (!budgetResult.ok) {
          failures.push({
            accountRef: account.accountRef,
            displayName: account.displayName,
            error: budgetResult.error ?? 'Budget Management email generation failed',
          })
          continue
        }

        const budget = budgetResult.data as BudgetManagementEmailData
        const summary = buildWeeklyPerformanceSummary(weekly.rows, budget.budget)
        const subject = `${account.displayName} - Google Ads Weekly Report`
        const htmlBody = [greetingHtml(), summaryHtml(summary), weekly.html, budget.html].join('\n')
        const draftResult = await createGmailDraftTool.execute(
          { subject, htmlBody, ...(args.to ? { to: args.to } : {}) },
          accountCtx,
        )
        if (!draftResult.ok) {
          failures.push({
            accountRef: account.accountRef,
            displayName: account.displayName,
            error: draftResult.error ?? 'Gmail draft creation failed',
          })
          continue
        }

        const draft = draftResult.data as GmailDraftData
        drafts.push({
          accountRef: account.accountRef,
          displayName: account.displayName,
          subject,
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
          processedCount: capped.length,
          weeks: args.weeks,
          endDate,
          drafts,
          failures,
          capped: accounts.length > capped.length,
          message: `Created ${drafts.length} separate weekly Gmail draft${drafts.length === 1 ? '' : 's'}${failures.length ? `; ${failures.length} failed` : ''}.`,
        },
      }
    },
  }

function contextSelectedAccountRefs(ctx: ToolContext): Array<string | number> {
  return Array.isArray(ctx.context.selectedAccountRefs)
    ? ctx.context.selectedAccountRefs.filter(
        (value): value is string | number => typeof value === 'string' || typeof value === 'number',
      )
    : []
}

function normaliseRefs(refs: Array<string | number>): Array<string | number> {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const key = String(ref).trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function contextForAccount(ctx: ToolContext, account: PortfolioAccount): ToolContext {
  return {
    ...ctx,
    context: {
      ...ctx.context,
      ...(account.accountRef !== undefined ? { auditId: account.accountRef } : {}),
      ...(account.clientId !== undefined ? { clientId: account.clientId } : {}),
      clientName: account.displayName,
      customerId: account.customerId,
      conversionActions: account.conversionActions ?? '',
      conversionActionCategories: account.conversionActionCategories ?? '',
    },
  }
}

function buildWeeklyPerformanceSummary(
  rows: WeeklyBucketRow[],
  budget?: BudgetManagementEmailData['budget'],
): string {
  const latest = rows[rows.length - 1]
  const previous = rows[rows.length - 2]
  if (!latest) return 'Last week’s performance data was unavailable.'

  const conversions = latest.totals.conversions
  const spend = latest.totals.spend
  const cpa = conversions > 0 ? spend / conversions : null
  const previousConversions = previous?.totals.conversions ?? null
  const previousCpa =
    previous && previous.totals.conversions > 0
      ? previous.totals.spend / previous.totals.conversions
      : null

  let performanceSentence: string
  if (
    previousConversions !== null &&
    conversions > previousConversions &&
    cpa !== null &&
    previousCpa !== null &&
    cpa < previousCpa
  ) {
    performanceSentence = `Last week was strong across Google Ads: conversions increased to ${formatNumber(conversions)} while CPA improved to ${formatCurrency(cpa)}.`
  } else if (previousConversions !== null && conversions > previousConversions) {
    performanceSentence = `Last week was strong across Google Ads: conversions increased to ${formatNumber(conversions)}${cpa !== null ? ` at a CPA of ${formatCurrency(cpa)}` : ''}.`
  } else if (cpa !== null && previousCpa !== null && cpa < previousCpa) {
    performanceSentence = `Last week was strong across Google Ads: CPA improved to ${formatCurrency(cpa)} with ${formatNumber(conversions)} conversions.`
  } else if (cpa !== null) {
    performanceSentence = `Last week across Google Ads, the account delivered ${formatNumber(conversions)} conversions at a CPA of ${formatCurrency(cpa)}.`
  } else {
    performanceSentence = `Last week across Google Ads, spend was ${formatCurrency(spend)} with no recorded conversions.`
  }

  if (!budget || budget.monthlyBudget <= 0) return performanceSentence
  if (budget.pacingDifference <= 0) {
    return `${performanceSentence} Spend stayed controlled, keeping the account under budget and giving us a strong base for the rest of the month.`
  }
  return `${performanceSentence} Spend is currently ahead of the month-to-date target, so we’ll keep pacing closely through the rest of the month.`
}

function greetingHtml(): string {
  return '<p style="margin:0 0 20px;color:#1e293b;font-size:14px;font-family:Arial,sans-serif;width:100%;max-width:none;display:block">Hey team,</p>'
}

function summaryHtml(summary: string): string {
  return `<p style="margin:0 0 24px;color:#1e293b;font-size:14px;line-height:1.5;font-family:Arial,sans-serif;width:100%;max-width:none;display:block">${escapeHtml(summary)}</p>`
}

function previousSundayInAgencyTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AGENCY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  const agencyDateAsUtc = new Date(Date.UTC(year, month - 1, day))
  const dayOfWeek = agencyDateAsUtc.getUTCDay()
  agencyDateAsUtc.setUTCDate(agencyDateAsUtc.getUTCDate() - (dayOfWeek === 0 ? 7 : dayOfWeek))
  return agencyDateAsUtc.toISOString().slice(0, 10)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 }).format(value)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const __createPortfolioWeeklyGmailDraftsInternals = {
  buildWeeklyPerformanceSummary,
  previousSundayInAgencyTime,
}
