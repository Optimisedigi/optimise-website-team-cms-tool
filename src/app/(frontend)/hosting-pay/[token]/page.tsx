import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  hashOfferToken,
  formatMoney,
  type HostingInterval,
  type HostingQuote,
} from '@/lib/hosting-billing'
import { parseHostingAllowance } from '@/lib/hosting-allowance'
import { HostingIntervalChooser, type IntervalOption } from './HostingIntervalChooser'
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
  // The client always chooses monthly or annual; the admin's pick is only the default.
  const quotes = [snapshot.monthly, snapshot.annual].filter(
    (quote): quote is HostingQuote => Boolean(quote?.totalCents),
  )
  const plan = quotes[0]
  const yearOfMonthly = snapshot.monthly ? snapshot.monthly.totalCents * 12 : 0
  const options: IntervalOption[] = quotes.map((quote) => {
    const savingCents = quote.interval === 'year' ? yearOfMonthly - quote.totalCents : 0
    return {
      interval: quote.interval,
      hostingFee: formatMoney(quote.baseCents, quote.currency),
      surcharge: formatMoney(quote.surchargeCents, quote.currency),
      total: formatMoney(quote.totalCents, quote.currency),
      saving:
        savingCents > 0 ? `Save ${formatMoney(savingCents, quote.currency)} a year` : null,
    }
  })
  const allowance = parseHostingAllowance(plan?.allowance)
  const exclusions = allowance.exclusions?.match(/^([^:]+:)\s*([\s\S]*)$/)
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
          <article className={styles.reviewCard}>
            <header className={styles.plan}>
              <p className={styles.clientName}>{clientName}</p>
              <h2 className={styles.planName}>{plan?.planName}</h2>
              {allowance.intro && <p className={styles.allowanceIntro}>{allowance.intro}</p>}
              {allowance.items.length > 0 && (
                <ul className={styles.allowanceList}>
                  {allowance.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {allowance.exclusions && (
                <p className={styles.allowanceExclusions}>
                  {exclusions ? (
                    <>
                      <strong>{exclusions[1]}</strong> {exclusions[2]}
                    </>
                  ) : (
                    allowance.exclusions
                  )}
                </p>
              )}
            </header>
            <HostingIntervalChooser
              token={token}
              options={options}
              defaultInterval={snapshot.selectedInterval ?? 'month'}
            />
          </article>
        </section>

        <section className={styles.terms} aria-labelledby="hosting-terms-title">
          <h2 id="hosting-terms-title">Renewal and capacity terms</h2>
          <p>
            Monthly plans are debited automatically from your card on the 1st of every month.
            The first monthly payment is a pro-rata amount covering the days up to the 1st.
            Annual plans renew automatically each year on the date you sign up. Billing
            continues until cancelled according to your agreement.
          </p>
          <p>{plan?.clause}</p>
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
