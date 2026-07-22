import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Dashboard, { activityDescription, activityHref, activityIcon } from '@/components/Dashboard'

vi.mock('@/components/RocketSplash', () => ({ default: () => <div>Loading</div> }))
vi.mock('@/components/SalesFunnelDashboard', () => ({ default: () => null }))
vi.mock('@/components/DripEmailTracker', () => ({ default: () => null }))

afterEach(() => {
  vi.restoreAllMocks()
})

const dashboardData = {
  gsc: null,
  gscMonthly: [],
  activeClients: 1,
  totalRetainer: 0,
  ytdRevenue: 0,
  monthlyRetainerNet: 0,
  annualisedAgencyRevenue: 0,
  oneOffYTD: 0,
  retainerYTD: 0,
  activity: [
    {
      id: 'match-type-activity',
      type: 'match_type_violation_sync',
      title: 'Match type violations sync: 3 violations found',
      description: 'Client 6: 3 violations for "1234567890"',
      createdAt: '2026-07-22T09:00:00.000Z',
      client: { name: 'Acme Plumbing' },
    },
  ],
  userRole: 'admin',
  userName: 'Admin',
  proposals: { active: 0, converted: 0, total: 0, conversionRate: 0 },
  usage: { seoAudits: 0, croAudits: 0, keywordSnapshots: 0, competitorAnalyses: 0, contentResearches: 0, mediaUploads: 0 },
  costs: { api: {}, apiTotal: 0, infrastructure: {}, infraTotal: 0, llm: {}, llmTotal: 0, total: 0 },
  costHistory: [],
  month: 'July 2026',
}

function responseFor(url: string) {
  if (url === '/api/dashboard') return dashboardData
  if (url === '/api/invoice-statements/pending-summary') return { pendingCount: 2, totalOutstanding: 3000 }
  if (url === '/api/xero/scheduled-sends') return []
  if (url === '/api/ga4/query?period=12m') return { ga4Connected: false }
  return null
}

describe('Dashboard activity panel', () => {
  it('places pending statements immediately after Action Items in the right column', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({ ok: true, json: async () => responseFor(url) })))

    render(<Dashboard />)

    await screen.findByText('Pending statements')
    const sidePanel = document.querySelector('.od-dash__side')
    const actionItems = screen.getByText('Action Items').closest('.od-box')
    const pendingStatements = screen.getByText('Pending statements').closest('a')

    expect(sidePanel).toContainElement(actionItems)
    expect(actionItems?.nextElementSibling).toBe(pendingStatements)
    expect(screen.getByText('≠')).toBeInTheDocument()
    expect(screen.getByText('Acme Plumbing: 3 violations for "1234567890"')).toBeInTheDocument()
    expect(screen.queryByText(/Client 6:/)).not.toBeInTheDocument()
  })

  it('resolves legacy match-type activity client IDs to names and uses the mismatch icon', () => {
    const entry = dashboardData.activity[0]

    expect(activityDescription(entry)).toBe('Acme Plumbing: 3 violations for "1234567890"')
    expect(activityIcon(entry.type)).toBe('≠')
  })

  it('opens linked activities at their source, with the activity log as a safe fallback', () => {
    expect(activityHref({ ...dashboardData.activity[0], targetUrl: '/admin/collections/blog-posts/42' }))
      .toBe('/admin/collections/blog-posts/42')
    expect(activityHref(dashboardData.activity[0])).toBe('/admin/collections/activity-log/match-type-activity')
    expect(activityHref({ ...dashboardData.activity[0], targetUrl: 'https://untrusted.example' }))
      .toBe('/admin/collections/activity-log/match-type-activity')
  })
})
