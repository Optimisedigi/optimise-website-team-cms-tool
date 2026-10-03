import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HostingSubscriptionField from '@/components/HostingSubscriptionField'

type Field = { value: unknown; setValue: ReturnType<typeof vi.fn> }

const fields: Record<string, Field> = {}
const submit = vi.fn().mockResolvedValue(undefined)
const auth: { user: Record<string, unknown> | null } = { user: { id: 1, role: 'admin' } }

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  useAuth: () => auth,
  useDocumentInfo: () => ({ id: 42 }),
  useForm: () => ({ submit }),
  useField: ({ path }: { path: string }) => {
    const field = fields[path] || (fields[path] = { value: undefined, setValue: vi.fn() })
    return {
      value: field.value,
      setValue: (value: unknown) => {
        field.value = value
        field.setValue(value)
      },
    }
  },
}))

function setField(path: string, value: unknown) {
  fields[path] = { value, setValue: vi.fn() }
}

async function renderPanel() {
  const view = render(<HostingSubscriptionField />)
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
    '/api/globals/hosting-billing-settings?depth=0',
    expect.objectContaining({ credentials: 'include' }),
  ))
  return view
}

/** The offer form sits behind the header action, as in the design. */
function openOffer() {
  fireEvent.click(screen.getByRole('button', { name: '+ New subscription' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, role: 'admin' }
  for (const path of Object.keys(fields)) delete fields[path]
  setField('contactEmail', 'contact@example.com')
  setField('hostingSubscription.planName', 'Care Plan')
  setField('hostingSubscription.allowance', '')
  setField('hostingSubscription.monthlyBaseCents', 9900)
  setField('hostingSubscription.annualBaseCents', 118800)
  setField('hostingSubscription.recipientEmail', '')
  setField('hostingSubscription.billingInterval', 'month')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ plans: [] }),
  }))
  vi.stubGlobal('confirm', vi.fn(() => true))
})

describe('HostingSubscriptionField billing recipient', () => {
  it('defaults the billing recipient to the client contact email', async () => {
    await renderPanel()
    openOffer()

    await waitFor(() => expect(fields['hostingSubscription.recipientEmail'].value).toBe('contact@example.com'))
    expect(screen.getByLabelText('Send link to')).toHaveValue('contact@example.com')
  })

  it('defaults the recipient name to the client contact name and lets it be changed', async () => {
    setField('contactName', 'Jordan Smith')
    setField('hostingSubscription.recipientName', '')
    await renderPanel()
    openOffer()

    await waitFor(() =>
      expect(screen.getByLabelText('Recipient name')).toHaveValue('Jordan Smith'),
    )
    fireEvent.change(screen.getByLabelText('Recipient name'), { target: { value: 'Priya Rao' } })

    expect(fields['hostingSubscription.recipientName'].value).toBe('Priya Rao')
  })

  it('keeps a recipient name the admin already set', async () => {
    setField('contactName', 'Jordan Smith')
    setField('hostingSubscription.recipientName', 'Priya Rao')
    await renderPanel()
    openOffer()

    expect(screen.getByLabelText('Recipient name')).toHaveValue('Priya Rao')
    expect(fields['hostingSubscription.recipientName'].setValue).not.toHaveBeenCalled()
  })

  it('keeps a manually entered billing recipient when the client contact changes', async () => {
    const view = await renderPanel()
    openOffer()
    const input = screen.getByLabelText('Send link to')
    fireEvent.change(input, { target: { value: 'accounts@example.com' } })
    view.rerender(<HostingSubscriptionField />)
    expect(fields['hostingSubscription.recipientEmail'].value).toBe('accounts@example.com')

    fields.contactEmail.value = 'new-contact@example.com'
    // Payload rerenders its fields after a form update; reproduce that here.
    view.rerender(<HostingSubscriptionField />)

    expect(screen.getByLabelText('Send link to')).toHaveValue('accounts@example.com')
    expect(fields['hostingSubscription.recipientEmail'].value).toBe('accounts@example.com')
  })

  it('requires the billing recipient and uses it when creating the offer', async () => {
    setField('hostingSubscription.recipientEmail', '')
    const view = await renderPanel()
    openOffer()
    const create = screen.getByRole('button', { name: 'Create offer & email link' })

    // The client contact seeds this field on mount, so explicitly clear it to
    // prove offer validation follows the billing recipient, not contactEmail.
    fireEvent.change(screen.getByLabelText('Send link to'), { target: { value: '' } })
    view.rerender(<HostingSubscriptionField />)
    expect(screen.getByRole('button', { name: 'Create offer & email link' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Send link to'), { target: { value: 'billing@example.com' } })
    view.rerender(<HostingSubscriptionField />)
    expect(screen.getByRole('button', { name: 'Create offer & email link' })).toBeEnabled()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'http://localhost:3004/hosting-pay/test', expiresAt: '2026-08-30T00:00:00.000Z' }),
    })

    await act(async () => fireEvent.click(create))

    expect(globalThis.confirm).toHaveBeenCalledWith(
      'Email a hosting sign-up link to billing@example.com? The link works for 14 days. Billing follows the option the client picks (monthly or annual). This replaces any current offer.',
    )
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/clients/42/hosting-offers',
      { method: 'POST', credentials: 'include' },
    ))
  })
})

describe('HostingSubscriptionField one-off payments', () => {
  it('shows the one-off payment section only to staff with hosting billing access', async () => {
    auth.user = { id: 2, role: 'editor', features: ['clients'] }
    const { unmount } = await renderPanel()
    expect(screen.queryByRole('heading', { name: 'One-off hosting payments' })).not.toBeInTheDocument()
    unmount()

    auth.user = { id: 1, role: 'admin' }
    await renderPanel()
    expect(screen.getByRole('heading', { name: 'One-off hosting payments' })).toBeInTheDocument()
  })
})

describe('HostingSubscriptionField offer email result', () => {
  const createOfferReturning = async (result: Record<string, unknown>) => {
    setField('hostingSubscription.recipientEmail', 'billing@example.com')
    await renderPanel()
    openOffer()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: 'http://localhost:3004/hosting-pay/test',
        expiresAt: '2026-08-30T00:00:00.000Z',
        ...result,
      }),
    })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Create offer & email link' })),
    )
  }

  it('confirms who the payment link was emailed to', async () => {
    await createOfferReturning({ emailSent: true, emailedTo: 'billing@example.com' })

    expect(await screen.findByRole('status', { name: 'Hosting offer result' })).toHaveTextContent(
      'Offer emailed to billing@example.com. Expires 30 Aug.',
    )
  })

  it('tells the admin to send the link by hand when the email fails, and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    await createOfferReturning({ emailSent: false })

    expect(await screen.findByRole('status', { name: 'Hosting offer result' })).toHaveTextContent(
      'Offer created, but the email could not be sent.',
    )
    const notice = screen.getByRole('status', { name: 'Hosting payment link' })
    expect(notice).toHaveTextContent('Payment link created, not emailed')
    expect(notice).toHaveTextContent('Status: Link created, but the email did not send')
    expect(notice).not.toHaveTextContent('billing@example.com')
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Copy payment link' })),
    )
    expect(writeText).toHaveBeenCalledWith('http://localhost:3004/hosting-pay/test')
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument()
  })
})

describe('HostingSubscriptionField stopping payments', () => {
  it('hides stop controls when the client has no subscription', async () => {
    await renderPanel()

    expect(screen.queryByRole('button', { name: /Stop immediately/ })).not.toBeInTheDocument()
  })

  it('stops payments at the end of the period and reflects the result', async () => {
    setField('hostingSubscription.stripeSubscriptionId', 'sub_123')
    setField('hostingSubscription.subscriptionStatus', 'active')
    setField('hostingSubscription.cancelAtPeriodEnd', false)
    setField('hostingSubscription.currentPeriodEnd', '2026-11-01T02:00:00.000Z')
    await renderPanel()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        subscriptionStatus: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2026-11-01T02:00:00.000Z',
      }),
    })

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Stop at end of period' })),
    )

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/clients/42/hosting-subscription/stop', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'end_of_period' }),
    })
    await waitFor(() => expect(fields['hostingSubscription.cancelAtPeriodEnd'].value).toBe(true))
    expect(screen.getByText(/Payments will stop on 1 November 2026/)).toBeInTheDocument()
  })

  it('shows the subscription but no stop controls to staff without billing permission', async () => {
    auth.user = { id: 2, role: 'user', featureAccess: ['clients'] }
    setField('hostingSubscription.stripeSubscriptionId', 'sub_123')
    setField('hostingSubscription.subscriptionStatus', 'active')
    await renderPanel()

    expect(screen.getByLabelText('Current subscription')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Stop/ })).not.toBeInTheDocument()
  })
})

describe('HostingSubscriptionField payment history', () => {
  const payment = (n: number) => ({
    invoiceId: `in_${n}`,
    periodStart: `2026-${String(12 - n).padStart(2, '0')}-01T00:00:00.000Z`,
    periodEnd: `2026-${String(13 - n).padStart(2, '0')}-01T00:00:00.000Z`,
    amountPaidCents: 9900,
    currency: 'aud',
    paidAt: `2026-${String(12 - n).padStart(2, '0')}-01T00:00:00.000Z`,
    status: 'paid',
  })

  beforeEach(() => {
    setField('hostingSubscription.stripeSubscriptionId', 'sub_123')
    setField('hostingSubscription.subscriptionStatus', 'active')
  })

  it('shows only the empty state and header action when there is no subscription', async () => {
    setField('hostingSubscription.stripeSubscriptionId', '')
    await renderPanel()
    expect(screen.getByRole('button', { name: '+ New subscription' })).toBeInTheDocument()
    expect(screen.getByText(/No hosting subscription yet/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Current subscription')).not.toBeInTheDocument()
  })

  const offerRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    status: 'active',
    createdAt: '2026-10-03T13:30:29.955Z',
    expiresAt: '2099-10-17T13:30:29.865Z',
    selectedInterval: null,
    snapshot: {
      recipientEmail: 'billing@example.com',
      monthly: { totalCents: 5900, currency: 'aud', planName: 'Managed Hosting — Essential' },
      annual: { totalCents: 70800, currency: 'aud', planName: 'Managed Hosting — Essential' },
    },
    ...overrides,
  })

  function mockOffer(response: { ok: boolean; body?: unknown }) {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) =>
      url.startsWith('/api/hosting-payment-offers/7')
        ? { ok: response.ok, json: async () => response.body ?? {} }
        : { ok: true, json: async () => ({ plans: [] }) },
    )
  }

  function withSentOffer() {
    setField('hostingSubscription.stripeSubscriptionId', '')
    setField('hostingSubscription.activeOffer', 7)
    setField('hostingSubscription.offerCreatedAt', '2026-10-03T13:30:29.955Z')
    setField('hostingSubscription.offerExpiresAt', '2099-10-17T13:30:29.865Z')
  }

  const notice = () => screen.findByRole('status', { name: 'Hosting payment link' })

  it.each([
    [{}, 'Status: Payment not started yet'],
    [
      { status: 'checkout_pending', selectedInterval: 'month' },
      'Status: Started payment (chose monthly), not paid yet',
    ],
    [
      { status: 'checkout_pending', selectedInterval: 'year' },
      'Status: Started payment (chose annual), not paid yet',
    ],
    [{ status: 'revoked' }, 'Status: Cancelled (replaced or withdrawn)'],
    [{ status: 'expired' }, 'Status: Expired without payment'],
    [{ expiresAt: '2026-01-15T00:00:00.000Z' }, 'Status: Expired without payment'],
  ])('shows the offer name, price, recipient and live status %#', async (overrides, status) => {
    withSentOffer()
    mockOffer({ ok: true, body: offerRecord(overrides) })
    await renderPanel()
    await waitFor(async () => expect(await notice()).toHaveTextContent(status))
    const banner = await notice()
    expect(banner).toHaveTextContent(
      'Managed Hosting — Essential · $59.00/month or $708.00/year',
    )
    expect(banner).toHaveTextContent('Payment link sent to billing@example.com on 3 Oct 2026')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/hosting-payment-offers/7?depth=0',
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(screen.queryByText(/No hosting subscription yet/)).not.toBeInTheDocument()
  })

  it('falls back to the saved dates when the offer cannot be read', async () => {
    withSentOffer()
    setField('hostingSubscription.recipientEmail', 'billing@example.com')
    mockOffer({ ok: false })
    await renderPanel()
    await waitFor(async () =>
      expect(await notice()).toHaveTextContent(
        'Status: Sent, awaiting payment (live status unavailable)',
      ),
    )
    expect(await notice()).toHaveTextContent('Care Plan')
    expect(await notice()).toHaveTextContent(
      'Payment link sent to billing@example.com on 3 Oct 2026',
    )
  })

  it('shows no link notice when no offer was ever sent', async () => {
    setField('hostingSubscription.stripeSubscriptionId', '')
    await renderPanel()
    expect(screen.queryByRole('status', { name: 'Hosting payment link' })).not.toBeInTheDocument()
    expect(screen.getByText(/No hosting subscription yet/)).toBeInTheDocument()
  })

  it('does not look up the offer once the client is subscribed', async () => {
    setField('hostingSubscription.activeOffer', 7)
    await renderPanel()
    expect(screen.queryByRole('status', { name: 'Hosting payment link' })).not.toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/hosting-payment-offers/'),
      expect.anything(),
    )
  })

  it('lists the latest six payments with totals and can show them all', async () => {
    const payments = Array.from({ length: 8 }, (_, i) => payment(i))
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) =>
      url === '/api/clients/42/hosting-payments'
        ? { ok: true, json: async () => ({ payments, count: 8, totalPaidCents: 79200 }) }
        : { ok: true, json: async () => ({ plans: [] }) },
    )
    await renderPanel()

    expect(await screen.findByText('8 months · Total')).toBeInTheDocument()
    expect(screen.getAllByText('Paid')).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 8 payments' }))
    expect(screen.getAllByText('Paid')).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'Show latest 6' })).toBeInTheDocument()
  })

  it('offers a retry when the history cannot be loaded', async () => {
    let calls = 0
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url !== '/api/clients/42/hosting-payments')
        return { ok: true, json: async () => ({ plans: [] }) }
      calls += 1
      return calls === 1
        ? { ok: false, json: async () => ({ error: 'Stripe is down.' }) }
        : { ok: true, json: async () => ({ payments: [], count: 0, totalPaidCents: 0 }) }
    })
    await renderPanel()

    expect(await screen.findByRole('alert')).toHaveTextContent('Stripe is down.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No payments yet')).toBeInTheDocument()
  })

  it('aborts the history request on unmount', async () => {
    const view = await renderPanel()
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url]) => url === '/api/clients/42/hosting-payments',
    )
    const signal = (call?.[1] as RequestInit).signal as AbortSignal
    view.unmount()
    expect(signal.aborted).toBe(true)
  })
})
