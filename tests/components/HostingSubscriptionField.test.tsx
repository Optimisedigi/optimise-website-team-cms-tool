import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HostingSubscriptionField from '@/components/HostingSubscriptionField'

type Field = { value: unknown; setValue: ReturnType<typeof vi.fn> }

const fields: Record<string, Field> = {}
const submit = vi.fn().mockResolvedValue(undefined)

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
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
      'Create a seven-day hosting payment offer for billing@example.com? This revokes any current offer.',
    )
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/clients/42/hosting-offers',
      { method: 'POST', credentials: 'include' },
    ))
  })
})
