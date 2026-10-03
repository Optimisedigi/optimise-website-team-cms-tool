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
    { credentials: 'include' },
  ))
  return view
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

    await waitFor(() => expect(fields['hostingSubscription.recipientEmail'].value).toBe('contact@example.com'))
    expect(screen.getByLabelText('Recipient email')).toHaveValue('contact@example.com')
  })

  it('defaults the recipient name to the client contact name and lets it be changed', async () => {
    setField('contactName', 'Jordan Smith')
    setField('hostingSubscription.recipientName', '')
    await renderPanel()

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

    expect(screen.getByLabelText('Recipient name')).toHaveValue('Priya Rao')
    expect(fields['hostingSubscription.recipientName'].setValue).not.toHaveBeenCalled()
  })

  it('keeps a manually entered billing recipient when the client contact changes', async () => {
    const view = await renderPanel()
    const input = screen.getByLabelText('Recipient email')
    fireEvent.change(input, { target: { value: 'accounts@example.com' } })
    view.rerender(<HostingSubscriptionField />)
    expect(fields['hostingSubscription.recipientEmail'].value).toBe('accounts@example.com')

    fields.contactEmail.value = 'new-contact@example.com'
    // Payload rerenders its fields after a form update; reproduce that here.
    view.rerender(<HostingSubscriptionField />)

    expect(screen.getByLabelText('Recipient email')).toHaveValue('accounts@example.com')
    expect(fields['hostingSubscription.recipientEmail'].value).toBe('accounts@example.com')
  })

  it('requires the billing recipient and uses it when creating the offer', async () => {
    setField('hostingSubscription.recipientEmail', '')
    const view = await renderPanel()
    const create = screen.getByRole('button', { name: 'Create hosting offer' })

    // The client contact seeds this field on mount, so explicitly clear it to
    // prove offer validation follows the billing recipient, not contactEmail.
    fireEvent.change(screen.getByLabelText('Recipient email'), { target: { value: '' } })
    view.rerender(<HostingSubscriptionField />)
    expect(screen.getByRole('button', { name: 'Create hosting offer' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Recipient email'), { target: { value: 'billing@example.com' } })
    view.rerender(<HostingSubscriptionField />)
    expect(screen.getByRole('button', { name: 'Create hosting offer' })).toBeEnabled()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'http://localhost:3004/hosting-pay/test', expiresAt: '2026-08-30T00:00:00.000Z' }),
    })

    await act(async () => fireEvent.click(create))

    expect(globalThis.confirm).toHaveBeenCalledWith(
      'Create a seven-day hosting payment offer and email the payment link to billing@example.com? This revokes any current offer.',
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
    expect(screen.queryByRole('heading', { name: 'One-off payment' })).not.toBeInTheDocument()
    unmount()

    auth.user = { id: 1, role: 'admin' }
    await renderPanel()
    expect(screen.getByRole('heading', { name: 'One-off payment' })).toBeInTheDocument()
  })
})

describe('HostingSubscriptionField offer email result', () => {
  const createOfferReturning = async (result: Record<string, unknown>) => {
    setField('hostingSubscription.recipientEmail', 'billing@example.com')
    await renderPanel()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: 'http://localhost:3004/hosting-pay/test',
        expiresAt: '2026-08-30T00:00:00.000Z',
        ...result,
      }),
    })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Create hosting offer' })),
    )
  }

  it('confirms who the payment link was emailed to', async () => {
    await createOfferReturning({ emailSent: true, emailedTo: 'billing@example.com' })

    expect(await screen.findByRole('status', { name: 'Hosting offer status' })).toHaveTextContent(
      'Offer created and emailed to billing@example.com.',
    )
  })

  it('tells the admin to send the link by hand when the email fails, and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    await createOfferReturning({ emailSent: false })

    expect(await screen.findByRole('status', { name: 'Hosting offer status' })).toHaveTextContent(
      'Offer created, but the email could not be sent.',
    )
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

    expect(screen.queryByRole('button', { name: /Stop payments immediately/ })).not.toBeInTheDocument()
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
      fireEvent.click(screen.getByRole('button', { name: 'Stop at end of current period' })),
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

    expect(screen.getByText('Current subscription')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Stop/ })).not.toBeInTheDocument()
  })
})
