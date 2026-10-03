import type { HostingInterval } from './hosting-billing'

/**
 * When a client's hosting billing starts and renews. Admins set a billing
 * start date per client (the day work starts). Every renewal then falls on
 * that same date: the same day each month, or the same day and month each
 * year. Dates are calendar days in Sydney time, stored as YYYY-MM-DD.
 */
export type BillingStart =
  /** No start date, or it is today: charge now, renew on today's date. */
  | { kind: 'today'; renewalDate: string }
  /** Start date is ahead: nothing charged until then, first full charge on it. */
  | { kind: 'future'; startDate: string }
  /**
   * Start date has passed: the full price is charged today (never pro-rata),
   * then the full price on `nextChargeDate` and every anniversary of the
   * start date after it.
   */
  | { kind: 'past'; startDate: string; nextChargeDate: string }

const TIME_ZONE = 'Australia/Sydney'
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
/**
 * Charges land at 02:00 UTC, which is midday or 1pm in Sydney. The charge and
 * receipt fall on the same calendar day for Stripe (UTC) and the client.
 */
const CHARGE_HOUR_UTC = 2
/**
 * Stripe only accepts a first renewal at least two days out (its free-period
 * minimum); an hour's margin covers the time between page and payment.
 */
const MIN_FIRST_RENEWAL_MS = 49 * 3_600_000

type YMD = { year: number; month: number; day: number }

function toYmd(value: string): YMD | null {
  const match = DATE_PATTERN.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    return null
  return { year, month, day }
}

function fromYmd({ year, month, day }: YMD): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The day `day` in a given month, clamped to the month's last day (31 → 30 in April). */
function clampedDate(year: number, month: number, day: number): YMD {
  return { year, month, day: Math.min(day, daysInMonth(year, month)) }
}

/** Returns a valid YYYY-MM-DD date, or null for blank or invalid input. */
export function parseBillingStartDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const ymd = toYmd(value.trim().slice(0, 10))
  return ymd ? fromYmd(ymd) : null
}

/** Today's calendar date in Sydney as YYYY-MM-DD. */
export function sydneyToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** The first anniversary of `start` that falls after `today`. */
function nextAnniversary(start: YMD, today: YMD, interval: HostingInterval): YMD {
  const todayKey = fromYmd(today)
  if (interval === 'year') {
    const thisYear = clampedDate(today.year, start.month, start.day)
    return fromYmd(thisYear) > todayKey
      ? thisYear
      : clampedDate(today.year + 1, start.month, start.day)
  }
  const thisMonth = clampedDate(today.year, today.month, start.day)
  if (fromYmd(thisMonth) > todayKey) return thisMonth
  const nextMonth =
    today.month === 12
      ? { year: today.year + 1, month: 1 }
      : { year: today.year, month: today.month + 1 }
  return clampedDate(nextMonth.year, nextMonth.month, start.day)
}

/**
 * Whether `today` is exactly a renewal date for a schedule that started on
 * `start`. A shortened month-end (the 30th for a 31st start, 28 Feb for a
 * 29 Feb start) deliberately does not count: billing from today would anchor
 * Stripe on the shortened day and move every later renewal off the start date.
 * Those dates take the `past` path, which pins the real day in Stripe.
 */
function isAnniversary(start: YMD, today: YMD, interval: HostingInterval): boolean {
  const sameDay = today.day === start.day
  return interval === 'year' ? today.month === start.month && sameDay : sameDay
}

export function planBillingStart(
  startDate: string | null | undefined,
  interval: HostingInterval,
  now: Date,
): BillingStart {
  const todayKey = sydneyToday(now)
  const start = startDate ? toYmd(startDate) : null
  if (!start || fromYmd(start) === todayKey) return { kind: 'today', renewalDate: todayKey }
  const startKey = fromYmd(start)
  if (startKey > todayKey) return { kind: 'future', startDate: startKey }
  const today = toYmd(todayKey) as YMD
  if (isAnniversary(start, today, interval)) return { kind: 'today', renewalDate: todayKey }
  // The full price is charged once today; the plan renews on the next
  // anniversary of the start date. That first renewal moves one period on
  // (the amount today is unchanged) when it is under two days away, which
  // Stripe cannot schedule, or when it falls on a shortened month-end, which
  // would move every later monthly renewal off the start day for good.
  // Yearly plans never move for a shortened day: that would give a whole year
  // free. A 29 Feb yearly start renews on 28 February instead.
  let next = nextAnniversary(start, today, interval)
  for (
    let moved = 0;
    moved < 2 &&
    (chargeTimestamp(fromYmd(next)) * 1000 - now.getTime() < MIN_FIRST_RENEWAL_MS ||
      (interval === 'month' && next.day !== start.day));
    moved += 1
  ) {
    next = nextAnniversary(start, next, interval)
  }
  return { kind: 'past', startDate: startKey, nextChargeDate: fromYmd(next) }
}

export type StripeBillingStartParams =
  | Record<string, never>
  | { billing_cycle_anchor: number; proration_behavior: 'none' }
  | { trial_end: number }

function chargeTimestamp(date: string): number {
  const { year, month, day } = toYmd(date) as YMD
  return Math.floor(Date.UTC(year, month - 1, day, CHARGE_HOUR_UTC) / 1000)
}

/**
 * Stripe Checkout `subscription_data` fields that put the first charge and
 * every renewal on the client's billing start date.
 *
 * - Future start within one billing period: anchor billing there with no
 *   pro-rata, so nothing is charged until the start date.
 * - Further out: Stripe only lets an anchor sit within the first period, so
 *   use a free period (trial) that ends on the start date instead.
 * - Past start: the plan's first charge is the next renewal (a free period
 *   until then), and the full price is a separate one-time charge today.
 *   Renewals keep the start day.
 */
export function stripeBillingStartParams(
  start: BillingStart,
  interval: HostingInterval,
  now: Date,
): StripeBillingStartParams {
  if (start.kind === 'today') return {}
  if (start.kind === 'future') {
    const anchor = chargeTimestamp(start.startDate)
    const periodEnd = new Date(now)
    if (interval === 'year') periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1)
    else periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1)
    // A day's margin keeps this clear of Stripe's own month-length arithmetic.
    const lastAnchor = Math.floor(periodEnd.getTime() / 1000) - 86_400
    return anchor <= lastAnchor
      ? { billing_cycle_anchor: anchor, proration_behavior: 'none' }
      : { trial_end: anchor }
  }
  return { trial_end: chargeTimestamp(start.nextChargeDate) }
}

/** A YYYY-MM-DD billing date as "15 November 2026". */
export function formatBillingDate(date: string): string {
  const { year, month, day } = toYmd(date) as YMD
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-AU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function ordinal(day: number): string {
  const tens = day % 100
  if (tens >= 11 && tens <= 13) return `${day}th`
  return `${day}${{ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th'}`
}

function renewalPhrase(anchorDate: string, interval: HostingInterval): string {
  const { month, day } = toYmd(anchorDate) as YMD
  if (interval === 'month') {
    return day > 28
      ? `on the ${ordinal(day)} of each month (or the last day of shorter months)`
      : `on the ${ordinal(day)} of each month`
  }
  const dayMonth = new Date(Date.UTC(2000, month - 1, day)).toLocaleDateString('en-AU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  })
  return month === 2 && day === 29
    ? `on ${dayMonth} each year (28 February in other years)`
    : `on ${dayMonth} each year`
}

/** Plain-English payment schedule for the client: what happens today, and after. */
export function describeBillingStart(
  start: BillingStart,
  interval: HostingInterval,
  total: string,
): { headline: string; detail: string } {
  if (start.kind === 'future') {
    return {
      headline: `Nothing is charged today. Your first payment of ${total} is on ${formatBillingDate(start.startDate)}.`,
      detail: `After that, ${total} is charged automatically ${renewalPhrase(start.startDate, interval)}, to the same card, until cancelled.`,
    }
  }
  if (start.kind === 'past') {
    // Stripe renews on the first renewal's date, so describe that date (it is
    // 28 February, not 29 February, for a yearly 29 Feb start).
    const renewsOn = interval === 'year' ? start.nextChargeDate : start.startDate
    return {
      headline: `Today you pay ${total} for hosting up to ${formatBillingDate(start.nextChargeDate)}.`,
      detail: `From then on, ${total} is charged automatically ${renewalPhrase(renewsOn, interval)}, to the same card, until cancelled.`,
    }
  }
  return {
    headline: `You pay ${total} today${interval === 'year' ? ' for 12 months of hosting' : ''}.`,
    detail: `It renews automatically ${renewalPhrase(start.renewalDate, interval)}, charged to the same card, until cancelled.`,
  }
}
