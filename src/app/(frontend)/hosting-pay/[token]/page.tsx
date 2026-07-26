import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  hashOfferToken,
  formatMoney,
  type HostingInterval,
  type HostingQuote,
} from '@/lib/hosting-billing'
import styles from './hosting-pay.module.css'

export const metadata = { robots: { index: false, follow: false }, title: 'Review hosting billing' }

type OfferSnapshot = {
  monthly: HostingQuote
  annual: HostingQuote
  selectedInterval?: HostingInterval
  recipientName?: string
}

export default async function HostingPay({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payload = await getPayload({ config: await config })
  const result: any = await payload.find({
    collection: 'hosting-payment-offers',
    where: { tokenHash: { equals: hashOfferToken(token) } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const offer = result.docs[0]
  if (
    !offer ||
    !['active', 'checkout_pending'].includes(offer.status) ||
    new Date(offer.expiresAt) <= new Date()
  )
    return (
      <main className={styles.page}>
        <div className={`${styles.shell} ${styles.unavailable}`}>
          <a className={styles.brand} href="https://optimisedigital.com.au" aria-label="Optimise Digital">
            <img src="/Optimise-Digital-Logo-rocket-animation%20(larger%20file).gif" alt="Optimise Digital" />
          </a>
          <h1 className={styles.title}>Payment link unavailable</h1>
          <p className={styles.introduction}>
            This payment link has expired or is no longer available. Please contact your Optimise
            Digital representative.
          </p>
        </div>
      </main>
    )

  const snapshot = offer.snapshot as OfferSnapshot
  const quotes = snapshot.selectedInterval
    ? [snapshot.selectedInterval === 'month' ? snapshot.monthly : snapshot.annual]
    : [snapshot.monthly, snapshot.annual]
  const clientName =
    typeof offer.client === 'object' && offer.client?.name
      ? offer.client.name
      : snapshot.recipientName || 'your business'
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <a className={styles.brand} href="https://optimisedigital.com.au" aria-label="Optimise Digital">
          <img src="/Optimise-Digital-Logo-rocket-animation%20(larger%20file).gif" alt="Optimise Digital" />
        </a>
        <section aria-label="Hosting billing">
          {quotes.map((quote) => (
            <article className={styles.reviewCard} key={quote.interval}>
              <header className={styles.plan}>
                <p className={styles.clientName}>{clientName}</p>
                <p className={styles.interval}>
                  {quote.interval === 'month' ? 'Monthly billing' : 'Annual billing'}
                </p>
                <h2 className={styles.planName}>{quote.planName}</h2>
                <p className={styles.allowance}>{quote.allowance}</p>
              </header>
              <dl className={styles.pricing}>
                <div className={styles.priceRow}>
                  <dt>Hosting fee</dt>
                  <dd>{formatMoney(quote.baseCents, quote.currency)}</dd>
                </div>
                <div className={styles.priceRow}>
                  <dt>Card processing surcharge</dt>
                  <dd>{formatMoney(quote.surchargeCents, quote.currency)}</dd>
                </div>
                <div className={`${styles.priceRow} ${styles.totalRow}`}>
                  <dt>Total charged each {quote.interval}</dt>
                  <dd>{formatMoney(quote.totalCents, quote.currency)}</dd>
                </div>
              </dl>
              <div className={styles.actionArea}>
                <form action={`/api/hosting-pay/${token}/checkout`} method="post">
                  <input type="hidden" name="interval" value={quote.interval} />
                  <button type="submit">
                    Continue securely to Stripe
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <rect x="5" y="10" width="14" height="10" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                  </button>
                </form>
                <p className={styles.securityNote}>
                  Payment details are entered securely on Stripe.
                </p>
              </div>
            </article>
          ))}
        </section>

        <section className={styles.terms} aria-labelledby="hosting-terms-title">
          <h2 id="hosting-terms-title">Renewal and capacity terms</h2>
          <p>
            Billing renews automatically each selected period until cancelled according to your
            agreement.
          </p>
          <p>{snapshot.monthly.clause}</p>
        </section>
        <p className={styles.footer}>
          <a
            href="https://www.optimisedigital.online/terms"
            target="_blank"
            rel="noreferrer"
          >
            Optimise Digital hosting billing terms
          </a>
        </p>
      </div>
    </main>
  )
}
