import { describe, expect, it } from 'vitest'
import { calculateWeightedScore, scorecard, type AuditCategoryScorecard } from '@/lib/google-ads-audit-snapshots/scoring'

const category = (score: number | null, weight: number): AuditCategoryScorecard => ({ id: 'website', label: 'Website', weight, score, maximum: 4, status: score === null ? 'insufficient_evidence' : 'scored', checks: [], evidenceSummary: '' })
describe('audit scorecard policy', () => {
  it('excludes unknown categories rather than awarding a positive fallback', () => {
    expect(calculateWeightedScore([category(4, 10), category(null, 90)])).toMatchObject({ total: 100, weightedDenominator: 10 })
    expect(scorecard([category(null, 10)]).total).toBeNull()
  })
  it('uses only category scores and configured weights', () => {
    expect(calculateWeightedScore([category(4, 25), category(2, 75)])).toMatchObject({ total: 63, weightedDenominator: 100 })
  })
})
