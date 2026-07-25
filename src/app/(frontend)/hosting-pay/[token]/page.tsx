import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  hashOfferToken,
  formatMoney,
  type HostingInterval,
  type HostingQuote,
} from '@/lib/hosting-billing'

export const metadata = { robots: { index: false, follow: false }, title: 'Review hosting billing' }

type OfferSnapshot = {
  monthly: HostingQuote
  annual: HostingQuote
  selectedInterval?: HostingInterval
}

export default async function HostingPay({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payload = await getPayload({ config: await config })
  const result: any = await payload.find({
    collection: 'hosting-payment-offers',
    where: { tokenHash: { equals: hashOfferToken(token) } },
    limit: 1,
    overrideAccess: true,
  })
  const offer = result.docs[0]
  if (
    !offer ||
    !['active', 'checkout_pending'].includes(offer.status) ||
    new Date(offer.expiresAt) <= new Date()
  )
    return (
      <main>
        <h1>Payment link unavailable</h1>
        <p>
          This payment link has expired or is no longer available. Please contact your Optimise
          Digital representative.
        </p>
      </main>
    )

  const snapshot = offer.snapshot as OfferSnapshot
  const quotes = snapshot.selectedInterval
    ? [snapshot.selectedInterval === 'month' ? snapshot.monthly : snapshot.annual]
    : [snapshot.monthly, snapshot.annual]
  return (
    <main>
      <h1>Review your hosting billing</h1>
      <p>
        Review the recurring card payment before continuing to Stripe. Your service is not active
        until Stripe confirms payment.
      </p>
      <section aria-label="Hosting billing">
        {quotes.map((quote) => (
          <article key={quote.interval}>
            <h2>{quote.interval === 'month' ? 'Monthly' : 'Annual'} billing</h2>
            <p>{quote.planName}</p>
            <p>{quote.allowance}</p>
            <dl>
              <dt>Hosting fee</dt>
              <dd>{formatMoney(quote.baseCents, quote.currency)}</dd>
              <dt>Card processing surcharge</dt>
              <dd>{formatMoney(quote.surchargeCents, quote.currency)}</dd>
              <dt>Total charged each {quote.interval}</dt>
              <dd>{formatMoney(quote.totalCents, quote.currency)}</dd>
            </dl>
            <form action={`/api/hosting-pay/${token}/checkout`} method="post">
              <input type="hidden" name="interval" value={quote.interval} />
              <button type="submit">Continue to Stripe</button>
            </form>
          </article>
        ))}
      </section>
      <section>
        <h2>Renewal and capacity terms</h2>
        <p>
          Billing renews automatically each selected period until cancelled according to your
          agreement.
        </p>
        <p>{snapshot.monthly.clause}</p>
      </section>
    </main>
  )
}
