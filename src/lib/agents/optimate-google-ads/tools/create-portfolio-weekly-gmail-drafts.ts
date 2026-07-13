import type { CanonicalTool, ToolContext } from '@/lib/agents/_shared/tool'
import type { WeeklyBucketRow } from '@/lib/google-ads-weekly-metric-table'
import { createGmailDraftTool } from './create-gmail-draft'
import { customerKey, loadPortfolioAccounts, type PortfolioAccount } from './_portfolio-accounts'
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
      "Create a separate weekly-only Gmail draft for every selected Google Ads account. Each draft covers completed Monday-Sunday weeks, has a one-sentence weekly performance and spend-pacing intro, a canonical weekly table, and the subject '[Client Name] - Google Ads Weekly Report'. It never includes monthly or MTD report HTML.",
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
      const weeks = Number(obj.weeks ?? 1)
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

      const accounts = selectAccounts(await loadPortfolioAccounts(), refs)
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
            title: 'Weekly Performance',
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
        const summary = buildWeeklySpendPacingSummary(weekly.rows)
        const subject = `${account.displayName} - Google Ads Weekly Report`
        const htmlBody = `${summaryHtml(summary)}\n${weekly.html}`
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

function selectAccounts(
  accounts: PortfolioAccount[],
  refs: Array<string | number>,
): PortfolioAccount[] {
  const selected = new Set(refs.map((ref) => String(ref)))
  return accounts.filter(
    (account) =>
      (account.accountRef !== undefined && selected.has(String(account.accountRef))) ||
      (account.clientId !== undefined && selected.has(String(account.clientId))) ||
      selected.has(customerKey(account.customerId)),
  )
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

function buildWeeklySpendPacingSummary(rows: WeeklyBucketRow[]): string {
  const latest = rows[rows.length - 1]
  if (!latest)
    return 'Weekly performance data was unavailable, so spend pacing could not be calculated.'

  const conversions = latest.totals.conversions
  const spend = latest.totals.spend
  if (conversions > 0) {
    return `${latest.label} delivered ${formatNumber(conversions)} conversions at a CPA of ${formatCurrency(spend / conversions)}; weekly spend pacing was ${formatCurrency(spend)}.`
  }
  return `${latest.label} delivered no recorded conversions; weekly spend pacing was ${formatCurrency(spend)}.`
}

function summaryHtml(summary: string): string {
  return `<p style="font-family:Verdana,sans-serif;font-size:13px;color:#222;margin:0 0 16px;line-height:1.5">${escapeHtml(summary)}</p>`
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
  buildWeeklySpendPacingSummary,
  previousSundayInAgencyTime,
}
