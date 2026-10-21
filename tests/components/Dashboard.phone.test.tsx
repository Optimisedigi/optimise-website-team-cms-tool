import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Dashboard from '@/components/Dashboard'

vi.mock('@/components/RocketSplash', () => ({ default: () => <div>Loading</div> }))
vi.mock('@/components/SalesFunnelDashboard', () => ({ default: () => null }))
vi.mock('@/components/DripEmailTracker', () => ({ default: () => null }))
vi.mock('@/components/ClientUnreadMailCard', () => ({ default: () => <div data-testid="unread-mail" /> }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const activity = Array.from({ length: 9 }, (_, i) => ({
  id: i + 1,
  type: 'client_created',
  title: `Activity ${i + 1}`,
  createdAt: '2026-10-01T00:00:00.000Z',
}))

const dashboardData = {
  gsc: { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0, gscConnected: false },
  gscMonthly: [],
  activeClients: 9,
  totalRetainer: 0,
  ytdRevenue: 0,
  monthlyRetainerNet: 0,
  annualisedAgencyRevenue: 0,
  oneOffYTD: 0,
  retainerYTD: 0,
  activity,
  userRole: 'admin',
  userName: 'Peter',
  proposals: { active: 0, converted: 0, total: 0, conversionRate: 0 },
  usage: { seoAudits: 0, croAudits: 0, keywordSnapshots: 0, competitorAnalyses: 0, contentResearches: 0, mediaUploads: 0 },
  costs: { api: {}, apiTotal: 0, infrastructure: {}, infraTotal: 0, llm: {}, llmTotal: 0, total: 0 },
  mtdCosts: 0,
  costHistory: [],
  month: 'October 2026',
}

function responseFor(url: string) {
  if (url === '/api/dashboard') return dashboardData
  if (url.startsWith('/api/agent-approval-queue')) return { totalDocs: 3 }
  if (url === '/api/invoice-statements/pending-summary') return { pendingCount: 0, totalOutstanding: 0 }
  if (url === '/api/xero/scheduled-sends') return []
  return null
}

function renderOn(phone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: phone && /max-width/.test(query),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({ ok: true, json: async () => responseFor(url) })))
  return render(<Dashboard />)
}

describe('Dashboard on phones', () => {
  it('leads with Action Items (with the approvals count) and unread mail above the KPIs', async () => {
    const { container } = renderOn(true)
    await screen.findByText('Good morning, Peter')
    const priority = container.querySelector('.od-dash__priority') as HTMLElement
    expect(priority).not.toBeNull()
    expect(within(priority).getByText('Action Items')).toBeTruthy()
    expect(within(priority).getByTestId('unread-mail')).toBeTruthy()
    await waitFor(() => expect(within(priority).getByText('3 approvals waiting')).toBeTruthy())
    // Rendered once, before the KPI strip.
    expect(screen.getAllByTestId('unread-mail')).toHaveLength(1)
    const kpis = container.querySelector('.od-kpi-strip') as HTMLElement
    expect(priority.compareDocumentPosition(kpis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'More metrics' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('shows five activity entries with See all', async () => {
    renderOn(true)
    await screen.findByText('Activity 1')
    expect(screen.getByText('Activity 5')).toBeTruthy()
    expect(screen.queryByText('Activity 6')).toBeNull()
    expect(screen.getByText('See all')).toBeTruthy()
  })

  it('keeps the desktop layout unchanged', async () => {
    const { container } = renderOn(false)
    await screen.findByText('Activity 9')
    expect(container.querySelector('.od-dash__priority')).toBeNull()
  })
})
