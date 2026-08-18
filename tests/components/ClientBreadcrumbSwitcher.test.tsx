import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import ClientBreadcrumbSwitcher from '@/components/ClientBreadcrumbSwitcher'

const clients = [
  { id: 10, name: 'Zeta Corp' },
  { id: 20, name: 'Alpha Ltd' },
  { id: 30, name: 'Mega Inc' },
]

const originalFetch = globalThis.fetch

describe('ClientBreadcrumbSwitcher', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docs: clients }),
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    document.body.replaceChildren()
  })

  function mountBreadcrumb() {
    const breadcrumb = document.createElement('nav')
    breadcrumb.className = 'step-nav'
    breadcrumb.innerHTML = '<span class="step-nav__last">Zeta Corp</span>'
    document.body.append(breadcrumb)
    return breadcrumb
  }

  it('fetches clients and populates a sorted select in the breadcrumb', async () => {
    const breadcrumb = mountBreadcrumb()

    render(
      <ClientBreadcrumbSwitcher currentClientId={10} currentClientName="Zeta Corp" />,
    )

    await waitFor(() => {
      expect(
        breadcrumb.querySelector<HTMLSelectElement>('[aria-label="Switch client"]'),
      ).not.toBeNull()
    })

    const select = breadcrumb.querySelector<HTMLSelectElement>('[aria-label="Switch client"]')!
    // Current option sits first, then remaining clients sorted alphabetically
    expect([...select.options].map((option) => option.text)).toEqual([
      'Zeta Corp',
      'Alpha Ltd',
      'Mega Inc',
    ])
  })

  it('sets the current client as selected', async () => {
    mountBreadcrumb()

    render(
      <ClientBreadcrumbSwitcher currentClientId={30} currentClientName="Mega Inc" />,
    )

    await waitFor(() => {
      const select = document.querySelector<HTMLSelectElement>('[aria-label="Switch client"]')!
      expect(select.value).toBe('30')
    })
  })

  it('navigates to the client edit page on change', async () => {
    // jsdom makes location.assign non-configurable; replace the whole object
    const original = window.location
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...original, assign: assignSpy },
      writable: true,
      configurable: true,
    })

    const breadcrumb = mountBreadcrumb()

    render(
      <ClientBreadcrumbSwitcher currentClientId={10} currentClientName="Zeta Corp" />,
    )

    await waitFor(() => {
      expect(
        breadcrumb.querySelector<HTMLSelectElement>('[aria-label="Switch client"]'),
      ).not.toBeNull()
    })

    const select = breadcrumb.querySelector<HTMLSelectElement>('[aria-label="Switch client"]')!
    select.value = '20'
    select.dispatchEvent(new Event('change', { bubbles: true }))

    expect(assignSpy).toHaveBeenCalledWith('/admin/collections/clients/20')

    Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
  })

  it('does not touch the breadcrumb when no clients are returned', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docs: [] }),
    })

    const breadcrumb = mountBreadcrumb()
    const originalContent = breadcrumb.querySelector('.step-nav__last')!.textContent

    render(
      <ClientBreadcrumbSwitcher currentClientId={10} currentClientName="Zeta Corp" />,
    )

    // Give the effect time to run
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(breadcrumb.querySelector('select')).toBeNull()
    expect(breadcrumb.querySelector('.step-nav__last')!.textContent).toBe(originalContent)
  })

  it('cleans up the breadcrumb on unmount', async () => {
    const breadcrumb = mountBreadcrumb()

    const { unmount } = render(
      <ClientBreadcrumbSwitcher currentClientId={10} currentClientName="Zeta Corp" />,
    )

    await waitFor(() => {
      expect(breadcrumb.querySelector('select')).not.toBeNull()
    })

    unmount()

    expect(breadcrumb.querySelector('select')).toBeNull()
    expect(breadcrumb.querySelector('.step-nav__last')!.textContent).toBe('Zeta Corp')
  })
})
