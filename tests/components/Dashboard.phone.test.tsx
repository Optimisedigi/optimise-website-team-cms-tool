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
  salesTarget = undefined
})

const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

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

let salesTarget: { target: number } | undefined

function responseFor(url: string) {
  if (url === '/api/dashboard') return { ...dashboardData, salesTarget }
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
  it('leads with unread mail, then KPIs, the Yearly Sales Target and Action Items', async () => {
    salesTarget = { target: 500000 }
    const { container } = renderOn(true)
    await screen.findByText('Good morning, Peter')
    const mail = container.querySelector('.od-dash__priority--mail') as HTMLElement
    const actions = container.querySelector('.od-dash__priority--actions') as HTMLElement
    expect(within(mail).getByTestId('unread-mail')).toBeTruthy()
    expect(within(actions).getByText('Action Items')).toBeTruthy()
    await waitFor(() => expect(within(actions).getByText('3 approvals waiting')).toBeTruthy())
    // Each rendered once on phones.
    expect(screen.getAllByTestId('unread-mail')).toHaveLength(1)
    expect(screen.getAllByText('Action Items')).toHaveLength(1)
    // Mail is the first section under the greeting.
    const sections = Array.from(container.querySelector('.od-dash')?.children ?? [])
    expect(sections[0]?.classList.contains('od-dash__header')).toBe(true)
    expect(sections[1]).toBe(mail)
    const kpis = container.querySelector('.od-kpi-strip') as HTMLElement
    const target = screen.getByText('Yearly Sales Target')
    expect(follows(mail, kpis)).toBe(true)
    expect(follows(kpis, target)).toBe(true)
    expect(follows(target, actions)).toBe(true)
    expect(screen.getByRole('button', { name: 'More metrics' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('puts Action Items straight after the KPIs when no sales target is set', async () => {
    const { container } = renderOn(true)
    await screen.findByText('Good morning, Peter')
    expect(screen.queryByText('Yearly Sales Target')).toBeNull()
    const actions = container.querySelector('.od-dash__priority--actions') as HTMLElement
    const kpis = container.querySelector('.od-kpi-strip') as HTMLElement
    expect(follows(kpis, actions)).toBe(true)
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
    expect(screen.getAllByTestId('unread-mail')).toHaveLength(1)
    expect(screen.getAllByText('Action Items')).toHaveLength(1)
  })
})
