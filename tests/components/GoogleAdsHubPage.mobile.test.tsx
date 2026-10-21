import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('@/components/RocketSplash', () => ({ default: () => <div>Loading</div> }))

import GoogleAdsHubPage from '@/components/GoogleAdsHubPage'

const client = {
  id: 7,
  name: 'Acme Plumbing',
  slug: 'acme-plumbing',
  googleAdsCustomerId: '123-456-7890',
  createdAt: '2026-01-02T00:00:00.000Z',
  latestAudit: { id: 1, overallScore: 82, auditStatus: 'completed', createdAt: '2026-09-01T00:00:00.000Z' },
  scoreTrajectory: { latest: 82, trend: 'up', change: 4 },
  automation: { dashboardEnabled: true, weeklyReportEnabled: false, negativeSweepEnabled: true, reauditEnabled: false },
}

describe('GoogleAdsHubPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [client] }))
  })

  it('shows the approved intro copy', async () => {
    render(<GoogleAdsHubPage />)
    expect(
      await screen.findByText('Manage Google Ads across all clients. Tap a client for audits, negative keywords, deep dives, budgets and automation.'),
    ).toBeInTheDocument()
  })

  it('renders phone client cards and marks desktop-only metric boxes', async () => {
    const { container } = render(<GoogleAdsHubPage />)
    const cards = await screen.findByRole('list', { name: 'Google Ads clients' })
    const card = within(cards).getByRole('link')
    expect(card).toHaveTextContent('Acme Plumbing')
    expect(card).toHaveTextContent('acme-plumbing')
    expect(card).toHaveTextContent('123-456-7890')
    expect(card).toHaveTextContent('82/100')
    expect(card).toHaveTextContent(/Last audit01 Sept? 2026/)
    expect(card).toHaveTextContent('2 / 4')
    const desktopOnly = Array.from(container.querySelectorAll('.od-gads-hub__stat--desktop')).map((el) => el.textContent)
    expect(desktopOnly).toEqual([expect.stringContaining('Customer ID set'), expect.stringContaining('Audited')])
  })
})
