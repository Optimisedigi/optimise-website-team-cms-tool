import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Dashboard from '@/components/Dashboard'

vi.mock('@/components/RocketSplash', () => ({ default: () => <div>Loading</div> }))
vi.mock('@/components/SalesFunnelDashboard', () => ({ default: () => null }))
vi.mock('@/components/DripEmailTracker', () => ({ default: () => null }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const MONTH_LABELS = [
  'Oct 25', 'Nov 25', 'Dec 25', 'Jan 26', 'Feb 26', 'Mar 26',
  'Apr 26', 'May 26', 'Jun 26', 'Jul 26', 'Aug 26', 'Sep 26',
]

const gscMonthly = MONTH_LABELS.map((month, i) => ({
  month,
  clicks: 100 + i,
  impressions: 2000 + i * 10,
}))

const dashboardData = {
  gsc: { totalClicks: 1200, totalImpressions: 24000, avgCtr: 5, avgPosition: 12, gscConnected: true },
  gscMonthly,
  activeClients: 1,
  totalRetainer: 0,
  ytdRevenue: 0,
  monthlyRetainerNet: 0,
  annualisedAgencyRevenue: 0,
  oneOffYTD: 0,
  retainerYTD: 0,
  activity: [],
  userRole: 'admin',
  userName: 'Admin',
  proposals: { active: 0, converted: 0, total: 0, conversionRate: 0 },
  usage: { seoAudits: 0, croAudits: 0, keywordSnapshots: 0, competitorAnalyses: 0, contentResearches: 0, mediaUploads: 0 },
  costs: { api: {}, apiTotal: 0, infrastructure: {}, infraTotal: 0, llm: {}, llmTotal: 0, total: 0 },
  costHistory: [],
  month: 'September 2026',
}

const monthlyChannels = {
  ga4Connected: true,
  channels: [
    { channel: 'Organic Search', sessions: 600 },
    { channel: 'Paid Search', sessions: 300 },
    { channel: 'Direct', sessions: 120 },
  ],
  months: MONTH_LABELS.map((label, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    label,
    total: 90,
    sessions: { 'Organic Search': 50, 'Paid Search': 25, Direct: 15 },
  })),
  unassignedSources: [] as {
    source: string
    medium: string
    campaign: string
    sessions: number
  }[],
}

let monthlyChannelsResponse: typeof monthlyChannels = monthlyChannels

afterEach(() => {
  monthlyChannelsResponse = monthlyChannels
})

function responseFor(url: string) {
  if (url === '/api/dashboard') return dashboardData
  if (url === '/api/invoice-statements/pending-summary') return { pendingCount: 0, totalOutstanding: 0 }
  if (url === '/api/xero/scheduled-sends') return []
  if (url === '/api/ga4/monthly-channels') return monthlyChannelsResponse
  if (url.startsWith('/api/ga4/query')) return { ga4Connected: false }
  return null
}

function renderDashboard() {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({ ok: true, json: async () => responseFor(url) })))
  render(<Dashboard />)
}

describe('Dashboard traffic charts', () => {
  it('defaults the GSC chart to 12 months and labels every bar with its month', async () => {
    renderDashboard()

    await screen.findByText('Google Search Console')

    const activePeriod = document.querySelector('.od-seg .od-seg--active')
    expect(activePeriod).toHaveTextContent('12m')

    const bars = document.querySelectorAll('.od-gsc-bars__bar')
    const labels = Array.from(document.querySelectorAll('.od-gsc-bars__label')).map((el) => el.textContent)
    expect(bars).toHaveLength(12)
    expect(labels).toEqual(MONTH_LABELS)
  })

  it('stacks GA4 monthly sessions by channel directly above the Search Console card', async () => {
    renderDashboard()

    const ga4Card = (await screen.findByText('GA4 Sessions by Channel')).closest('.od-box')
    const gscCard = screen.getByText('Google Search Console').closest('.od-box')

    expect(ga4Card?.nextElementSibling).toBe(gscCard)

    await waitFor(() => {
      expect(document.querySelectorAll('.od-chart__bar-group')).toHaveLength(12)
    })
    // One stacked segment per channel, per month.
    expect(document.querySelectorAll('.od-chart__segment')).toHaveLength(36)
    expect(screen.getByText('Organic Search')).toBeInTheDocument()
    expect(screen.getByText('Paid Search')).toBeInTheDocument()
    expect(screen.getByText('Direct')).toBeInTheDocument()
  })

  it('breaks Unassigned sessions down by source, medium and campaign', async () => {
    monthlyChannelsResponse = {
      ...monthlyChannels,
      channels: [...monthlyChannels.channels, { channel: 'Unassigned', sessions: 250 }],
      unassignedSources: [
        { source: 'newsletter', medium: 'paid', campaign: 'spring-promo', sessions: 140 },
        { source: 'bing', medium: '(not set)', campaign: '(not set)', sessions: 60 },
      ],
    }
    renderDashboard()

    await screen.findByText('GA4 Sessions by Channel')

    const summary = await screen.findByText(/What.s in .Unassigned/)
    expect(summary).toHaveTextContent('250')

    const rows = document.querySelectorAll('.od-unassigned__table tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('newsletter')
    expect(rows[0]).toHaveTextContent('paid')
    expect(rows[0]).toHaveTextContent('spring-promo')
    expect(rows[0]).toHaveTextContent('140')

    // 250 total vs 200 listed — the remainder must be called out, not silently lost.
    expect(screen.getByText(/50 further Unassigned sessions/)).toBeInTheDocument()
  })

  it('hides the Unassigned breakdown when the property has none', async () => {
    renderDashboard()

    await screen.findByText('GA4 Sessions by Channel')
    await waitFor(() => {
      expect(document.querySelectorAll('.od-chart__bar-group')).toHaveLength(12)
    })

    expect(document.querySelector('.od-unassigned')).toBeNull()
  })
})
