import { describe, expect, it } from 'vitest'
import { buildWeeklyEmailSummary } from '@/lib/agents/optimate-google-ads/tools/_weekly-email-summary'
import { buildComponentInsightSentence } from '@/lib/agents/optimate-google-ads/tools/_email-component-insights'
import { buildMonthlyEmailSummary } from '@/lib/agents/optimate-google-ads/tools/_monthly-email-summary'
import { copySeed, seedCustomerId } from '@/lib/agents/optimate-google-ads/tools/_email-copy-variants'
import { __createMonthlyBudgetGmailDraftInternals } from '@/lib/agents/optimate-google-ads/tools/create-monthly-budget-gmail-draft'

const rows = [
  { label: 'Jul 27 - Aug 2', totals: { spend: 1045, conversions: 25 } },
  { label: 'Aug 3 - Aug 9', totals: { spend: 1596, conversions: 28 } },
] as never

const dashboardData = {
  keywordRelevancyTrend: [
    { label: 'July 2026', value: 98.9 },
    { label: 'August 2026', value: 100 },
  ],
  cpaTrend: [
    { label: 'July 2026', value: 43.04 },
    { label: 'August 2026', value: 58.11 },
  ],
}

const budget = {
  monthlyBudget: 5000,
  totalSpend: 2084,
  targetSpendToDate: 1600,
  pacingDifference: 484,
}

const components = ['keyword_relevancy', 'cpa_trend'] as never

describe('weekly email top-line summary', () => {
  it('renders performance, component insight, and pacing sentences', () => {
    const summary = buildWeeklyEmailSummary({ rows, components, dashboardData, budget, seed: 1 })

    // Performance sentence: latest completed week.
    expect(summary).toMatch(/Aug 3 - Aug 9/)
    expect(summary).toMatch(/28 conversions|conversions to 28|to 28 conversions|at 28 conversions/)
    // Component insight, matching the monthly email's wording.
    expect(summary).toMatch(/[Ss]earch relevance/)
    expect(summary).toMatch(/CPA trend/)
    // Budget pacing clause.
    expect(summary).toMatch(/target/)
  })

  describe('week-on-week comparison', () => {
    it('compares the latest week against the prior completed week', () => {
      // 25 -> 28 conversions, so the sentence must cite both weeks' figures.
      const summary = buildWeeklyEmailSummary({ rows, components, dashboardData, seed: 3 })
      expect(summary).toMatch(/\b28\b/)
      expect(summary).toMatch(/\b25\b/)
    })

    it('reports improving volume and efficiency together', () => {
      const improving = [
        { label: 'Jul 27 - Aug 2', totals: { spend: 1250, conversions: 20 } },
        { label: 'Aug 3 - Aug 9', totals: { spend: 1000, conversions: 25 } },
      ] as never
      const summary = buildWeeklyEmailSummary({ rows: improving, components, seed: 2 })
      expect(summary).toMatch(/\b25\b/)
      expect(summary).toMatch(/\b20\b/)
      expect(summary).toMatch(/improv|strong|productive|delivered more for less|both fronts/i)
    })

    it('reports softening volume without inventing an improvement', () => {
      const declining = [
        { label: 'Jul 27 - Aug 2', totals: { spend: 1000, conversions: 30 } },
        { label: 'Aug 3 - Aug 9', totals: { spend: 1200, conversions: 12 } },
      ] as never
      const summary = buildWeeklyEmailSummary({ rows: declining, components, seed: 2 })
      expect(summary).toMatch(/\b12\b/)
      expect(summary).toMatch(/\b30\b/)
      expect(summary).toMatch(/eased|softened|behind|slipped|below|down from|gave back|lower/i)
    })

    it('falls back to a single-week sentence when there is no prior week', () => {
      const single = [{ label: 'Aug 3 - Aug 9', totals: { spend: 1596, conversions: 28 } }] as never
      const summary = buildWeeklyEmailSummary({ rows: single, components, seed: 2 })
      expect(summary).toMatch(/Aug 3 - Aug 9/)
      expect(summary).toMatch(/28/)
    })
  })

  it('gives every account in a batch noticeably different wording', () => {
    // Same numbers for all seven accounts: only the copy may differ.
    const batch = [
      'Malcolm Thompson Pumps',
      'Berendsen',
      'Hydraulic Services Co',
      'Pump Solutions Australia',
      'Northline Industrial',
      'Coastal Water Systems',
      'Vertex Engineering',
    ].map((name) =>
      buildWeeklyEmailSummary({
        rows,
        components,
        dashboardData,
        budget,
        seed: copySeed(name, '123', '2026-08-09', 4),
      }),
    )

    expect(new Set(batch).size).toBe(batch.length)

    // Beyond being non-identical, no two summaries may share their opening clause.
    const openings = batch.map((summary) => summary.split(',')[0])
    expect(new Set(openings).size).toBeGreaterThan(batch.length / 2)
  })

  it('gives each account its own wording while staying reproducible per seed', () => {
    const summaries = ['Malcolm Thompson Pumps', 'Berendsen', 'Acme Pumps'].map((name) =>
      buildWeeklyEmailSummary({
        rows,
        components,
        dashboardData,
        budget,
        seed: copySeed(name, '123', '2026-08-09', 4),
      }),
    )

    // Same underlying data, but the copy must not be identical across accounts.
    expect(new Set(summaries).size).toBeGreaterThan(1)

    // Re-running the same seed reproduces the same sentence.
    const again = buildWeeklyEmailSummary({
      rows,
      components,
      dashboardData,
      budget,
      seed: copySeed('Berendsen', '123', '2026-08-09', 4),
    })
    expect(again).toBe(summaries[1])
  })

  it('produces identical copy for one account regardless of chat surface', () => {
    // The individual chat context carries an unformatted customer id while
    // portfolio account records carry a dashed one. Both must seed the same, or
    // the same account reads differently depending on where it was drafted.
    const individualSeed = copySeed(
      'Malcolm Thompson Pumps',
      seedCustomerId('1840834992'),
      '2026-08-09',
      4,
    )
    const portfolioSeed = copySeed(
      'Malcolm Thompson Pumps',
      seedCustomerId('184-083-4992'),
      '2026-08-09',
      4,
    )
    expect(portfolioSeed).toBe(individualSeed)

    const args = { rows, components, dashboardData, budget }
    expect(buildWeeklyEmailSummary({ ...args, seed: portfolioSeed })).toBe(
      buildWeeklyEmailSummary({ ...args, seed: individualSeed }),
    )
  })

  it('omits the pacing clause when there is no monthly budget', () => {
    const summary = buildWeeklyEmailSummary({ rows, components, dashboardData, seed: 1 })
    expect(summary).not.toMatch(/pacing|budget/i)
  })

  it('still summarises when component data is missing', () => {
    const summary = buildWeeklyEmailSummary({ rows, components, seed: 1 })
    expect(summary).toMatch(/Aug 3 - Aug 9/)
    expect(summary).toMatch(/trend data/i)
  })

  it('uses the same insight generator as the monthly email', () => {
    // Guards the extraction: monthly and weekly must describe identical
    // component data with identical words for the same seed.
    const monthlySummary = __createMonthlyBudgetGmailDraftInternals.buildSummary(
      [{ label: 'July 2026', totals: { spend: 5114, conversions: 88 }, metrics: { cpa: 58 } }] as never,
      components,
      dashboardData,
      7,
    )
    const insight = buildComponentInsightSentence(components, dashboardData, 7)

    expect(insight).toMatch(/[Ss]earch relevance improved to 100% from 98.9%/)
    expect(monthlySummary).toContain(insight)
    expect(buildWeeklyEmailSummary({ rows, components, dashboardData, seed: 7 })).toContain(insight)
  })
})

describe('monthly email top-line summary', () => {
  const monthlyRows = [
    { label: 'June 2026', totals: { spend: 1000, conversions: 4 }, metrics: { cpa: 250 } },
    { label: 'July 2026', totals: { spend: 1200, conversions: 6 }, metrics: { cpa: 200 } },
  ]

  it('compares the latest month against the prior completed month', () => {
    const summary = buildMonthlyEmailSummary({ rows: monthlyRows, components, seed: 1 })
    expect(summary).toMatch(/July 2026/)
    expect(summary).toMatch(/\b6\b/)
    expect(summary).toMatch(/\b4\b/)
    expect(summary).toMatch(/\$200/)
    expect(summary).toMatch(/\$250/)
  })

  it('falls back to a single-month sentence when there is no prior month', () => {
    const summary = buildMonthlyEmailSummary({
      rows: [monthlyRows[1]!],
      components,
      seed: 1,
    })
    expect(summary).toMatch(/July 2026/)
    expect(summary).toMatch(/\b6\b/)
    expect(summary).not.toMatch(/\$250/)
  })

  it('gives every account in a batch different wording', () => {
    const batch = [
      'Malcolm Thompson Pumps',
      'Berendsen',
      'Hydraulic Services Co',
      'Northline Industrial',
      'Coastal Water Systems',
    ].map((name) =>
      buildMonthlyEmailSummary({
        rows: monthlyRows,
        components,
        dashboardData,
        seed: copySeed(name, seedCustomerId('184-083-4992'), 'monthly', '2026-07'),
      }),
    )
    expect(new Set(batch).size).toBe(batch.length)
  })

  it('produces identical copy for one account regardless of chat surface', () => {
    const individual = copySeed('Berendsen', seedCustomerId('1840834992'), 'monthly', '2026-07')
    const portfolio = copySeed('Berendsen', seedCustomerId('184-083-4992'), 'monthly', '2026-07')
    expect(portfolio).toBe(individual)
    expect(buildMonthlyEmailSummary({ rows: monthlyRows, components, seed: portfolio })).toBe(
      buildMonthlyEmailSummary({ rows: monthlyRows, components, seed: individual }),
    )
  })
})
