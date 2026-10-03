import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmbeddedCardPayment } from '@/app/(frontend)/hosting-pay/EmbeddedCardPayment'

const mount = vi.fn()
const destroy = vi.fn()
const createEmbeddedCheckoutPage = vi.fn()
const loadStripe = vi.fn()

vi.mock('@stripe/stripe-js', () => ({ loadStripe: (...args: unknown[]) => loadStripe(...args) }))

const fetchMock = vi.fn()
type CheckoutOptions = { fetchClientSecret: () => Promise<string>; onComplete: () => void }
const lastOptions = () => createEmbeddedCheckoutPage.mock.calls.at(-1)?.[0] as CheckoutOptions

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  createEmbeddedCheckoutPage.mockResolvedValue({ mount, destroy, unmount: vi.fn() })
  loadStripe.mockResolvedValue({ createEmbeddedCheckoutPage })
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ clientSecret: 'cs_secret' }) })
})

const renderForm = (onOpenChange = vi.fn()) => {
  render(
    <EmbeddedCardPayment
      publishableKey="pk_test_123"
      checkoutUrl="/api/hosting-pay/tok/checkout"
      request={{ interval: 'year' }}
      payLabel="Set up card payment"
      successTitle="Hosting payments set up"
      successDetail="Stripe will email your receipt."
      onOpenChange={onOpenChange}
    />,
  )
  return onOpenChange
}

const open = async () => {
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Set up card payment' })),
  )
  await waitFor(() => expect(mount).toHaveBeenCalled())
}

describe('EmbeddedCardPayment', () => {
  it('shows nothing from Stripe until the client chooses to pay', () => {
    renderForm()

    expect(screen.getByRole('button', { name: 'Set up card payment' })).toBeInTheDocument()
    expect(loadStripe).not.toHaveBeenCalled()
  })

  it('mounts Stripe card form in the page, asking the checkout route for this interval', async () => {
    const onOpenChange = renderForm()
    await open()

    expect(loadStripe).toHaveBeenCalledWith('pk_test_123')
    expect(mount).toHaveBeenCalledWith(screen.getByLabelText('Card payment form'))
    expect(onOpenChange).toHaveBeenLastCalledWith(true)

    await expect(lastOptions().fetchClientSecret()).resolves.toBe('cs_secret')
    expect(fetchMock).toHaveBeenCalledWith('/api/hosting-pay/tok/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interval: 'year', ui: 'embedded' }),
    })
  })

  it('shows the success message once Stripe reports the payment complete', async () => {
    const onOpenChange = renderForm()
    await open()

    await act(async () => lastOptions().onComplete())

    expect(screen.getByRole('status')).toHaveTextContent('Hosting payments set up')
    expect(destroy).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
  })

  it('Back closes the form and unlocks the page', async () => {
    const onOpenChange = renderForm()
    await open()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Back' })))

    expect(destroy).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(screen.getByRole('button', { name: 'Set up card payment' })).toBeInTheDocument()
  })

  it('surfaces the server reason (for example an expired link) and offers a retry', async () => {
    createEmbeddedCheckoutPage.mockImplementation(async (options: CheckoutOptions) => {
      await options.fetchClientSecret()
      return { mount, destroy, unmount: vi.fn() }
    })
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'This payment link is unavailable.' }),
    })
    renderForm()

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Set up card payment' })),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('This payment link is unavailable.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(mount).not.toHaveBeenCalled()
  })

  it('explains when Stripe itself cannot load', async () => {
    loadStripe.mockResolvedValue(null)
    renderForm()

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Set up card payment' })),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load the payment form.',
    )
  })
})
