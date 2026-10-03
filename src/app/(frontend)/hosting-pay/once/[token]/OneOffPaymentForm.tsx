'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  loadStripe,
  type StripeCheckoutElementsSdk,
  type StripeCheckoutLoadActionsSuccess,
  type StripeExpressCheckoutElementConfirmEvent,
} from '@stripe/stripe-js'
import styles from './one-off-pay.module.css'

type Props = Readonly<{
  publishableKey: string
  checkoutUrl: string
  /** Pre-formatted, e.g. "$256.65". */
  total: string
  description: string
  expires: string
  /** The client's billing email. Stripe sends the receipt here. */
  receiptEmail: string
}>

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'paying' }
  | { kind: 'paid'; email: string; date: string }
  | { kind: 'unavailable'; message: string }

const LOAD_ERROR =
  'We could not load the payment form. Please refresh the page or try again in a minute.'
const PAY_ERROR = 'Your payment did not go through. Please check your card details and try again.'

/**
 * Card and wallet payment inside the page (design: export 3/payment.html).
 * Stripe renders the card fields and Apple Pay / Google Pay buttons in its own
 * secure frames; this page never sees card details. Stripe's webhook still
 * records the payment, so the success panel here is a courtesy.
 */
export function OneOffPaymentForm({
  publishableKey,
  checkoutUrl,
  total,
  description,
  expires,
  receiptEmail,
}: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [error, setError] = useState('')
  // Apple Pay / Google Pay only show on supported devices over HTTPS on a
  // registered domain; the "or pay with card" divider follows them.
  const [hasWallets, setHasWallets] = useState(false)
  const wallets = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const actions = useRef<StripeCheckoutLoadActionsSuccess | null>(null)

  useEffect(() => {
    let cancelled = false
    let checkout: StripeCheckoutElementsSdk | null = null
    const markPaid = () =>
      setPhase({
        kind: 'paid',
        email: receiptEmail,
        date: new Date().toLocaleDateString('en-AU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      })

    const start = async () => {
      try {
        // Awaited before Stripe starts so a refusal (paid, cancelled or expired
        // link) reaches this catch and is shown, rather than leaving the form
        // stuck loading inside Stripe.
        const [response, stripe] = await Promise.all([
          fetch(checkoutUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ui: 'elements' }),
          }),
          loadStripe(publishableKey),
        ])
        const data = (await response.json().catch(() => ({}))) as {
          clientSecret?: unknown
          error?: unknown
        }
        if (!response.ok || typeof data.clientSecret !== 'string')
          throw new Error(typeof data.error === 'string' ? data.error : LOAD_ERROR)
        const clientSecret = data.clientSecret
        if (cancelled) return
        if (!stripe) throw new Error(LOAD_ERROR)
        checkout = stripe.initCheckoutElementsSdk({
          clientSecret,
          elementsOptions: {
            fonts: [
              {
                cssSrc:
                  'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap',
              },
            ],
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary: '#141414',
                colorText: '#141414',
                colorTextSecondary: '#55534e',
                colorDanger: '#b4232f',
                fontFamily: 'Geist, Helvetica, Arial, sans-serif',
                fontSizeBase: '15px',
                borderRadius: '8px',
                spacingUnit: '4px',
              },
              rules: {
                '.Input': { border: '1px solid #d9d7d1', boxShadow: 'none', padding: '13px 14px' },
                '.Input:focus': {
                  border: '1px solid #141414',
                  boxShadow: '0 0 0 3px rgba(20,20,20,.08)',
                },
                '.Label': { color: '#2a2926', fontWeight: '500', fontSize: '13px' },
              },
            },
          },
        })
        const loaded = await checkout.loadActions()
        if (cancelled) return
        if (loaded.type !== 'success') throw new Error(loaded.error.message || LOAD_ERROR)
        actions.current = loaded.actions
        if (loaded.actions.getSession().status.type === 'complete') return markPaid()

        const express = checkout.createExpressCheckoutElement({
          buttonHeight: 48,
          buttonTheme: { applePay: 'black', googlePay: 'white' },
          buttonType: { applePay: 'plain', googlePay: 'plain' },
          layout: { maxColumns: 2, maxRows: 1, overflow: 'auto' },
          paymentMethodOrder: ['apple_pay', 'google_pay'],
          paymentMethods: {
            applePay: 'auto',
            googlePay: 'auto',
            link: 'never',
            paypal: 'never',
            amazonPay: 'never',
            klarna: 'never',
          },
        })
        express.on('ready', (event) => {
          if (!cancelled) setHasWallets(Boolean(event.availablePaymentMethods))
        })
        express.on('confirm', async (event: StripeExpressCheckoutElementConfirmEvent) => {
          try {
            const result = await loaded.actions.confirm({
              expressCheckoutConfirmEvent: event,
              redirect: 'if_required',
            })
            if (cancelled) return
            if (result.type === 'success') markPaid()
            else setError(result.error.message || PAY_ERROR)
          } catch {
            if (!cancelled) setError(PAY_ERROR)
          }
        })
        if (wallets.current) express.mount(wallets.current)

        const payment = checkout.createPaymentElement({
          layout: 'tabs',
          paymentMethodOrder: ['card'],
          wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
        })
        if (card.current) payment.mount(card.current)
        setPhase({ kind: 'ready' })
      } catch (cause) {
        if (!cancelled)
          setPhase({
            kind: 'unavailable',
            message: cause instanceof Error && cause.message ? cause.message : LOAD_ERROR,
          })
      }
    }
    void start()

    return () => {
      cancelled = true
      checkout?.getPaymentElement()?.destroy()
      checkout?.getExpressCheckoutElement()?.destroy()
    }
  }, [checkoutUrl, publishableKey, receiptEmail])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const current = actions.current
    if (!current || phase.kind !== 'ready') return
    setError('')
    setPhase({ kind: 'paying' })
    try {
      // The receipt email is fixed on the Stripe session (the client's billing
      // email), so it is not sent again here; Stripe rejects a second one.
      const result = await current.confirm({ redirect: 'if_required' })
      if (result.type === 'success') {
        setPhase({
          kind: 'paid',
          email: receiptEmail,
          date: new Date().toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        })
        return
      }
      setError(result.error.message || PAY_ERROR)
    } catch {
      setError(PAY_ERROR)
    }
    setPhase({ kind: 'ready' })
  }

  if (phase.kind === 'paid') {
    return (
      <div className={styles.success} role="status">
        <div className={styles.tick} aria-hidden="true">
          ✓
        </div>
        <h2>Payment received</h2>
        <p>
          {total} paid for {description}.
          <br />A receipt has been sent to {phase.email || 'your email'}.
        </p>
        <dl className={styles.receipt}>
          <div>
            <dt>Amount</dt>
            <dd className={styles.mono}>{total}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{phase.date}</dd>
          </div>
        </dl>
      </div>
    )
  }

  if (phase.kind === 'unavailable') {
    return (
      <div className={styles.form} role="alert">
        <h2 className={styles.heading}>Payment unavailable</h2>
        <p className={styles.loading}>{phase.message}</p>
      </div>
    )
  }

  const paying = phase.kind === 'paying'
  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-busy={phase.kind === 'loading'}>
      <h2 className={styles.heading}>Payment details</h2>
      {phase.kind === 'loading' && <p className={styles.loading}>Loading secure payment form…</p>}
      <div ref={wallets} className={styles.wallets} hidden={!hasWallets} />
      {hasWallets && <div className={styles.divider}>or pay with card</div>}
      <label className={styles.field}>
        Email for receipt
        <input type="email" value={receiptEmail} readOnly aria-describedby="receipt-email-note" />
        <span id="receipt-email-note" className={styles.fieldNote}>
          Your receipt goes to the billing email we have on file.
        </span>
      </label>
      <div ref={card} className={styles.paymentElement} />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={styles.pay} disabled={paying || phase.kind === 'loading'}>
        {paying && <span className={styles.spinner} aria-hidden="true" />}
        <span>{paying ? 'Processing…' : `Pay ${total}`}</span>
      </button>
      <p className={styles.fine}>One-off charge · Powered by Stripe · Link expires {expires}</p>
    </form>
  )
}
