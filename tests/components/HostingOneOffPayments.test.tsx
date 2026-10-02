import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HostingOneOffPayments } from '@/components/HostingOneOffPayments'

vi.mock('@payloadcms/ui', () => ({
  Button: ({
    children,
    buttonStyle: _style,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { buttonStyle?: string; size?: string }) => (
    <button {...props}>{children}</button>
  ),
}))

const sent = {
  id: 31,
  status: 'active',
  description: 'Backdated hosting, July to September',
  totalCents: 30260,
  currency: 'aud',
  recipientEmail: 'billing@example.com',
  createdAt: '2026-10-02T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  paidAt: null,
}
const fetchMock = vi.fn()
const saveClient = vi.fn()
const json = (body: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: async () => body,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  )
  saveClient.mockResolvedValue(undefined)
})

async function renderSection(recipientEmail = 'billing@example.com', currency = 'aud') {
  render(
    <HostingOneOffPayments
      clientId={8}
      recipientEmail={recipientEmail}
      currency={currency}
      saveClient={saveClient}
    />,
  )
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith('/api/clients/8/hosting-one-off-payments', {
      credentials: 'include',
    }),
  )
}

describe('HostingOneOffPayments', () => {
  it('does not create a link when saving the client fails', async () => {
    fetchMock.mockResolvedValueOnce(json({ payments: [] }))
    await renderSection()
    saveClient.mockRejectedValueOnce(new Error('Billing email is invalid.'))

    fireEvent.change(screen.getByLabelText("What it's for"), { target: { value: 'Hosting' } })
    fireEvent.change(screen.getByLabelText('Amount before surcharge (AUD)'), {
      target: { value: '5' },
    })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Email payment link' })),
    )

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    expect(screen.getByRole('status', { name: 'One-off payment status' })).toHaveTextContent(
      'Billing email is invalid.',
    )
  })

  it('uses the Hosting Billing Settings currency in the label and the confirmation', async () => {
    fetchMock.mockResolvedValueOnce(json({ payments: [] }))
    await renderSection('billing@example.com', 'nzd')
    vi.mocked(window.confirm).mockReturnValueOnce(false)

    fireEvent.change(screen.getByLabelText("What it's for"), { target: { value: 'Hosting' } })
    fireEvent.change(screen.getByLabelText('Amount before surcharge (NZD)'), {
      target: { value: '5' },
    })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Email payment link' })),
    )

    // Intl puts a non-breaking space between the currency code and the amount.
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringMatching(/for NZD\s5\.00 plus any card surcharge/),
    )
    expect(saveClient).not.toHaveBeenCalled()
  })

  it('keeps Cancel link available when Stripe could not be reached, so it can be retried', async () => {
    fetchMock.mockResolvedValueOnce(json({ payments: [sent] }))
    await renderSection()
    fetchMock
      .mockResolvedValueOnce(
        json({ error: 'The link is cancelled, but we could not reach Stripe.' }, false, 503),
      )
      .mockResolvedValueOnce(json({ payments: [{ ...sent, status: 'revoked' }] }))

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel link' })))

    const row = within(screen.getByRole('table', { name: 'Payment links sent' })).getAllByRole(
      'row',
    )[1] as HTMLElement
    expect(row).toHaveTextContent('Cancelled')
    expect(within(row).getByRole('button', { name: 'Cancel link' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'One-off payment status' })).toHaveTextContent(
      'could not reach Stripe',
    )
  })

  it('lists earlier links with their status and lets an open one be cancelled', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        payments: [sent, { ...sent, id: 30, status: 'paid', paidAt: '2026-09-20T00:00:00.000Z' }],
      }),
    )
    await renderSection()

    const table = await screen.findByRole('table', { name: 'Payment links sent' })
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Waiting for payment')
    expect(rows[1]).toHaveTextContent('$302.60')
    expect(
      within(rows[1] as HTMLElement).getByRole('button', { name: 'Cancel link' }),
    ).toBeInTheDocument()
    expect(rows[2]).toHaveTextContent('Paid 20 Sept 2026')
    expect(
      within(rows[2] as HTMLElement).queryByRole('button', { name: 'Cancel link' }),
    ).not.toBeInTheDocument()
  })

  it('needs a description, an amount and a billing email before sending', async () => {
    fetchMock.mockResolvedValueOnce(json({ payments: [] }))
    await renderSection('')

    const send = screen.getByRole('button', { name: 'Email payment link' })
    expect(send).toBeDisabled()
    expect(screen.getByText('Add a billing email above first.')).toBeInTheDocument()
  })

  it('sends the description and dollar amount, then shows who it was emailed to', async () => {
    fetchMock.mockResolvedValueOnce(json({ payments: [] }))
    await renderSection()
    fetchMock
      .mockResolvedValueOnce(
        json({
          payment: sent,
          url: 'https://cms.test/hosting-pay/once/tok',
          emailSent: true,
          emailedTo: 'billing@example.com',
        }),
      )
      .mockResolvedValueOnce(json({ payments: [sent] }))

    fireEvent.change(screen.getByLabelText("What it's for"), {
      target: { value: 'Backdated hosting, July to September' },
    })
    fireEvent.change(screen.getByLabelText('Amount before surcharge (AUD)'), {
      target: { value: '297' },
    })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Email payment link' })),
    )

    expect(window.confirm).toHaveBeenCalledWith(
      'Save this client and email a one-off payment link to billing@example.com for $297.00 plus any card surcharge?',
    )
    // The server emails the saved billing address, so the form is saved first.
    const saveOrder = saveClient.mock.invocationCallOrder[0] ?? Infinity
    const postOrder =
      fetchMock.mock.invocationCallOrder[
        fetchMock.mock.calls.findIndex(([, init]) => init?.method === 'POST')
      ] ?? -1
    expect(saveOrder).toBeLessThan(postOrder)
    expect(fetchMock).toHaveBeenCalledWith('/api/clients/8/hosting-one-off-payments', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Backdated hosting, July to September', amount: 297 }),
    })
    expect(await screen.findByRole('status', { name: 'One-off payment status' })).toHaveTextContent(
      'Payment link for $302.60 emailed to billing@example.com.',
    )
    expect(screen.getByRole('button', { name: 'Copy payment link' })).toBeInTheDocument()
  })

  it('shows the server error when the link cannot be created', async () => {
    fetchMock.mockResolvedValueOnce(json({ payments: [] }))
    await renderSection()
    fetchMock.mockResolvedValueOnce(json({ error: 'Enter an amount above $0.' }, false))

    fireEvent.change(screen.getByLabelText("What it's for"), { target: { value: 'Hosting' } })
    fireEvent.change(screen.getByLabelText('Amount before surcharge (AUD)'), {
      target: { value: '5' },
    })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Email payment link' })),
    )

    expect(await screen.findByRole('status', { name: 'One-off payment status' })).toHaveTextContent(
      'Enter an amount above $0.',
    )
  })
})
