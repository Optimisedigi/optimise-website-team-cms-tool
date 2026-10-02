import { getPayload } from 'payload'
import config from '@/payload.config'
import { formatMoney, hashOfferToken } from '@/lib/hosting-billing'
import type { OneOffSnapshot } from '@/lib/hosting-one-off-payment'
import styles from '../../[token]/hosting-pay.module.css'

export const metadata = { robots: { index: false, follow: false }, title: 'Hosting payment' }

function Brand() {
  return (
    <a className={styles.brand} href="https://optimisedigital.com.au" aria-label="Optimise Digital">
      <img
        src="/Optimise-Digital-Logo-rocket-animation%20(larger%20file).gif"
        alt="Optimise Digital"
      />
    </a>
  )
}

function Notice({ title, children }: { title: string; children: string }) {
  return (
    <main className={styles.page}>
      <div className={`${styles.shell} ${styles.unavailable}`}>
        <Brand />
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.introduction}>{children}</p>
      </div>
    </main>
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
        This payment link has expired or is no longer available. Please contact your Optimise
        Digital representative.
      </Notice>
    )

  const snapshot = payment.snapshot as OneOffSnapshot
  const { quote } = snapshot
  const clientName =
    typeof payment.client === 'object' && payment.client?.name
      ? payment.client.name
      : snapshot.recipientName || 'your business'

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Brand />
        <section aria-label="Hosting payment">
          <article className={styles.reviewCard}>
            <header className={styles.plan}>
              <p className={styles.clientName}>{clientName}</p>
              <h2 className={styles.planName}>{snapshot.description}</h2>
            </header>
            <form action={`/api/hosting-pay/once/${token}/checkout`} method="post">
              <dl className={styles.pricing}>
                <div className={styles.priceRow}>
                  <dt>Amount</dt>
                  <dd>{formatMoney(quote.baseCents, quote.currency)}</dd>
                </div>
                {quote.surchargeCents > 0 && (
                  <div className={styles.priceRow}>
                    <dt>Card processing surcharge</dt>
                    <dd>{formatMoney(quote.surchargeCents, quote.currency)}</dd>
                  </div>
                )}
                <div className={`${styles.priceRow} ${styles.totalRow}`}>
                  <dt>Total to pay</dt>
                  <dd>{formatMoney(quote.totalCents, quote.currency)}</dd>
                </div>
              </dl>
              <div className={styles.actionArea}>
                <div className={styles.debitNotice} role="note">
                  <p>
                    <strong>This is a one-off payment.</strong>
                  </p>
                  <p>Your card is charged once. It does not set up any recurring charge.</p>
                </div>
                <button type="submit">
                  Continue securely to Stripe
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <rect x="5" y="10" width="14" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                </button>
                <p className={styles.securityNote}>
                  Payment details are entered securely on Stripe.
                </p>
              </div>
            </form>
          </article>
        </section>
      </div>
    </main>
  )
}
