import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ClientPulsePage from '@/components/ClientPulsePage'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
import type { ClientPulseSummary } from '@/lib/client-pulse'

const summary = {
  client: {
    id: 3,
    name: 'Berendsen Fluid Power',
    slug: 'berendsen',
    logoThumbUrl: null,
    services: ['google_ads', 'seo'],
    accountManagers: [],
    priority: 'normal',
    hasGoogleAds: true,
  },
  dashboardMetrics: [
    {
      metric: 'google_ads_cost_per_lead',
      label: 'CPL',
      value: 52,
      comparisonValue: 56,
      deltaPercent: -8,
      displayValue: '$52',
      source: 'Google Ads',
      invertedDelta: true,
    },
    {
      metric: 'ga4_key_events',
      label: 'Key events',
      value: 134,
      comparisonValue: 120,
      deltaPercent: 12,
      displayValue: '134',
      source: 'GA4',
      invertedDelta: false,
    },
    {
      metric: 'google_ads_spend',
      label: 'Spend',
      value: 7420,
      comparisonValue: 7650,
      deltaPercent: -3,
      displayValue: '$7,420',
      source: 'Google Ads',
      invertedDelta: false,
    },
  ],
  ga4Sessions: [
    { month: '2026-06', sessions: 10000 },
    { month: '2026-07', sessions: 11100 },
    { month: '2026-08', sessions: 11240 },
  ],
  ga4SessionsMomPercent: 1,
  scoreHistory: [
    { date: '2026-07-12', score: 74, status: 'watch', label: 'Watch' },
    { date: '2026-08-12', score: 78, status: 'watch', label: 'Watch' },
  ],
  budgetPacing: {
    monthlyBudget: 11000,
    mtdSpend: 7420,
    actualBudgetPercent: 67,
    expectedBudgetPercent: 65,
    deltaPercentPoints: 2,
  },
  scores: { overall: { score: 78, status: 'watch', label: 'Watch', reasons: [] } },
  reasons: ['Steady month. Cost per lead improving.'],
  lastMeaningfulActivityAt: '2026-08-11T00:00:00.000Z',
} as unknown as ClientPulseSummary

describe('ClientPulsePage', () => {
  it('shows GA4 sessions and service labels in the card', () => {
    render(<ClientPulsePage initialData={[summary]} />)
    expect(screen.getByRole('heading', { name: 'GA4 sessions' })).toBeInTheDocument()
    expect(screen.getByText('11,240')).toBeInTheDocument()
    expect(screen.getByText('↑ 1% MoM')).toBeInTheDocument()
    expect(screen.getByText('Google Ads')).toBeInTheDocument()
    expect(screen.getByText('SEO')).toBeInTheDocument()
  })

  it('links the client name and omits the removed action controls', () => {
    render(<ClientPulsePage initialData={[summary]} />)
    expect(screen.getByRole('link', { name: 'Berendsen Fluid Power' })).toHaveAttribute(
      'href',
      '/admin/collections/clients/3',
    )
    expect(screen.queryByText('Open client')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move down' })).not.toBeInTheDocument()
  })

  it('renders the reference Detail control and expands inline details', () => {
    render(<ClientPulsePage initialData={[summary]} />)
    const detail = screen.getByRole('button', { name: 'Detail' })
    expect(detail).toHaveClass('client-pulse-details-toggle')
    expect(detail).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(detail)
    expect(screen.getByRole('button', { name: 'Hide detail' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('heading', { name: 'Why this pulse' })).toBeInTheDocument()
  })

  it('renders the pulse history sparkline beside the score', () => {
    render(<ClientPulsePage initialData={[summary]} />)
    const chart = screen.getByRole('img', { name: 'Pulse history from 74 to 78' })
    const score = screen.getByLabelText('Pulse score 78')
    expect(chart).toHaveClass('client-pulse-sparkline')
    expect(score).toHaveClass('client-pulse-score-ring')
    expect(within(score).getByText('78')).toBeInTheDocument()
    expect(chart.closest('.client-pulse-score-group')).toContainElement(score)
  })

  it('defaults to four cards per row and lets the user change the density', () => {
    render(<ClientPulsePage initialData={[summary]} />)
    const grid = screen.getByRole('list')
    expect(grid).toHaveAttribute('data-columns', '4')

    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(grid).toHaveAttribute('data-columns', '3')
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows client tenure and quarterly audit timing', () => {
    const withTenure = {
      ...summary,
      client: {
        ...summary.client,
        startDate: '2025-03-18T00:00:00.000Z',
        monthsActive: 18,
      },
    }
    render(<ClientPulsePage initialData={[withTenure]} />)

    expect(screen.getByText('18 months with us')).toBeInTheDocument()
    expect(screen.getByText('Quarterly audit due now')).toBeInTheDocument()
    const timeline = screen.getByRole('img', { name: /Current annual service cycle/ })
    expect(timeline.children[5]).toHaveClass('is-current')
    expect(timeline.children[6]).not.toHaveClass('is-current')
  })

  it('offers a collapsed multi-select for active clients not already shown', () => {
    render(
      <ClientPulsePage
        initialData={[summary]}
        availableClients={[
          { id: 5, name: 'Acme Australia' },
          { id: 6, name: 'Northwind' },
        ]}
      />,
    )

    const picker = screen.getByText('Add clients').closest('details')
    expect(picker).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('Add clients'))
    expect(picker).toHaveAttribute('open')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Acme Australia' }))
    expect(screen.getByRole('button', { name: 'Add selected (1)' })).toBeEnabled()
  })
})
