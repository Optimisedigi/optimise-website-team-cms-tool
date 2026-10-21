import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import XeroInvoicesPage from '@/components/XeroInvoicesPage'

describe('XeroInvoicesPage error state', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows a plain message with Retry and hides the technical detail behind Details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))
    render(<XeroInvoicesPage />)

    expect(await screen.findByText('Invoices couldn’t load right now.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' }).style.minHeight).toBe('44px')

    const summary = screen.getByText('Details')
    const details = summary.closest('details')
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)
    expect(details).toHaveTextContent('Invoice fetch failed (404)')
    expect(details).toHaveTextContent('Check that Growth Tools is running and Xero OAuth tokens are valid.')
  })
})
