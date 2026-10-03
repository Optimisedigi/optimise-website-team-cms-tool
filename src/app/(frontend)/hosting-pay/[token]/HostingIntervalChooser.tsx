'use client'

import { useState } from 'react'
import { EmbeddedCardPayment } from '../EmbeddedCardPayment'
import styles from './hosting-pay.module.css'

type Interval = 'month' | 'year'

/** Amounts arrive pre-formatted from the server so this bundle stays money-logic free. */
export type IntervalOption = Readonly<{
  interval: Interval
  hostingFee: string
  surcharge: string
  total: string
  saving: string | null
  /** When the client is charged, in plain words. */
  schedule: Readonly<{ headline: string; detail: string }>
}>

type Props = Readonly<{
  token: string
  options: readonly IntervalOption[]
  defaultInterval: Interval
  /** When set, the card form opens on this page instead of Stripe's own page. */
  publishableKey?: string | null
}>

const LABELS: Record<Interval, { title: string; per: string }> = {
  month: { title: 'Monthly', per: 'month' },
  year: { title: 'Annual', per: 'year' },
}

export function HostingIntervalChooser({ token, options, defaultInterval, publishableKey }: Props) {
  const [interval, setInterval] = useState<Interval>(
    options.some((option) => option.interval === defaultInterval)
      ? defaultInterval
      : (options[0]?.interval ?? 'month'),
  )
  // The checkout session is created for one interval, so the choice is locked
  // while the card form is open. "Back" unlocks it.
  const [paying, setPaying] = useState(false)
  const selected = options.find((option) => option.interval === interval) ?? options[0]
  if (!selected) return null

  const content = (
    <>
      <fieldset className={styles.chooser} disabled={paying}>
        <legend className={styles.chooserLegend}>Choose how you'd like to pay</legend>
        <div className={styles.chooserOptions}>
          {options.map((option) => (
            <label key={option.interval} className={styles.chooserOption}>
              <input
                type="radio"
                name="interval"
                value={option.interval}
                checked={option.interval === interval}
                onChange={() => setInterval(option.interval)}
              />
              <span className={styles.chooserTitle}>{LABELS[option.interval].title}</span>
              <span className={styles.chooserPrice}>
                {option.total}
                <span> / {LABELS[option.interval].per}</span>
              </span>
              {option.saving && <span className={styles.chooserSaving}>{option.saving}</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <dl className={styles.pricing}>
        <div className={styles.priceRow}>
          <dt>Hosting fee</dt>
          <dd>{selected.hostingFee}</dd>
        </div>
        <div className={styles.priceRow}>
          <dt>Card processing surcharge</dt>
          <dd>{selected.surcharge}</dd>
        </div>
        <div className={`${styles.priceRow} ${styles.totalRow}`}>
          <dt>Total charged each {LABELS[selected.interval].per}</dt>
          <dd>{selected.total}</dd>
        </div>
      </dl>

      <div className={styles.actionArea}>
        <div className={styles.debitNotice} role="note" aria-live="polite">
          <p>
            <strong>{selected.schedule.headline}</strong>
          </p>
          <p>{selected.schedule.detail}</p>
        </div>
        {publishableKey ? (
          <EmbeddedCardPayment
            publishableKey={publishableKey}
            checkoutUrl={`/api/hosting-pay/${token}/checkout`}
            request={{ interval: selected.interval }}
            payLabel="Set up card payment"
            successTitle="Hosting payments set up"
            successDetail="Thank you. Stripe will email your receipt, and payments continue automatically on the schedule above."
            onOpenChange={setPaying}
          />
        ) : (
          <button type="submit">
            Continue securely to Stripe
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </button>
        )}
        <p className={styles.securityNote}>
          {publishableKey
            ? 'Card details go straight to Stripe and are never stored by us.'
            : 'Payment details are entered securely on Stripe.'}
        </p>
      </div>
    </>
  )

  return publishableKey ? (
    <div>{content}</div>
  ) : (
    <form action={`/api/hosting-pay/${token}/checkout`} method="post">
      {content}
    </form>
  )
}
