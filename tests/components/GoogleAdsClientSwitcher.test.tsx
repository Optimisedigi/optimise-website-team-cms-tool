import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import GoogleAdsClientSwitcher, {
  destinationFor,
  type GoogleAdsClient,
} from '@/components/GoogleAdsClientSwitcher'

const clients: GoogleAdsClient[] = [
  {
    id: 11,
    name: 'Alpha Ads',
    googleAdsCustomerId: '111-111-1111',
    latestAudit: { id: 101 },
  },
  {
    id: 22,
    name: 'Beta New Account',
    googleAdsCustomerId: null,
    latestAudit: null,
  },
  {
    id: 33,
    name: 'Gamma Ads',
    googleAdsCustomerId: '333-333-3333',
    latestAudit: { id: 303 },
  },
]

const originalFetch = globalThis.fetch

describe('GoogleAdsClientSwitcher', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(clients),
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    document.body.replaceChildren()
  })

  it('lists every Google Ads hub client in the client-tab switcher', async () => {
    render(
      <GoogleAdsClientSwitcher
        currentClientId={11}
        currentClientName="Alpha Ads"
        placement="header"
      />,
    )

    const select = await screen.findByRole('combobox', { name: 'Switch Google Ads client' })
    expect(select).toHaveTextContent('Alpha Ads')
    expect(select).toHaveTextContent('Beta New Account')
    expect(select).toHaveTextContent('Gamma Ads')
  })

  it('replaces the current breadcrumb with the complete client switcher', async () => {
    const breadcrumb = document.createElement('nav')
    breadcrumb.className = 'step-nav'
    breadcrumb.innerHTML = '<span class="step-nav__last">Alpha Ads</span>'
    document.body.append(breadcrumb)

    render(
      <GoogleAdsClientSwitcher
        currentClientId={11}
        currentClientName="Alpha Ads"
        placement="breadcrumb"
      />,
    )

    await waitFor(() => {
      expect(
        breadcrumb.querySelector<HTMLSelectElement>('[aria-label="Switch Google Ads client"]'),
      ).not.toBeNull()
    })

    const select = breadcrumb.querySelector<HTMLSelectElement>(
      '[aria-label="Switch Google Ads client"]',
    )!
    expect([...select.options].map((option) => option.text)).toEqual([
      'Alpha Ads',
      'Beta New Account',
      'Gamma Ads',
    ])
  })

  it('builds audit and Google Ads tab destinations for selected clients', () => {
    expect(destinationFor(clients[2])).toBe('/admin/collections/google-ads-audits/303')
    expect(destinationFor(clients[1])).toBe('/admin/collections/clients/22#tab-5')
  })
})
