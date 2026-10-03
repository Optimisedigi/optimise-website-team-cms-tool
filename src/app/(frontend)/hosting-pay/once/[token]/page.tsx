import type { ReactNode } from 'react'
import { Geist, Geist_Mono } from 'next/font/google'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { formatMoney, hashOfferToken } from '@/lib/hosting-billing'
import type { OneOffSnapshot } from '@/lib/hosting-one-off-payment'
import { getStripePublishableKey } from '@/lib/stripe'
import { OneOffPaymentForm } from './OneOffPaymentForm'
import styles from './one-off-pay.module.css'

export const metadata = { robots: { index: false, follow: false }, title: 'Pay Optimise Digital' }

const sans = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--od-pay-sans',
})
const mono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--od-pay-mono' })
const ACCOUNTS_EMAIL = 'accounts@optimisedigital.online'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.page} ${sans.variable} ${mono.variable}`}>
      <header className={styles.topbar}>
        <img
          src="/brand/optimise-digital-logo.png"
          alt="Optimise Digital"
          width={219}
          height={29}
        />
        <div className={styles.secure}>
          <span className={styles.dot} aria-hidden="true" />
          Secure checkout
        </div>
      </header>
      {children}
    </div>
  )
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Shell>
      <main className={styles.notice}>
        <h1>{title}</h1>
        <p>{children}</p>
      </main>
    </Shell>
  )
}

export default async function OneOffPayment({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payload = await getPayload({ config: await config })
  const result: any = await payload.find({
    collection: 'hosting-one-off-payments',
    where: { tokenHash: { equals: hashOfferToken(token) } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const payment = result.docs[0]
  if (payment?.status === 'paid')
    return (
      <Notice title="Payment received">
        Thank you. This payment has been made, and your receipt was emailed to you.
      </Notice>
    )
  if (
    !payment ||
    !['active', 'checkout_pending'].includes(payment.status) ||
    new Date(payment.expiresAt) <= new Date()
  )
    return (
      <Notice title="Payment link unavailable">
        This payment link has expired or is no longer available. Please contact{' '}
        <a href={`mailto:${ACCOUNTS_EMAIL}`}>{ACCOUNTS_EMAIL}</a>.
      </Notice>
    )

  const snapshot = payment.snapshot as OneOffSnapshot
  const { quote } = snapshot
  const clientName =
    typeof payment.client === 'object' && payment.client?.name
      ? payment.client.name
      : snapshot.recipientName || 'your business'
  const total = formatMoney(quote.totalCents, quote.currency)
  const expires = new Date(payment.expiresAt).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const checkoutUrl = `/api/hosting-pay/once/${token}/checkout`
  // Without a publishable key the card can't be taken on this page, so the
  // button posts to Stripe's own hosted page instead.
  const publishableKey = getStripePublishableKey()

  return (
    <Shell>
      <main className={styles.wrap}>
        <section className={styles.summary} aria-label="Payment summary">
          <div>
            <h1 className={styles.client}>{clientName}</h1>
            <div className={styles.item}>{snapshot.description}</div>
            <div className={styles.amount}>{total}</div>
          </div>
          <dl className={styles.lines}>
            <div className={styles.line}>
              <dt>{snapshot.description}</dt>
              <dd className={styles.mono}>{formatMoney(quote.baseCents, quote.currency)}</dd>
            </div>
            {quote.surchargeCents > 0 && (
              <div className={styles.line}>
                <dt>Card processing surcharge</dt>
                <dd className={styles.mono}>{formatMoney(quote.surchargeCents, quote.currency)}</dd>
              </div>
            )}
            <div className={`${styles.line} ${styles.totalLine}`}>
              <dt>Total to pay</dt>
              <dd className={styles.mono}>{total}</dd>
            </div>
          </dl>
          <ul className={styles.notes}>
            <li className={styles.note}>
              <span className={styles.badge} aria-hidden="true">
                1
              </span>
              <span>
                <strong>One-off payment.</strong> Your card is charged once. It does not set up any
                recurring charge.
              </span>
            </li>
            <li className={styles.note}>
              <span className={styles.badge} aria-hidden="true">
                ✓
              </span>
              <span>Processed by Stripe. We never see or store your card details.</span>
            </li>
          </ul>
          <p className={styles.contact}>
            Questions about this payment? <a href={`mailto:${ACCOUNTS_EMAIL}`}>{ACCOUNTS_EMAIL}</a>
          </p>
        </section>

        <section className={styles.card} aria-label="Payment details">
          {publishableKey ? (
            <OneOffPaymentForm
              publishableKey={publishableKey}
              checkoutUrl={checkoutUrl}
              total={total}
              description={snapshot.description}
              expires={expires}
              receiptEmail={snapshot.recipientEmail}
            />
          ) : (
            <form className={styles.form} action={checkoutUrl} method="post">
              <h2 className={styles.heading}>Payment details</h2>
              <button type="submit" className={styles.pay}>
                Pay {total}
              </button>
              <p className={styles.fine}>
                One-off charge · Powered by Stripe · Link expires {expires}
              </p>
            </form>
          )}
        </section>
      </main>
    </Shell>
  )
}
