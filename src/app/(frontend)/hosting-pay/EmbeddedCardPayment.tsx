'use client'

import { useEffect, useRef, useState } from 'react'
import { loadStripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js'
import styles from './[token]/hosting-pay.module.css'

type State =
  { kind: 'idle' } | { kind: 'open' } | { kind: 'complete' } | { kind: 'error'; message: string }

type Props = Readonly<{
  publishableKey: string
  /** The checkout route for this payment link. */
  checkoutUrl: string
  /** Extra fields for the checkout request, e.g. the chosen billing interval. */
  request?: Readonly<Record<string, string>>
  payLabel: string
  successTitle: string
  successDetail: string
  /** Lets the parent lock choices (e.g. the billing interval) while paying. */
  onOpenChange?: (open: boolean) => void
}>

const FALLBACK_ERROR = 'We could not load the payment form. Please try again in a minute.'

/**
 * Stripe's card form, embedded in the payment page so the client never leaves
 * it. Card details go straight to Stripe inside its own secure frame; this
 * page only receives a one-time session secret. Stripe's webhook still marks
 * the payment paid, so this success message is a courtesy, not the record.
 */
export function EmbeddedCardPayment({
  publishableKey,
  checkoutUrl,
  request,
  payLabel,
  successTitle,
  successDetail,
  onOpenChange,
}: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const container = useRef<HTMLDivElement>(null)
  const requestBody = JSON.stringify({ ...request, ui: 'embedded' })

  useEffect(() => {
    onOpenChange?.(state.kind === 'open' || state.kind === 'complete')
  }, [state.kind, onOpenChange])

  useEffect(() => {
    if (state.kind !== 'open') return
    let cancelled = false
    let checkout: StripeEmbeddedCheckout | null = null

    const fetchClientSecret = async (): Promise<string> => {
      const response = await fetch(checkoutUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      })
      const data = (await response.json().catch(() => ({}))) as {
        clientSecret?: unknown
        error?: unknown
      }
      if (!response.ok || typeof data.clientSecret !== 'string')
        throw new Error(typeof data.error === 'string' ? data.error : FALLBACK_ERROR)
      return data.clientSecret
    }

    const mount = async () => {
      try {
        const stripe = await loadStripe(publishableKey)
        if (!stripe) throw new Error(FALLBACK_ERROR)
        const instance = await stripe.createEmbeddedCheckoutPage({
          fetchClientSecret,
          onComplete: () => {
            if (!cancelled) setState({ kind: 'complete' })
          },
        })
        if (cancelled || !container.current) {
          instance.destroy()
          return
        }
        checkout = instance
        instance.mount(container.current)
      } catch (error) {
        if (!cancelled)
          setState({
            kind: 'error',
            message: error instanceof Error && error.message ? error.message : FALLBACK_ERROR,
          })
      }
    }
    void mount()

    return () => {
      cancelled = true
      checkout?.destroy()
    }
  }, [state.kind, checkoutUrl, requestBody, publishableKey])

  if (state.kind === 'complete') {
    return (
      <div className={styles.debitNotice} role="status">
        <p>
          <strong>{successTitle}</strong>
        </p>
        <p>{successDetail}</p>
      </div>
    )
  }

  if (state.kind === 'open') {
    return (
      <>
        <div ref={container} className={styles.embeddedCheckout} aria-label="Card payment form" />
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => setState({ kind: 'idle' })}
        >
          Back
        </button>
      </>
    )
  }

  return (
    <>
      {state.kind === 'error' && (
        <div className={styles.debitNotice} role="alert">
          <p>
            <strong>Payment form unavailable</strong>
          </p>
          <p>{state.message}</p>
        </div>
      )}
      <button type="button" onClick={() => setState({ kind: 'open' })}>
        {state.kind === 'error' ? 'Try again' : payLabel}
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </button>
    </>
  )
}
