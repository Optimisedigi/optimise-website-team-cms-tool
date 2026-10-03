import { describe, expect, it } from 'vitest'
import {
  describeBillingStart,
  parseBillingStartDate,
  planBillingStart,
  stripeBillingStartParams,
  sydneyToday,
} from '@/lib/hosting-billing-schedule'

// 2 Oct 2026, 10:00 in Sydney (AEST, UTC+10; daylight saving starts 4 Oct).
const NOW = new Date('2026-10-02T00:00:00.000Z')
const at2amUtc = (date: string) => Math.floor(Date.parse(`${date}T02:00:00.000Z`) / 1000)

describe('sydneyToday', () => {
  it('uses the Sydney calendar date, not UTC', () => {
    // 1 Oct 20:00 UTC is already 2 Oct in Sydney.
    expect(sydneyToday(new Date('2026-10-01T20:00:00.000Z'))).toBe('2026-10-02')
  })
})

describe('parseBillingStartDate', () => {
  it.each([
    ['2026-11-15', '2026-11-15'],
    ['2026-11-15T00:00:00.000Z', '2026-11-15'],
    ['', null],
    [null, null],
    ['2026-02-30', null],
    ['15/11/2026', null],
  ])('%s -> %s', (input, expected) => {
    expect(parseBillingStartDate(input)).toBe(expected)
  })
})

describe('planBillingStart', () => {
  it.each([
    {
      name: 'no start date bills today',
      start: null,
      interval: 'month',
      expected: { kind: 'today', renewalDate: '2026-10-02' },
    },
    {
      name: 'start date today bills today',
      start: '2026-10-02',
      interval: 'year',
      expected: { kind: 'today', renewalDate: '2026-10-02' },
    },
    {
      name: 'future start waits',
      start: '2026-11-15',
      interval: 'month',
      expected: { kind: 'future', startDate: '2026-11-15' },
    },
    {
      name: 'past monthly start renews on its day this month',
      start: '2026-08-20',
      interval: 'month',
      expected: { kind: 'past', startDate: '2026-08-20', nextChargeDate: '2026-10-20' },
    },
    {
      name: 'past monthly start renews next month once its day has passed',
      start: '2026-09-01',
      interval: 'month',
      expected: { kind: 'past', startDate: '2026-09-01', nextChargeDate: '2026-11-01' },
    },
    {
      name: 'past annual start renews on its next anniversary',
      start: '2026-03-10',
      interval: 'year',
      expected: { kind: 'past', startDate: '2026-03-10', nextChargeDate: '2027-03-10' },
    },
    {
      name: 'a renewal under two days away moves to the next month (Stripe minimum)',
      start: '2026-08-03',
      interval: 'month',
      expected: { kind: 'past', startDate: '2026-08-03', nextChargeDate: '2026-11-03' },
    },
    {
      name: 'an annual renewal under two days away moves to the following year',
      start: '2025-10-03',
      interval: 'year',
      expected: { kind: 'past', startDate: '2025-10-03', nextChargeDate: '2027-10-03' },
    },
    {
      name: 'a renewal more than two days away stays on the next start day',
      start: '2026-08-05',
      interval: 'month',
      expected: { kind: 'past', startDate: '2026-08-05', nextChargeDate: '2026-10-05' },
    },
    {
      name: 'past start whose renewal day is today bills today',
      start: '2026-07-02',
      interval: 'month',
      expected: { kind: 'today', renewalDate: '2026-10-02' },
    },
    {
      name: 'day 31 clamps to the last day of a short month',
      start: '2026-08-31',
      interval: 'month',
      expected: { kind: 'past', startDate: '2026-08-31', nextChargeDate: '2026-10-31' },
    },
  ] as const)('$name', ({ start, interval, expected }) => {
    expect(planBillingStart(start, interval, NOW)).toEqual(expected)
  })

  it.each([
    {
      name: 'a 31st monthly start signed up on 30 Nov keeps the 31st',
      start: '2026-08-31',
      interval: 'month',
      now: '2026-11-30T00:00:00.000Z',
      nextChargeDate: '2026-12-31',
    },
    {
      name: 'a 29 Feb annual start signed up on 28 Feb keeps 29 Feb',
      start: '2024-02-29',
      interval: 'year',
      now: '2027-02-28T00:00:00.000Z',
      nextChargeDate: '2028-02-29',
    },
  ] as const)('$name', ({ start, interval, now, nextChargeDate }) => {
    // Billing "today" here would anchor Stripe on the shortened day for good.
    const plan = planBillingStart(start, interval, new Date(now))

    expect(plan).toEqual({ kind: 'past', startDate: start, nextChargeDate })
    expect(stripeBillingStartParams(plan, interval, new Date(now))).toEqual({
      trial_end: at2amUtc(nextChargeDate),
    })
  })

  it.each([
    // Moving a yearly renewal would give whole years free for one payment.
    { now: '2026-10-03T02:00:00.000Z', nextChargeDate: '2027-02-28' },
    { now: '2024-03-05T02:00:00.000Z', nextChargeDate: '2025-02-28' },
  ])(
    'renews a 29 Feb yearly start on 28 Feb without free years (today $now)',
    ({ now, nextChargeDate }) => {
      const plan = planBillingStart('2024-02-29', 'year', new Date(now))

      expect(plan).toEqual({ kind: 'past', startDate: '2024-02-29', nextChargeDate })
      expect(describeBillingStart(plan, 'year', '$390.00').detail).toBe(
        'From then on, $390.00 is charged automatically on 28 February each year, to the same card, until cancelled.',
      )
    },
  )

  it('never makes a shortened month-end the first renewal, which would move the 31st for good', () => {
    // 30 November is the 31st's renewal that month; Stripe would keep the 30th
    // from then on, so the first renewal is 31 December instead.
    expect(planBillingStart('2026-08-31', 'month', new Date('2026-11-05T00:00:00.000Z'))).toEqual({
      kind: 'past',
      startDate: '2026-08-31',
      nextChargeDate: '2026-12-31',
    })
  })
})

describe('stripeBillingStartParams', () => {
  it('sends nothing extra when billing starts today', () => {
    expect(
      stripeBillingStartParams({ kind: 'today', renewalDate: '2026-10-02' }, 'month', NOW),
    ).toEqual({})
  })

  it('anchors a future start inside the first period with no charge until then', () => {
    expect(
      stripeBillingStartParams({ kind: 'future', startDate: '2026-10-20' }, 'month', NOW),
    ).toEqual({
      billing_cycle_anchor: at2amUtc('2026-10-20'),
      proration_behavior: 'none',
    })
    expect(
      stripeBillingStartParams({ kind: 'future', startDate: '2027-03-01' }, 'year', NOW),
    ).toEqual({
      billing_cycle_anchor: at2amUtc('2027-03-01'),
      proration_behavior: 'none',
    })
  })

  it('uses a free period for a start further away than one billing period', () => {
    expect(
      stripeBillingStartParams({ kind: 'future', startDate: '2026-12-15' }, 'month', NOW),
    ).toEqual({
      trial_end: at2amUtc('2026-12-15'),
    })
  })

  it('starts the plan on the next renewal for a past start, never pro-rata', () => {
    expect(
      stripeBillingStartParams(
        { kind: 'past', startDate: '2026-08-20', nextChargeDate: '2026-10-20' },
        'month',
        NOW,
      ),
    ).toEqual({ trial_end: at2amUtc('2026-10-20') })
    expect(
      stripeBillingStartParams(
        { kind: 'past', startDate: '2026-03-10', nextChargeDate: '2027-03-10' },
        'year',
        NOW,
      ),
    ).toEqual({ trial_end: at2amUtc('2027-03-10') })
  })

  it('keeps every first renewal at least two days out, as Stripe requires', () => {
    // 03:00 UTC on 2 Oct: renewals on the 2nd to 6th fall 23 hours to 5 days away.
    const now = new Date('2026-10-02T03:00:00.000Z')
    for (const day of ['02', '03', '04', '05', '06']) {
      const plan = planBillingStart(`2026-08-${day}`, 'month', now)
      if (plan.kind !== 'past') continue
      const params = stripeBillingStartParams(plan, 'month', now) as { trial_end: number }
      expect(params.trial_end * 1000 - now.getTime()).toBeGreaterThanOrEqual(48 * 3_600_000)
    }
  })
})

describe('describeBillingStart', () => {
  it('tells a past-start client the full price is charged today, not pro-rata', () => {
    expect(
      describeBillingStart(
        { kind: 'past', startDate: '2026-09-14', nextChargeDate: '2027-09-14' },
        'year',
        '$390.00',
      ),
    ).toEqual({
      headline: 'Today you pay $390.00 for hosting up to 14 September 2027.',
      detail:
        'From then on, $390.00 is charged automatically on 14 September each year, to the same card, until cancelled.',
    })
  })

  it('says when a 29 February yearly renewal falls in other years', () => {
    expect(
      describeBillingStart({ kind: 'future', startDate: '2028-02-29' }, 'year', '$390.00').detail,
    ).toBe(
      'After that, $390.00 is charged automatically on 29 February each year (28 February in other years), to the same card, until cancelled.',
    )
  })

  it('charges the same single price when the first renewal had to move a month on', () => {
    expect(
      describeBillingStart(
        { kind: 'past', startDate: '2026-08-03', nextChargeDate: '2026-11-03' },
        'month',
        '$59.00',
      ).headline,
    ).toBe('Today you pay $59.00 for hosting up to 3 November 2026.')
  })

  it('tells a future-start client nothing is charged until the start date', () => {
    expect(
      describeBillingStart({ kind: 'future', startDate: '2026-11-15' }, 'year', '$1,088.55'),
    ).toEqual({
      headline: 'Nothing is charged today. Your first payment of $1,088.55 is on 15 November 2026.',
      detail:
        'After that, $1,088.55 is charged automatically on 15 November each year, to the same card, until cancelled.',
    })
  })

  it('explains a monthly renewal day', () => {
    expect(
      describeBillingStart({ kind: 'today', renewalDate: '2026-10-02' }, 'month', '$101.07').detail,
    ).toBe(
      'It renews automatically on the 2nd of each month, charged to the same card, until cancelled.',
    )
  })

  it('notes short months for a renewal day after the 28th', () => {
    expect(
      describeBillingStart({ kind: 'future', startDate: '2026-10-31' }, 'month', '$101.07').detail,
    ).toContain('on the 31st of each month (or the last day of shorter months)')
  })
})
