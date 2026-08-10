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
import { getDashboardEmailComponents } from './get-dashboard-email-components'
import type { GoogleAdsEmailComponentKey } from '@/lib/google-ads-email-components'
import { copySeed, pickGreeting, pickVariant } from './_email-copy-variants'

/**
 * Weekly reports support the same two graphs as the single-account weekly
 * tool. Keeping this list identical to `create_weekly_budget_gmail_draft` is
 * what makes an individual-chat draft and a portfolio draft render the same
 * email body.
 */
type WeeklyReportComponentKey = Extract<GoogleAdsEmailComponentKey, 'keyword_relevancy' | 'cpa_trend'>

const WEEKLY_REPORT_COMPONENT_KEYS = [
  'keyword_relevancy',
  'cpa_trend',
] as const satisfies readonly WeeklyReportComponentKey[]

const SUPPORTED_COMPONENTS = new Set<WeeklyReportComponentKey>(WEEKLY_REPORT_COMPONENT_KEYS)

/** Months of history behind the trend graphs, matching the single-account tool. */
const DASHBOARD_TREND_MONTHS = 14

interface CreatePortfolioWeeklyGmailDraftsArgs {
  accountRefs?: Array<string | number>
  weeks: number
  components: WeeklyReportComponentKey[]
  endDate?: string
  to?: string
}

interface DashboardComponentsData {
  html: string
  components: GoogleAdsEmailComponentKey[]
  warnings?: string[]
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
      'Create a separate Gmail draft for every selected Google Ads account using the canonical weekly budget-management template: greeting, client-friendly weekly performance summary, completed Monday-Sunday trend table, the selected dashboard graphs, current-month Budget Management HTML, dashboard link, and closing. Current-month data is used only for budget pacing; the performance report remains weekly. Produces the same email body as create_weekly_budget_gmail_draft, one draft per account. Args: weeks=4 for an unspecified weekly report, a 4-week trend, or "last four weeks" (defaults to 4); use weeks=1 only when the user explicitly wants a single week and no trend. A request for the "last completed Monday-Sunday weekly report" still uses the default 4-week trend table ending on that Sunday. components defaults to both graphs (keyword_relevancy, cpa_trend) when omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        accountRefs: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
        weeks: {
          type: 'integer',
          minimum: 1,
          maximum: 12,
          description:
            'Completed Monday-Sunday weeks in the trend table. Defaults to 4. Use 1 only when the user explicitly asks for a single week with no trend.',
        },
        components: {
          type: 'array',
          items: { type: 'string', enum: WEEKLY_REPORT_COMPONENT_KEYS as unknown as string[] },
          description:
            'Ordered graphs to include: keyword_relevancy, cpa_trend, or both. Defaults to both when omitted.',
        },
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

      // Default to both graphs rather than asking for clarification: this tool
      // is also driven by the deterministic multi-account shortcut, which has no
      // LLM turn available to answer a follow-up question.
      const components: WeeklyReportComponentKey[] = []
      if (obj.components !== undefined && obj.components !== null) {
        if (!Array.isArray(obj.components))
          throw new Error('components must be an array when provided')
        for (const item of obj.components) {
          if (typeof item !== 'string' || !SUPPORTED_COMPONENTS.has(item as WeeklyReportComponentKey)) {
            throw new Error(
              `Unknown weekly report graph "${String(item)}". Valid: ${WEEKLY_REPORT_COMPONENT_KEYS.join(', ')}`,
            )
          }
          const component = item as WeeklyReportComponentKey
          if (!components.includes(component)) components.push(component)
        }
      }

      const out: CreatePortfolioWeeklyGmailDraftsArgs = {
        weeks,
        components: components.length > 0 ? components : [...WEEKLY_REPORT_COMPONENT_KEYS],
      }
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
      const componentWarnings: Array<{
        accountRef?: string | number
        displayName: string
        warning: string
      }> = []

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

        // Rendered per account so each draft's graphs reflect that account's own
        // history. Component failures must not sink the whole batch, so a failed
        // render degrades to an email without graphs and reports a warning.
        let dashboard: DashboardComponentsData | null = null
        let dashboardError: string | null = null
        try {
          // Resolve components from the audit rather than the account context.
          // getDashboardEmailComponents short-circuits on a context customerId and
          // then has no clientSlug, which makes keyword_relevancy fail; passing
          // auditId against the base context lets it look up client + slug.
          const componentsCtx = account.accountRef !== undefined ? ctx : accountCtx
          const dashboardResult = await getDashboardEmailComponents.execute(
            {
              components: args.components,
              months: DASHBOARD_TREND_MONTHS,
              range: 'LAST_30_DAYS',
              ...(account.accountRef !== undefined ? { auditId: account.accountRef } : {}),
            },
            componentsCtx,
          )
          if (dashboardResult.ok) dashboard = dashboardResult.data as DashboardComponentsData
          else dashboardError = dashboardResult.error ?? 'component rendering failed'
        } catch (error) {
          dashboardError = error instanceof Error ? error.message : String(error)
        }
        if (dashboardError) {
          componentWarnings.push({
            accountRef: account.accountRef,
            displayName: account.displayName,
            warning: `Dashboard graphs omitted: ${dashboardError}`,
          })
        } else if (dashboard?.warnings?.length) {
          for (const warning of dashboard.warnings) {
            componentWarnings.push({
              accountRef: account.accountRef,
              displayName: account.displayName,
              warning,
            })
          }
        }

        // Seeded per account + reporting window: five accounts in one run read
        // differently, while a re-run for the same week reproduces the same copy.
        const seed = copySeed(account.displayName, account.customerId, endDate, args.weeks)
        const summary = buildWeeklyPerformanceSummary(weekly.rows, budget.budget, seed)
        const subject = `${account.displayName} - Google Ads Weekly Report`
        // Section order matches create_weekly_budget_gmail_draft exactly:
        // greeting, summary, weekly table, dashboard graphs, budget tracker.
        const htmlBody = [
          greetingHtml(seed),
          summaryHtml(summary),
          weekly.html,
          ...(dashboard ? [dashboard.html] : []),
          budget.html,
        ].join('\n')
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
          components: args.components,
          endDate,
          drafts,
          failures,
          componentWarnings,
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
  seed = 0,
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

  const conversionsText = formatNumber(conversions)
  const cpaText = cpa !== null ? formatCurrency(cpa) : ''
  const spendText = formatCurrency(spend)

  let performanceSentence: string
  if (
    previousConversions !== null &&
    conversions > previousConversions &&
    cpa !== null &&
    previousCpa !== null &&
    cpa < previousCpa
  ) {
    performanceSentence = pickVariant(
      [
        `Last week was strong across Google Ads: conversions increased to ${conversionsText} while CPA improved to ${cpaText}.`,
        `Google Ads had a good week: conversions lifted to ${conversionsText} and CPA came down to ${cpaText}.`,
        `Last week performed well: ${conversionsText} conversions came through and CPA tightened to ${cpaText}.`,
        `A strong week on Google Ads, with conversions up to ${conversionsText} and CPA improving to ${cpaText}.`,
      ],
      seed,
      'weekly-performance-up-efficient',
    )
  } else if (previousConversions !== null && conversions > previousConversions) {
    const cpaClause = cpa !== null ? ` at a CPA of ${cpaText}` : ''
    performanceSentence = pickVariant(
      [
        `Last week was strong across Google Ads: conversions increased to ${conversionsText}${cpaClause}.`,
        `Google Ads conversions moved up to ${conversionsText} last week${cpaClause}.`,
        `Last week lifted to ${conversionsText} conversions on Google Ads${cpaClause}.`,
        `Conversion volume grew last week to ${conversionsText}${cpaClause}.`,
      ],
      seed,
      'weekly-performance-up',
    )
  } else if (cpa !== null && previousCpa !== null && cpa < previousCpa) {
    performanceSentence = pickVariant(
      [
        `Last week was strong across Google Ads: CPA improved to ${cpaText} with ${conversionsText} conversions.`,
        `Efficiency was the win last week: CPA came down to ${cpaText} across ${conversionsText} conversions.`,
        `Google Ads CPA improved to ${cpaText} last week, off ${conversionsText} conversions.`,
        `Last week the account tightened CPA to ${cpaText} while delivering ${conversionsText} conversions.`,
      ],
      seed,
      'weekly-performance-efficient',
    )
  } else if (cpa !== null) {
    performanceSentence = pickVariant(
      [
        `Last week across Google Ads, the account delivered ${conversionsText} conversions at a CPA of ${cpaText}.`,
        `Google Ads delivered ${conversionsText} conversions last week at a CPA of ${cpaText}.`,
        `Last week the account recorded ${conversionsText} conversions, with CPA sitting at ${cpaText}.`,
        `Across last week, Google Ads brought in ${conversionsText} conversions at ${cpaText} each.`,
      ],
      seed,
      'weekly-performance-steady',
    )
  } else {
    performanceSentence = pickVariant(
      [
        `Last week across Google Ads, spend was ${spendText} with no recorded conversions.`,
        `Google Ads spend came in at ${spendText} last week, with no conversions recorded.`,
        `Last week the account spent ${spendText} and no conversions were recorded.`,
        `Spend for last week was ${spendText}, with no conversions tracked against it.`,
      ],
      seed,
      'weekly-performance-no-conversions',
    )
  }

  if (!budget || budget.monthlyBudget <= 0) return performanceSentence
  if (budget.pacingDifference <= 0) {
    const budgetSentence = pickVariant(
      [
        'Spend stayed controlled, keeping the account under budget and giving us a strong base for the rest of the month.',
        'Spend is tracking under budget for the month, which leaves room to lean into what is working.',
        'Budget pacing is comfortable, with the account sitting under target and the rest of the month still to run.',
        'Spend remains below the month-to-date target, so there is headroom left for the back half of the month.',
      ],
      seed,
      'weekly-budget-under',
    )
    return `${performanceSentence} ${budgetSentence}`
  }
  const budgetSentence = pickVariant(
    [
      'Spend is currently ahead of the month-to-date target, so we’ll keep pacing closely through the rest of the month.',
      'Spend is running ahead of the month-to-date target, so we’re watching pacing closely for the remainder of the month.',
      'The account is tracking ahead of the month-to-date budget target, so we’ll manage pacing tightly through month end.',
      'Month-to-date spend sits above target, so pacing is being adjusted for the rest of the month.',
    ],
    seed,
    'weekly-budget-over',
  )
  return `${performanceSentence} ${budgetSentence}`
}

function greetingHtml(seed = 0): string {
  return `<p style="margin:0 0 20px;color:#1e293b;font-size:14px;font-family:Arial,sans-serif;width:100%;max-width:none;display:block">${pickGreeting(seed)}</p>`
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
