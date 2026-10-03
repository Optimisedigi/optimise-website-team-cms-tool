import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OneOffPaymentForm } from '@/app/(frontend)/hosting-pay/once/[token]/OneOffPaymentForm'

type Handler = (event: unknown) => unknown
const handlers: Record<string, Handler> = {}
const express = {
  on: vi.fn((name: string, handler: Handler) => {
    handlers[name] = handler
    return express
  }),
  mount: vi.fn(),
  destroy: vi.fn(),
}
const payment = { mount: vi.fn(), destroy: vi.fn() }
const confirm = vi.fn()
const getSession = vi.fn()
const loadActions = vi.fn()
const initCheckoutElementsSdk = vi.fn()
const loadStripe = vi.fn()

vi.mock('@stripe/stripe-js', () => ({ loadStripe: (...args: unknown[]) => loadStripe(...args) }))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(handlers)) delete handlers[key]
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ clientSecret: 'cs_secret' }) })
  getSession.mockReturnValue({ status: { type: 'open' } })
  loadActions.mockResolvedValue({ type: 'success', actions: { confirm, getSession } })
  initCheckoutElementsSdk.mockReturnValue({
    loadActions,
    createExpressCheckoutElement: () => express,
    createPaymentElement: () => payment,
    getPaymentElement: () => payment,
    getExpressCheckoutElement: () => express,
  })
  loadStripe.mockResolvedValue({ initCheckoutElementsSdk })
})

const renderForm = () =>
  render(
    <OneOffPaymentForm
      publishableKey="pk_test_123"
      checkoutUrl="/api/hosting-pay/once/tok/checkout"
      total="$256.65"
      description="May–August Hosting"
      expires="17 October 2026"
      receiptEmail="billing@example.com"
    />,
  )

const ready = async () => {
  renderForm()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pay $256.65' })).toBeEnabled())
}

describe('OneOffPaymentForm', () => {
  it("mounts Stripe's card and wallet fields in the page from an in-page checkout session", async () => {
    await ready()

    expect(fetchMock).toHaveBeenCalledWith('/api/hosting-pay/once/tok/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui: 'elements' }),
    })
    expect(loadStripe).toHaveBeenCalledWith('pk_test_123')
    expect(payment.mount).toHaveBeenCalled()
    expect(express.mount).toHaveBeenCalled()
    expect(
      screen.getByText('One-off charge · Powered by Stripe · Link expires 17 October 2026'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Email for receipt/)).toHaveValue('billing@example.com')
  })

  it('shows the wallet divider only when Apple Pay or Google Pay is available', async () => {
    await ready()
    expect(screen.queryByText('or pay with card')).not.toBeInTheDocument()

    await act(async () => handlers.ready?.({ availablePaymentMethods: { applePay: true } }))

    expect(screen.getByText('or pay with card')).toBeInTheDocument()
  })

  it('confirms the card payment without resending the receipt email, then shows the receipt', async () => {
    confirm.mockResolvedValue({ type: 'success', session: {} })
    await ready()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pay $256.65' })))

    expect(confirm).toHaveBeenCalledWith({ redirect: 'if_required' })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Payment received')
    expect(status).toHaveTextContent('$256.65 paid for May–August Hosting.')
    expect(status).toHaveTextContent('A receipt has been sent to billing@example.com.')
  })

  it('shows a declined card and lets the client try again', async () => {
    confirm.mockResolvedValue({ type: 'error', error: { message: 'Your card was declined.' } })
    await ready()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pay $256.65' })))

    expect(screen.getByRole('alert')).toHaveTextContent('Your card was declined.')
    expect(screen.getByRole('button', { name: 'Pay $256.65' })).toBeEnabled()
  })

  it('never leaves the button stuck on Processing if Stripe throws', async () => {
    confirm.mockRejectedValue(new Error('IntegrationError'))
    await ready()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pay $256.65' })))

    expect(screen.getByRole('alert')).toHaveTextContent('Your payment did not go through.')
    expect(screen.getByRole('button', { name: 'Pay $256.65' })).toBeEnabled()
  })

  it('completes an Apple Pay or Google Pay payment from the wallet buttons', async () => {
    confirm.mockResolvedValue({ type: 'success', session: {} })
    await ready()
    const event = { paymentFailed: vi.fn() }

    await act(async () => handlers.confirm?.(event))

    expect(confirm).toHaveBeenCalledWith({
      expressCheckoutConfirmEvent: event,
      redirect: 'if_required',
    })
    expect(screen.getByRole('status')).toHaveTextContent('Payment received')
  })

  it('shows the paid state straight away if this checkout was already completed', async () => {
    getSession.mockReturnValue({ status: { type: 'complete' } })
    renderForm()

    expect(await screen.findByRole('status')).toHaveTextContent('Payment received')
    expect(payment.mount).not.toHaveBeenCalled()
  })

  it('explains when the link can no longer be paid', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'This payment link is unavailable.' }),
    })
    renderForm()

    expect(await screen.findByRole('alert')).toHaveTextContent('This payment link is unavailable.')
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument()
  })
})
