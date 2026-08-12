import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  growthToolsGet: vi.fn(),
}))

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ find: mocks.find })) }))
vi.mock('@/payload.config', () => ({ default: {} }))
vi.mock('@/lib/agents/optimate-google-ads/tools/_growth-tools', () => ({
  growthToolsGet: mocks.growthToolsGet,
  ensureCustomerId: (id: unknown) => String(id),
  parseConversionActions: () => [],
}))
vi.mock('@/lib/agents/optimate-google-ads/tools/_portfolio-accounts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agents/optimate-google-ads/tools/_portfolio-accounts')>('@/lib/agents/optimate-google-ads/tools/_portfolio-accounts')
  return { ...actual, loadPortfolioAccounts: vi.fn() }
})

import { getDashboardEmailComponents } from '@/lib/agents/optimate-google-ads/tools/get-dashboard-email-components'

const ctx = {
  agentName: 'optimate-google-ads', agentRunId: 'test', log: vi.fn(),
  context: { customerId: '123', clientId: 7, clientSlug: 'client' },
}

describe('get_dashboard_email_components', () => {
  beforeEach(() => {
    mocks.find.mockReset()
    mocks.growthToolsGet.mockReset()
  })

  it('does not call Growth Tools when cache-only relevancy history is missing', async () => {
    mocks.find.mockResolvedValue({ docs: [] })
    const args = getDashboardEmailComponents.validate!({ components: ['keyword_relevancy'], months: 2, relevancyMode: 'cache_only' })
    const result = await getDashboardEmailComponents.execute(args, ctx)
    expect(result.ok).toBe(true)
    expect(mocks.growthToolsGet).not.toHaveBeenCalled()
    expect((result.data as { warnings: string[] }).warnings[0]).toMatch(/cached history is incomplete/)
  })

  it('retains read-through cache warming for normal dashboard rendering', async () => {
    mocks.find.mockResolvedValue({ docs: [] })
    const args = getDashboardEmailComponents.validate!({ components: ['keyword_relevancy'], months: 2 })
    const result = await getDashboardEmailComponents.execute(args, ctx)
    expect(result.ok).toBe(true)
    // Cache-only reads the cache collection once; normal mode also loads NKLs
    // before deciding whether a Growth Tools refresh is required.
    expect(mocks.find).toHaveBeenCalledTimes(2)
  })

  it('uses bounded ordered concurrency for CPA months', async () => {
    let active = 0
    let peak = 0
    mocks.growthToolsGet.mockImplementation(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active -= 1
      return { ok: true, data: { metrics: [{ cost: 100, conversions: 2 }] } }
    })
    const args = getDashboardEmailComponents.validate!({ components: ['cpa_trend'], months: 5, endMonth: '2026-05' })
    const result = await getDashboardEmailComponents.execute(args, ctx)
    expect(result.ok).toBe(true)
    expect(peak).toBeLessThanOrEqual(3)
    expect((result.data as { componentData: { cpaTrend: Array<{ label: string }> } }).componentData.cpaTrend.map((row) => row.label)).toEqual(['January 2026', 'February 2026', 'March 2026', 'April 2026', 'May 2026'])
  })
})
