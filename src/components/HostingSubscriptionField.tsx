'use client'

import { useAuth, useDocumentInfo, useField, useForm } from '@payloadcms/ui'
import { userHasFeature } from '@/lib/access'
import { HOSTING_OFFER_LINK_DAYS } from '@/lib/hosting-billing'
import type { HostingPayment, HostingPaymentsSummary } from '@/lib/hosting-payments'
import { HostingOneOffPayments } from './HostingOneOffPayments'
import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Plans are authored in dollars in the Hosting Billing Settings global; every
 * downstream store (client record, Stripe) works in cents, so convert on read.
 */
type HostingPlan = {
  name: string
  includedAllowance?: string | null
  monthlyPrice: number
  annualDiscountPercentage?: number | null
  active?: boolean | null
}

const toCents = (dollars: unknown) =>
  Math.round(Math.max(0, Number.isFinite(Number(dollars)) ? Number(dollars) : 0) * 100)

/** Annual price is always monthly x 12, less the plan's optional discount. */
const annualCentsFrom = (monthlyCents: number, discountPercentage?: number | null) => {
  const discount = Number(discountPercentage)
  const applied = Number.isFinite(discount) ? Math.min(Math.max(discount, 0), 100) : 0
  return Math.round(monthlyCents * 12 * (1 - applied / 100))
}

type OfferResult = { url: string; expiresAt: string; emailSent?: boolean; emailedTo?: string }
type OfferOutcome = { kind: 'emailed' | 'email_failed'; email: string; expiresAt: string }
type HistoryState =
  | { kind: 'idle' | 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: HostingPaymentsSummary }
const HISTORY_PREVIEW = 6
type StopAction = 'end_of_period' | 'immediately' | 'undo'
type StopResult = {
  subscriptionStatus: string
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
}
const CUSTOM_PLAN = '__custom__'

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Active',
  past_due: 'Payment overdue',
  unpaid: 'Unpaid',
  payment_failed: 'Last payment failed',
  incomplete: 'Awaiting first payment',
  incomplete_expired: 'First payment expired',
  canceled: 'Stopped',
  paused: 'Paused',
}

const STATUS_TONES: Record<string, 'ok' | 'warn' | 'bad' | 'off'> = {
  active: 'ok',
  trialing: 'ok',
  past_due: 'bad',
  unpaid: 'bad',
  payment_failed: 'bad',
  incomplete: 'warn',
  incomplete_expired: 'off',
  canceled: 'off',
  paused: 'off',
}

const money = (cents: number, currency = 'aud'): string =>
  (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: currency.toUpperCase() })

const wholeDollars = (cents: number): string => {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2)
}

const shortDate = (value: string | null, withYear = true): string =>
  value
    ? new Date(value).toLocaleDateString('en-AU', {
        timeZone: 'Australia/Sydney',
        day: 'numeric',
        month: 'short',
        ...(withYear ? { year: 'numeric' as const } : {}),
      })
    : ''

const monthLabel = (value: string | null): string =>
  value
    ? new Date(value).toLocaleDateString('en-AU', {
        timeZone: 'Australia/Sydney',
        month: 'short',
        year: 'numeric',
      })
    : ''

const periodLabel = (payment: HostingPayment): string => {
  if (!payment.periodStart || !payment.periodEnd) return ''
  return `${shortDate(payment.periodStart, false)} – ${shortDate(payment.periodEnd)}`
}

const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''

const STOP_CONFIRMATIONS: Record<StopAction, (endDate: string) => string> = {
  end_of_period: (endDate) =>
    `Stop hosting payments at the end of the current period${endDate ? ` (${endDate})` : ''}? The client will not be charged again.`,
  immediately: () =>
    'Stop hosting payments immediately? The subscription ends now and no refund is issued automatically. This cannot be undone.',
  undo: () => 'Undo the scheduled stop? Payments will continue as normal.',
}

export default function HostingSubscriptionField() {
  const { id } = useDocumentInfo()
  const { submit } = useForm()
  const { value: clientEmail } = useField<string>({ path: 'contactEmail' })
  const { value: clientContactName } = useField<string>({ path: 'contactName' })
  const { value: recipientName, setValue: setRecipientName } = useField<string>({
    path: 'hostingSubscription.recipientName',
  })
  const { value: planName, setValue: setPlanName } = useField<string>({
    path: 'hostingSubscription.planName',
  })
  const { setValue: setAllowance } = useField<string>({ path: 'hostingSubscription.allowance' })
  const { value: monthlyBaseCents, setValue: setMonthlyBaseCents } = useField<number>({
    path: 'hostingSubscription.monthlyBaseCents',
  })
  const { value: annualBaseCents, setValue: setAnnualBaseCents } = useField<number>({
    path: 'hostingSubscription.annualBaseCents',
  })
  const { value: recipientEmail, setValue: setRecipientEmail } = useField<string>({
    path: 'hostingSubscription.recipientEmail',
  })
  const { value: billingInterval, setValue: setBillingInterval } = useField<'month' | 'year'>({
    path: 'hostingSubscription.billingInterval',
  })
  const { value: billingStartDate, setValue: setBillingStartDate } = useField<string>({
    path: 'hostingSubscription.billingStartDate',
  })
  const [plans, setPlans] = useState<HostingPlan[]>([])
  const [currency, setCurrency] = useState('aud')
  const [plansLoading, setPlansLoading] = useState(true)
  const [customPlanSelected, setCustomPlanSelected] = useState(false)
  const [message, setMessage] = useState('')
  const [offerUrl, setOfferUrl] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const { value: stripeSubscriptionId } = useField<string>({
    path: 'hostingSubscription.stripeSubscriptionId',
  })
  const { value: subscriptionStatus, setValue: setSubscriptionStatus } = useField<string>({
    path: 'hostingSubscription.subscriptionStatus',
  })
  const { value: cancelAtPeriodEnd, setValue: setCancelAtPeriodEnd } = useField<boolean>({
    path: 'hostingSubscription.cancelAtPeriodEnd',
  })
  const { value: currentPeriodEnd, setValue: setCurrentPeriodEnd } = useField<string>({
    path: 'hostingSubscription.currentPeriodEnd',
  })
  const { user } = useAuth()
  const canStopPayments = userHasFeature(user, 'hosting-billing-settings')
  const [stopping, setStopping] = useState<StopAction | null>(null)
  const [stopMessage, setStopMessage] = useState('')
  const [offerOpen, setOfferOpen] = useState(false)
  const [offerOutcome, setOfferOutcome] = useState<OfferOutcome | null>(null)
  const [history, setHistory] = useState<HistoryState>({ kind: 'idle' })
  const [historyReload, setHistoryReload] = useState(0)
  const [showAllPayments, setShowAllPayments] = useState(false)
  const [priceOpen, setPriceOpen] = useState(false)
  const [newMonthly, setNewMonthly] = useState('')
  const [priceReason, setPriceReason] = useState('')
  const [priceBusy, setPriceBusy] = useState(false)
  const [priceMessage, setPriceMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/globals/hosting-billing-settings?depth=0', {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error('Plan lookup failed')),
      )
      .then((settings) => {
        setPlans((settings.plans || []).filter((plan: HostingPlan) => plan.active !== false))
        if (typeof settings.currency === 'string' && settings.currency)
          setCurrency(settings.currency)
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage('Standard plans could not be loaded. You can still enter a custom plan.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlansLoading(false)
      })
    return () => controller.abort()
  }, [])

  // Seed from the main client contact once. A billing contact can be different,
  // so never overwrite an email an admin has deliberately entered here.
  useEffect(() => {
    if (!recipientEmail && clientEmail) setRecipientEmail(clientEmail)
  }, [clientEmail, recipientEmail, setRecipientEmail])
  useEffect(() => {
    if (!recipientName && clientContactName) setRecipientName(clientContactName)
  }, [clientContactName, recipientName, setRecipientName])

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.name === planName),
    [planName, plans],
  )
  const selectedPlanValue =
    customPlanSelected || (planName && !selectedPlan) ? CUSTOM_PLAN : selectedPlan?.name || ''
  const monthlyFee = Number(monthlyBaseCents || 0) / 100
  const annualDiscount = Number(selectedPlan?.annualDiscountPercentage || 0)
  const annualSummary =
    Number(annualBaseCents || 0) > 0
      ? `Annual: ${(Number(annualBaseCents) / 100).toLocaleString('en-AU', {
          style: 'currency',
          currency: currency.toUpperCase(),
        })}${annualDiscount > 0 ? ` (${annualDiscount}% off)` : ''}`
      : ''

  const selectPlan = (name: string) => {
    if (name === CUSTOM_PLAN) {
      setCustomPlanSelected(true)
      setPlanName('')
      setAllowance('')
      return
    }
    setCustomPlanSelected(false)
    const plan = plans.find((entry) => entry.name === name)
    setPlanName(name)
    if (plan) {
      setAllowance(plan.includedAllowance || '')
      const monthlyCents = toCents(plan.monthlyPrice)
      setMonthlyBaseCents(monthlyCents)
      setAnnualBaseCents(annualCentsFrom(monthlyCents, plan.annualDiscountPercentage))
    }
  }

  const updateMonthlyFee = (amount: number) => {
    const cents = Math.max(0, Math.round((Number.isFinite(amount) ? amount : 0) * 100))
    setMonthlyBaseCents(cents)
    setAnnualBaseCents(annualCentsFrom(cents, selectedPlan?.annualDiscountPercentage))
  }

  const createOffer = async () => {
    if (
      !id ||
      !window.confirm(
        `Email a hosting sign-up link to ${recipientEmail}? The link works for ${HOSTING_OFFER_LINK_DAYS} days. Billing follows the option the client picks (monthly or annual). This replaces any current offer.`,
      )
    )
      return
    setCreating(true)
    setOfferOutcome(null)
    setMessage('Saving client details…')
    try {
      await submit()
      setMessage('Creating offer…')
      const response = await fetch(`/api/clients/${id}/hosting-offers`, {
        method: 'POST',
        credentials: 'include',
      })
      const result = (await response.json().catch(() => ({}))) as Partial<OfferResult> & {
        error?: string
      }
      if (!response.ok || !result.url)
        throw new Error(result.error || 'Could not create the hosting offer.')
      setOfferUrl(result.url)
      setLinkCopied(false)
      setOfferOutcome({
        kind: result.emailSent ? 'emailed' : 'email_failed',
        email: result.emailedTo || recipientEmail || '',
        expiresAt: result.expiresAt || '',
      })
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create the hosting offer.')
    } finally {
      setCreating(false)
    }
  }

  const copyOfferUrl = async () => {
    try {
      await navigator.clipboard.writeText(offerUrl)
      setLinkCopied(true)
    } catch {
      setMessage(`Could not copy automatically. The payment link is: ${offerUrl}`)
    }
  }

  const stopPayments = async (action: StopAction) => {
    if (!id || !window.confirm(STOP_CONFIRMATIONS[action](formatDate(currentPeriodEnd)))) return
    setStopping(action)
    setStopMessage('Updating Stripe…')
    try {
      const response = await fetch(`/api/clients/${id}/hosting-subscription/stop`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = (await response.json().catch(() => ({}))) as Partial<StopResult> & {
        error?: string
      }
      if (!response.ok) throw new Error(result.error || 'Could not update the subscription.')
      // Keep form state in step with the saved record so a later Save does not
      // write the old subscription state back.
      setSubscriptionStatus(result.subscriptionStatus)
      setCancelAtPeriodEnd(Boolean(result.cancelAtPeriodEnd))
      if (result.currentPeriodEnd) setCurrentPeriodEnd(result.currentPeriodEnd)
      setStopMessage(
        action === 'undo'
          ? 'Scheduled stop removed. Payments will continue.'
          : action === 'immediately'
            ? 'Payments stopped. The subscription has ended.'
            : `Payments will stop on ${formatDate(result.currentPeriodEnd)}.`,
      )
    } catch (error) {
      setStopMessage(error instanceof Error ? error.message : 'Could not update the subscription.')
    } finally {
      setStopping(null)
    }
  }

  // Payment history comes from Stripe via the CMS; aborted on unmount or reload.
  useEffect(() => {
    if (!id || !stripeSubscriptionId) {
      setHistory({ kind: 'idle' })
      return
    }
    const controller = new AbortController()
    setHistory({ kind: 'loading' })
    fetch(`/api/clients/${id}/hosting-payments`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as Partial<HostingPaymentsSummary> & {
          error?: string
        }
        if (!response.ok) throw new Error(data.error || 'Payment history could not be loaded.')
        const payments = Array.isArray(data.payments) ? data.payments : []
        setHistory({
          kind: 'ready',
          data: {
            payments,
            count: Number(data.count ?? payments.length),
            totalPaidCents: Number(data.totalPaidCents ?? 0),
          },
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setHistory({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Payment history could not be loaded.',
        })
      })
    return () => controller.abort()
  }, [id, stripeSubscriptionId, historyReload])

  const retryHistory = useCallback(() => setHistoryReload((n) => n + 1), [])

  const changePrice = async () => {
    const dollars = Number(newMonthly)
    if (!id || !currentPeriodEnd || !(dollars > 0)) return
    const cents = Math.round(dollars * 100)
    const annual = annualCentsFrom(cents, selectedPlan?.annualDiscountPercentage)
    if (
      !window.confirm(
        `Change the hosting price to ${money(cents, currency)} a month (${money(annual, currency)} a year) from the renewal on ${formatDate(currentPeriodEnd)}? The client is emailed about the change.`,
      )
    )
      return
    setPriceBusy(true)
    setPriceMessage('Scheduling price change…')
    try {
      const response = await fetch(`/api/clients/${id}/hosting-price-changes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          effectiveAt: currentPeriodEnd,
          monthlyBaseCents: cents,
          annualBaseCents: annual,
          reason: priceReason,
        }),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Could not schedule the price change.')
      setPriceMessage(`Price change scheduled for ${formatDate(currentPeriodEnd)}.`)
      setPriceOpen(false)
      setNewMonthly('')
      setPriceReason('')
    } catch (error) {
      setPriceMessage(
        error instanceof Error ? error.message : 'Could not schedule the price change.',
      )
    } finally {
      setPriceBusy(false)
    }
  }

  const isStopped = subscriptionStatus === 'canceled'
  const statusLabel = isStopped
    ? 'Stopped'
    : cancelAtPeriodEnd
      ? `Stopping on ${formatDate(currentPeriodEnd)}`
      : STATUS_LABELS[subscriptionStatus || ''] || subscriptionStatus || 'Unknown'
  const statusTone = isStopped
    ? 'off'
    : cancelAtPeriodEnd
      ? 'warn'
      : STATUS_TONES[subscriptionStatus || ''] || 'off'
  const hasSubscription = Boolean(stripeSubscriptionId)
  const canCreateOffer = Boolean(
    id && planName && recipientEmail && monthlyBaseCents && billingInterval && !creating,
  )
  const historyData = history.kind === 'ready' ? history.data : null
  const visiblePayments = historyData
    ? showAllPayments
      ? historyData.payments
      : historyData.payments.slice(0, HISTORY_PREVIEW)
    : []
  const historyCurrency = historyData?.payments[0]?.currency || currency
  const oldestPayment = historyData?.payments[historyData.payments.length - 1]
  const firstMonth = monthLabel(oldestPayment?.periodStart || oldestPayment?.paidAt || null)
  const recipientLine = [recipientName, recipientEmail].filter(Boolean).join(' · ')

  return (
    <div className="od-hosting">
      {!offerOpen && (
        <div className="od-hosting__header-action">
          <button
            type="button"
            className="od-hosting__btn od-hosting__btn--primary"
            onClick={() => setOfferOpen(true)}
            aria-expanded={false}
            aria-controls="od-hosting-offer"
          >
            + New subscription
          </button>
        </div>
      )}

      {offerOpen && (
        <div className="od-hosting__offer" id="od-hosting-offer">
          <div className="od-hosting__offer-head">
            <b className="od-hosting__offer-title">New hosting offer</b>
            <button
              type="button"
              className="od-hosting__link-btn"
              onClick={() => setOfferOpen(false)}
            >
              Cancel
            </button>
          </div>
          <div className="od-hosting__fields">
            <div className="od-hosting__field">
              <label htmlFor="hosting-plan" className="od-hosting__label">
                Plan
              </label>
              <select
                id="hosting-plan"
                className="od-hosting__select"
                value={selectedPlanValue}
                disabled={plansLoading}
                onChange={(event) => selectPlan(event.target.value)}
              >
                <option value="">Select a plan</option>
                {plans.map((plan) => (
                  <option key={plan.name} value={plan.name}>
                    {plan.name}
                  </option>
                ))}
                <option value={CUSTOM_PLAN}>Custom plan</option>
              </select>
              {selectedPlanValue === CUSTOM_PLAN && (
                <input
                  className="od-hosting__input"
                  aria-label="Custom plan name"
                  placeholder="Custom plan name"
                  value={planName || ''}
                  onChange={(event) => setPlanName(event.target.value)}
                />
              )}
            </div>
            <div className="od-hosting__field">
              <label htmlFor="hosting-monthly-fee" className="od-hosting__label">
                Monthly fee
              </label>
              <span className="od-hosting__money">
                <span className="od-hosting__money-prefix" aria-hidden="true">
                  $
                </span>
                <input
                  id="hosting-monthly-fee"
                  className="od-hosting__input od-hosting__input--money"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={monthlyFee || ''}
                  onChange={(event) => updateMonthlyFee(event.target.valueAsNumber)}
                  aria-describedby={annualSummary ? 'hosting-annual-help' : undefined}
                />
              </span>
              {annualSummary && (
                <span id="hosting-annual-help" className="od-hosting__hint">
                  {annualSummary}
                </span>
              )}
            </div>
            <div className="od-hosting__field">
              <label htmlFor="hosting-billing-interval" className="od-hosting__label">
                Default billing
              </label>
              <select
                id="hosting-billing-interval"
                className="od-hosting__select"
                value={billingInterval || ''}
                onChange={(event) => setBillingInterval(event.target.value as 'month' | 'year')}
                aria-describedby="hosting-billing-interval-help"
              >
                <option value="">Select an option</option>
                <option value="month">Monthly</option>
                <option value="year">Annual</option>
              </select>
              <span id="hosting-billing-interval-help" className="od-hosting__hint">
                Client can switch on the payment page
              </span>
            </div>
            <div className="od-hosting__field">
              <label htmlFor="hosting-billing-start-date" className="od-hosting__label">
                Billing start
              </label>
              <input
                id="hosting-billing-start-date"
                className="od-hosting__input od-hosting__input--date"
                type="date"
                value={billingStartDate || ''}
                onChange={(event) => setBillingStartDate(event.target.value || null)}
                aria-describedby="hosting-billing-start-help"
              />
              <span id="hosting-billing-start-help" className="od-hosting__hint">
                Blank = the day they sign up
              </span>
            </div>
            <div className="od-hosting__field">
              <label htmlFor="hosting-recipient-email" className="od-hosting__label">
                Send link to
              </label>
              <input
                id="hosting-recipient-email"
                className="od-hosting__input"
                type="email"
                value={recipientEmail || ''}
                onChange={(event) => setRecipientEmail(event.target.value)}
                aria-describedby="hosting-recipient-help"
              />
              <span id="hosting-recipient-help" className="od-hosting__hint">
                Defaults to the primary contact
              </span>
            </div>
            <div className="od-hosting__field">
              <label htmlFor="hosting-recipient-name" className="od-hosting__label">
                Recipient name
              </label>
              <input
                id="hosting-recipient-name"
                className="od-hosting__input"
                value={recipientName || ''}
                maxLength={120}
                onChange={(event) => setRecipientName(event.target.value)}
                aria-describedby="hosting-recipient-name-help"
              />
              <span id="hosting-recipient-name-help" className="od-hosting__hint">
                Emails greet them by first name
              </span>
            </div>
          </div>

          {offerOutcome?.kind === 'emailed' ? (
            <div className="od-hosting__banner od-hosting__banner--success" role="status" aria-label="Hosting offer result">
              <b className="od-hosting__banner-text">
                Offer emailed to {offerOutcome.email}. Expires{' '}
                {shortDate(offerOutcome.expiresAt, false)}.
              </b>
              <button type="button" className="od-hosting__btn" onClick={copyOfferUrl}>
                {linkCopied ? 'Link copied' : 'Copy payment link'}
              </button>
            </div>
          ) : offerOutcome?.kind === 'email_failed' ? (
            <div className="od-hosting__banner od-hosting__banner--warn" role="status" aria-label="Hosting offer result">
              <b className="od-hosting__banner-text">
                Offer created, but the email could not be sent. Copy the payment link and send it
                to the client yourself. Expires {shortDate(offerOutcome.expiresAt, false)}.
              </b>
              <button type="button" className="od-hosting__btn" onClick={copyOfferUrl}>
                {linkCopied ? 'Link copied' : 'Copy payment link'}
              </button>
            </div>
          ) : (
            <div className="od-hosting__offer-actions">
              <button
                type="button"
                className="od-hosting__btn od-hosting__btn--primary"
                disabled={!canCreateOffer}
                onClick={createOffer}
              >
                {creating ? 'Creating offer…' : 'Create offer & email link'}
              </button>
              <span className="od-hosting__hint">
                {id
                  ? `The link expires after ${HOSTING_OFFER_LINK_DAYS} days and replaces any open offer.`
                  : 'Save this client before creating a hosting offer.'}
              </span>
            </div>
          )}
          {offerUrl && (
            <a className="od-hosting__link" href={offerUrl} target="_blank" rel="noreferrer">
              Open client payment link
            </a>
          )}
          <p
            className="od-hosting__status-msg"
            role="status"
            aria-live="polite"
            aria-label="Hosting offer status"
          >
            {message}
          </p>
        </div>
      )}

      <div className="od-hosting__body">
        {!hasSubscription ? (
          <p className="od-hosting__empty">
            No hosting subscription yet. Use New subscription to email the client a payment link.
          </p>
        ) : (
          <>
            <dl className="od-hosting__summary" aria-label="Current subscription">
              <div className="od-hosting__cell">
                <dt className="od-hosting__cell-label">Status</dt>
                <dd className="od-hosting__cell-value od-hosting__cell-value--status">
                  <span className={`od-hosting__dot od-hosting__dot--${statusTone}`} aria-hidden="true" />
                  {statusLabel}
                </dd>
              </div>
              <div className="od-hosting__cell">
                <dt className="od-hosting__cell-label">Plan</dt>
                <dd className="od-hosting__cell-value">
                  {planName || 'Custom'}
                  {monthlyBaseCents ? ` · $${wholeDollars(Number(monthlyBaseCents))}/mo` : ''}
                </dd>
              </div>
              <div className="od-hosting__cell">
                <dt className="od-hosting__cell-label">
                  {cancelAtPeriodEnd ? 'Paid until' : 'Next payment'}
                </dt>
                <dd className="od-hosting__cell-value">
                  {!isStopped && currentPeriodEnd ? shortDate(currentPeriodEnd) : '—'}
                </dd>
              </div>
              <div className="od-hosting__cell">
                <dt className="od-hosting__cell-label">Months paid</dt>
                <dd className="od-hosting__cell-value">
                  {historyData ? historyData.count : '—'}
                  {historyData && historyData.count > 0 && firstMonth && (
                    <span className="od-hosting__muted"> since {firstMonth}</span>
                  )}
                </dd>
              </div>
              <div className="od-hosting__cell">
                <dt className="od-hosting__cell-label">Total paid</dt>
                <dd className="od-hosting__cell-value od-hosting__cell-value--total">
                  {historyData ? money(historyData.totalPaidCents, historyCurrency) : '—'}
                </dd>
              </div>
            </dl>

            <section className="od-hosting__group" aria-labelledby="od-hosting-history-title">
              <div className="od-hosting__group-head">
                <h3 id="od-hosting-history-title" className="od-hosting__group-title">
                  Payment history
                </h3>
                {recipientLine && (
                  <span className="od-hosting__recipient">Recipient: {recipientLine}</span>
                )}
              </div>
              <div className="od-hosting__table">
                <div className="od-hosting__tr od-hosting__tr--head od-hosting__tr--history" role="presentation">
                  <span>Month</span>
                  <span>Period</span>
                  <span>Status</span>
                  <span className="od-hosting__num">Amount</span>
                </div>
                {(history.kind === 'loading' || history.kind === 'idle') && (
                  <p className="od-hosting__table-note" role="status">
                    Loading payments…
                  </p>
                )}
                {history.kind === 'error' && (
                  <div className="od-hosting__table-note od-hosting__table-note--error" role="alert">
                    <span>{history.message}</span>
                    <button type="button" className="od-hosting__btn" onClick={retryHistory}>
                      Retry
                    </button>
                  </div>
                )}
                {historyData && historyData.count === 0 && (
                  <p className="od-hosting__table-note">No payments yet</p>
                )}
                {visiblePayments.map((payment) => (
                  <div key={payment.invoiceId} className="od-hosting__tr od-hosting__tr--history">
                    <span className="od-hosting__strong">
                      {monthLabel(payment.periodStart || payment.paidAt)}
                    </span>
                    <span className="od-hosting__soft">{periodLabel(payment)}</span>
                    <span>
                      <span className="od-hosting__pill od-hosting__pill--paid">Paid</span>
                    </span>
                    <span className="od-hosting__num">
                      {money(payment.amountPaidCents, payment.currency)}
                    </span>
                  </div>
                ))}
                {historyData && historyData.count > 0 && (
                  <div className="od-hosting__table-foot">
                    {historyData.count > HISTORY_PREVIEW ? (
                      <button
                        type="button"
                        className="od-hosting__foot-toggle"
                        onClick={() => setShowAllPayments((value) => !value)}
                      >
                        {showAllPayments
                          ? `Show latest ${HISTORY_PREVIEW}`
                          : `Show all ${historyData.count} payments`}
                      </button>
                    ) : (
                      <span className="od-hosting__foot-spacer" />
                    )}
                    <span className="od-hosting__foot-total">
                      {historyData.count} months · Total
                      <b>{money(historyData.totalPaidCents, historyCurrency)}</b>
                    </span>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {id && canStopPayments && (
          <HostingOneOffPayments
            clientId={id}
            recipientEmail={recipientEmail || ''}
            currency={currency}
            saveClient={submit}
          />
        )}

        {hasSubscription && !isStopped && canStopPayments && (
          <>
            {priceOpen && (
              <div className="od-hosting__inline-panel">
                <div className="od-hosting__fields">
                  <div className="od-hosting__field">
                    <label htmlFor="hosting-new-monthly" className="od-hosting__label">
                      New monthly fee
                    </label>
                    <span className="od-hosting__money">
                      <span className="od-hosting__money-prefix" aria-hidden="true">
                        $
                      </span>
                      <input
                        id="hosting-new-monthly"
                        className="od-hosting__input od-hosting__input--money"
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        value={newMonthly}
                        onChange={(event) => setNewMonthly(event.target.value)}
                      />
                    </span>
                    <span className="od-hosting__hint">
                      Takes effect at the renewal on {formatDate(currentPeriodEnd)}
                    </span>
                  </div>
                  <div className="od-hosting__field">
                    <label htmlFor="hosting-price-reason" className="od-hosting__label">
                      Reason
                    </label>
                    <input
                      id="hosting-price-reason"
                      className="od-hosting__input"
                      value={priceReason}
                      maxLength={300}
                      onChange={(event) => setPriceReason(event.target.value)}
                    />
                    <span className="od-hosting__hint">Included in the client email</span>
                  </div>
                </div>
                <div className="od-hosting__offer-actions">
                  <button
                    type="button"
                    className="od-hosting__btn od-hosting__btn--primary"
                    disabled={priceBusy || !(Number(newMonthly) > 0) || !currentPeriodEnd}
                    onClick={changePrice}
                  >
                    {priceBusy ? 'Scheduling…' : 'Schedule price change'}
                  </button>
                  <button
                    type="button"
                    className="od-hosting__link-btn"
                    onClick={() => setPriceOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="od-hosting__footer">
              <button
                type="button"
                className="od-hosting__btn"
                aria-expanded={priceOpen}
                onClick={() => setPriceOpen((value) => !value)}
              >
                Change price
              </button>
              <span className="od-hosting__spacer" />
              {cancelAtPeriodEnd ? (
                <button
                  type="button"
                  className="od-hosting__btn"
                  disabled={stopping !== null}
                  onClick={() => stopPayments('undo')}
                >
                  {stopping === 'undo' ? 'Updating…' : 'Undo scheduled stop'}
                </button>
              ) : (
                <button
                  type="button"
                  className="od-hosting__btn"
                  disabled={stopping !== null}
                  onClick={() => stopPayments('end_of_period')}
                >
                  {stopping === 'end_of_period' ? 'Updating…' : 'Stop at end of period'}
                </button>
              )}
              <button
                type="button"
                className="od-hosting__btn od-hosting__btn--danger"
                disabled={stopping !== null}
                onClick={() => stopPayments('immediately')}
              >
                {stopping === 'immediately' ? 'Stopping…' : 'Stop immediately'}
              </button>
            </div>
          </>
        )}
        {(stopMessage || priceMessage) && (
          <p className="od-hosting__status-msg" role="status" aria-live="polite">
            {[stopMessage, priceMessage].filter(Boolean).join(' ')}
          </p>
        )}
      </div>
    </div>
  )
}
