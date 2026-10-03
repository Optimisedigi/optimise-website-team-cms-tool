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
  scheduledSendAt: null,
  emailSentAt: '2026-10-02T00:00:00.000Z',
  sendFailed: false,
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

  it('resends a sent or expired link and offers the new link to copy', async () => {
    const expired = { ...sent, id: 33, expiresAt: '2020-01-01T00:00:00.000Z' }
    fetchMock.mockResolvedValueOnce(
      json({
        payments: [
          expired,
          { ...sent, id: 34, status: 'paid', paidAt: '2026-09-20T00:00:00.000Z' },
          { ...sent, id: 35, status: 'revoked' },
          { ...sent, id: 36, status: 'scheduled', scheduledSendAt: '2099-01-01T00:00:00.000Z' },
        ],
      }),
    )
    await renderSection()
    fetchMock
      .mockResolvedValueOnce(
        json({
          url: 'https://cms.test/hosting-pay/once/new',
          emailSent: true,
          emailedTo: 'billing@example.com',
        }),
      )
      .mockResolvedValueOnce(json({ payments: [{ ...sent, id: 33 }] }))

    const table = await screen.findByRole('table', { name: 'Payment links sent' })
    // Only links that were sent and not paid or cancelled can be resent.
    expect(within(table).getAllByRole('button', { name: /^Resend link/ })).toHaveLength(1)
    await act(async () =>
      fireEvent.click(
        within(table).getByRole('button', {
          name: 'Resend link for Backdated hosting, July to September',
        }),
      ),
    )

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('the link in the earlier email stops working'),
    )
    expect(fetchMock).toHaveBeenCalledWith('/api/clients/8/hosting-one-off-payments/33/resend', {
      method: 'POST',
      credentials: 'include',
    })
    expect(screen.getByRole('status', { name: 'One-off payment status' })).toHaveTextContent(
      'Payment link for $302.60 emailed again to billing@example.com.',
    )
    expect(screen.getByRole('link', { name: 'Open payment link' })).toHaveAttribute(
      'href',
      'https://cms.test/hosting-pay/once/new',
    )
  })

  it('shows why a resend was refused', async () => {
    fetchMock.mockResolvedValueOnce(json({ payments: [sent] }))
    await renderSection()
    fetchMock
      .mockResolvedValueOnce(json({ error: 'This payment has already been made.' }, false, 409))
      .mockResolvedValueOnce(json({ payments: [sent] }))

    await act(async () =>
      fireEvent.click(await screen.findByRole('button', { name: /^Resend link/ })),
    )

    expect(screen.getByRole('status', { name: 'One-off payment status' })).toHaveTextContent(
      'This payment has already been made.',
    )
    expect(screen.queryByRole('link', { name: 'Open payment link' })).not.toBeInTheDocument()
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
    // Not removable until the cancel has fully gone through.
    expect(within(row).queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'One-off payment status' })).toHaveTextContent(
      'could not reach Stripe',
    )
  })

  it('removes a cancelled link from the list', async () => {
    const cancelled = { ...sent, status: 'revoked' }
    fetchMock.mockResolvedValueOnce(json({ payments: [cancelled, { ...sent, id: 32 }] }))
    await renderSection()
    fetchMock
      .mockResolvedValueOnce(json({ hidden: true }))
      .mockResolvedValueOnce(json({ payments: [{ ...sent, id: 32 }] }))

    const table = await screen.findByRole('table', { name: 'Payment links sent' })
    const [, cancelledRow, openRow] = within(table).getAllByRole('row') as HTMLElement[]
    // Only cancelled links can be removed.
    expect(
      within(openRow as HTMLElement).queryByRole('button', { name: /Remove/ }),
    ).not.toBeInTheDocument()
    await act(async () =>
      fireEvent.click(
        within(cancelledRow as HTMLElement).getByRole('button', {
          name: 'Remove cancelled link for Backdated hosting, July to September',
        }),
      ),
    )

    expect(fetchMock).toHaveBeenCalledWith('/api/clients/8/hosting-one-off-payments/31/hide', {
      method: 'POST',
      credentials: 'include',
    })
    expect(screen.getByRole('status', { name: 'One-off payment status' })).toHaveTextContent(
      'Cancelled payment link removed from the list.',
    )
    expect(
      within(screen.getByRole('table', { name: 'Payment links sent' })).getAllByRole('row'),
    ).toHaveLength(2)
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

  it('schedules the email for a chosen date and says when it will go out', async () => {
    const scheduled = {
      ...sent,
      status: 'scheduled',
      scheduledSendAt: '2026-10-09T22:00:00.000Z',
      emailSentAt: null,
    }
    fetchMock.mockResolvedValueOnce(json({ payments: [] }))
    await renderSection()
    fetchMock
      .mockResolvedValueOnce(json({ payment: scheduled, emailSent: false }))
      .mockResolvedValueOnce(json({ payments: [scheduled] }))

    fireEvent.change(screen.getByLabelText("What it's for"), { target: { value: 'Hosting' } })
    fireEvent.change(screen.getByLabelText('Amount before surcharge (AUD)'), {
      target: { value: '297' },
    })
    fireEvent.change(screen.getByLabelText('Send email on (optional)'), {
      target: { value: '2026-10-10' },
    })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Schedule payment email' })),
    )

    expect(window.confirm).toHaveBeenCalledWith(
      'Save this client and schedule a one-off payment link for $297.00 plus any card surcharge, emailed to billing@example.com at 9am on 10 Oct 2026?',
    )
    expect(fetchMock).toHaveBeenCalledWith('/api/clients/8/hosting-one-off-payments', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Hosting', amount: 297, sendOn: '2026-10-10' }),
    })
    expect(await screen.findByRole('status', { name: 'One-off payment status' })).toHaveTextContent(
      'Payment link for $302.60 will be emailed to billing@example.com at 9am on 10 Oct 2026.',
    )
    // No link exists until the email goes out, so there is nothing to copy.
    expect(screen.queryByRole('button', { name: 'Copy payment link' })).not.toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Payment links sent' })
    const row = within(table).getAllByRole('row')[1] as HTMLElement
    expect(row).toHaveTextContent('Email scheduled for 10 Oct 2026')
    expect(row).toHaveTextContent('Not yet')
    expect(within(row).getByRole('button', { name: 'Cancel link' })).toBeInTheDocument()
  })

  it('tells the admin when a scheduled email stopped retrying', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        payments: [
          {
            ...sent,
            status: 'scheduled',
            scheduledSendAt: '2026-10-09T22:00:00.000Z',
            emailSentAt: null,
            sendFailed: true,
          },
        ],
      }),
    )
    await renderSection()

    expect(await screen.findByRole('table', { name: 'Payment links sent' })).toHaveTextContent(
      'Scheduled email failed to send. Cancel it and send a new link.',
    )
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
