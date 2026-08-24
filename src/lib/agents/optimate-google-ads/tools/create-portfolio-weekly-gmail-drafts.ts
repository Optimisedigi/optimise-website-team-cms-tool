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
import { copySeed, pickGreeting, seedCustomerId } from './_email-copy-variants'
import type { ClientEmailCopy } from './_email-copy-slots'
import { loadClientEmailCopy } from '@/lib/agents/_shared/client-email-copy'
import { buildWeeklyEmailSummary } from './_weekly-email-summary'
import type { EmailComponentData } from './_email-component-insights'

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
  componentData?: EmailComponentData
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
/** Reserve enough time for the route to persist and return partial batch results. */
const DEADLINE_SAFETY_MARGIN_MS = 20_000

export const createPortfolioWeeklyGmailDraftsTool: CanonicalTool<CreatePortfolioWeeklyGmailDraftsArgs> =
  {
    name: 'create_portfolio_weekly_gmail_drafts',
    // Creates real Gmail drafts, so the agent loop must de-duplicate repeats.
    sideEffect: true,
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
      // Loaded once for the whole batch: every draft shares the same wording rules.
      const copy = await loadClientEmailCopy()
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
      const notProcessed: Array<{ accountRef?: string | number; displayName: string; reason: string }> = []
      let processedCount = 0

      // Keep account rendering sequential: each weekly fetch reaches Growth Tools,
      // and bounded serial work avoids creating an upstream request burst.
      for (let accountIndex = 0; accountIndex < capped.length; accountIndex += 1) {
        const account = capped[accountIndex]
        if (deadlineIsTooClose(ctx)) {
          notProcessed.push(
            ...capped.slice(accountIndex).map((remainingAccount) => ({
              accountRef: remainingAccount.accountRef,
              displayName: remainingAccount.displayName,
              reason: 'Request deadline is too close to safely begin another account.',
            })),
          )
          break
        }
        processedCount += 1
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
        if (deadlineIsTooClose(ctx)) {
          notProcessed.push({
            accountRef: account.accountRef,
            displayName: account.displayName,
            reason: 'Request deadline is too close to safely continue this account.',
          })
          continue
        }
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
        if (deadlineIsTooClose(ctx)) {
          notProcessed.push({
            accountRef: account.accountRef,
            displayName: account.displayName,
            reason: 'Request deadline is too close to safely continue this account.',
          })
          continue
        }

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
              relevancyMode: 'cache_only',
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
        const seed = copySeed(account.displayName, seedCustomerId(account.customerId), endDate, args.weeks)
        // Same generator as the individual account view, so a weekly draft reads
        // identically no matter which surface created it.
        const summary = buildWeeklyEmailSummary({
          rows: weekly.rows,
          components: args.components,
          dashboardData: dashboard?.componentData,
          budget: budget.budget,
          seed,
          copy,
        })
        const subject = `${account.displayName} - Google Ads Weekly Report`
        // Section order matches create_weekly_budget_gmail_draft exactly:
        // greeting, summary, weekly table, dashboard graphs, budget tracker.
        const htmlBody = [
          greetingHtml(seed, copy),
          summaryHtml(summary),
          weekly.html,
          ...(dashboard ? [dashboard.html] : []),
          budget.html,
        ].join('\n')
        if (deadlineIsTooClose(ctx)) {
          notProcessed.push({
            accountRef: account.accountRef,
            displayName: account.displayName,
            reason: 'Request deadline is too close to safely create this Gmail draft.',
          })
          continue
        }
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
          processedCount,
          weeks: args.weeks,
          components: args.components,
          endDate,
          drafts,
          failures,
          componentWarnings,
          notProcessed,
          capped: accounts.length > capped.length,
          message: `Created ${drafts.length} separate weekly Gmail draft${drafts.length === 1 ? '' : 's'}${failures.length ? `; ${failures.length} failed` : ''}${notProcessed.length ? `; ${notProcessed.length} not processed before the request deadline—retry those accounts.` : ''}.`,
        },
      }
    },
  }

function deadlineIsTooClose(ctx: ToolContext, now = Date.now()): boolean {
  return ctx.deadlineMs !== undefined && now >= ctx.deadlineMs - DEADLINE_SAFETY_MARGIN_MS
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


function greetingHtml(seed = 0, copy?: ClientEmailCopy): string {
  return `<p style="margin:0 0 20px;color:#1e293b;font-size:14px;font-family:Arial,sans-serif;width:100%;max-width:none;display:block">${pickGreeting(seed, copy)}</p>`
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



function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const __createPortfolioWeeklyGmailDraftsInternals = {
  previousSundayInAgencyTime,
  deadlineIsTooClose,
  DEADLINE_SAFETY_MARGIN_MS,
}
