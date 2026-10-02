'use client'

import { Button, useAuth, useDocumentInfo, useField, useForm } from '@payloadcms/ui'
import { userHasFeature } from '@/lib/access'
import { HostingOneOffPayments } from './HostingOneOffPayments'
import { useEffect, useMemo, useState } from 'react'
import './HostingSubscriptionField.css'

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

const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
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

  useEffect(() => {
    fetch('/api/globals/hosting-billing-settings?depth=0', { credentials: 'include' })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error('Plan lookup failed')),
      )
      .then((settings) => {
        setPlans((settings.plans || []).filter((plan: HostingPlan) => plan.active !== false))
        if (typeof settings.currency === 'string' && settings.currency) setCurrency(settings.currency)
      })
      .catch(() =>
        setMessage('Standard plans could not be loaded. You can still enter a custom plan.'),
      )
      .finally(() => setPlansLoading(false))
  }, [])

  // Seed from the main client contact once. A billing contact can be different,
  // so never overwrite an email an admin has deliberately entered here.
  useEffect(() => {
    if (!recipientEmail && clientEmail) setRecipientEmail(clientEmail)
  }, [clientEmail, recipientEmail, setRecipientEmail])

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
          currency: 'AUD',
        })}${annualDiscount > 0 ? ` (${annualDiscount}% annual discount applied)` : ''}`
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
        `Create a seven-day hosting payment offer and email the payment link to ${recipientEmail}? This revokes any current offer.`,
      )
    )
      return
    setCreating(true)
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
      const expires = new Date(result.expiresAt!).toLocaleString()
      setMessage(
        result.emailSent
          ? `Offer created and emailed to ${result.emailedTo}. It expires ${expires}.`
          : `Offer created, but the email could not be sent. Use Copy payment link below and send it to the client yourself. It expires ${expires}.`,
      )
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

  const isStopped = subscriptionStatus === 'canceled'
  const statusLabel = isStopped
    ? 'Stopped'
    : cancelAtPeriodEnd
      ? `Stopping on ${formatDate(currentPeriodEnd)}`
      : STATUS_LABELS[subscriptionStatus || ''] || subscriptionStatus || 'Unknown'

  return (
    <section className="hosting-subscription-field" aria-labelledby="hosting-subscription-heading">
      <header className="hosting-subscription-field__header">
        <h2 id="hosting-subscription-heading">Hosting subscription</h2>
        <p>Set the plan and billing contact, then create a payment link for the client.</p>
      </header>
      <div className="hosting-subscription-field__grid">
        <div className="hosting-subscription-field__control">
          <label htmlFor="hosting-plan">Plan name</label>
          <select
            id="hosting-plan"
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
              aria-label="Custom plan name"
              placeholder="Custom plan name"
              value={planName || ''}
              onChange={(event) => setPlanName(event.target.value)}
            />
          )}
        </div>
        <div className="hosting-subscription-field__control">
          <label htmlFor="hosting-monthly-fee">Monthly fee</label>
          <input
            id="hosting-monthly-fee"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={monthlyFee || ''}
            onChange={(event) => updateMonthlyFee(event.target.valueAsNumber)}
            aria-describedby={annualSummary ? 'hosting-annual-help' : undefined}
          />
          {annualSummary && <span id="hosting-annual-help">{annualSummary}</span>}
        </div>
        <div className="hosting-subscription-field__control">
          <label htmlFor="hosting-recipient-email">Recipient email</label>
          <input
            id="hosting-recipient-email"
            type="email"
            value={recipientEmail || ''}
            onChange={(event) => setRecipientEmail(event.target.value)}
            aria-describedby="hosting-recipient-help"
          />
          <span id="hosting-recipient-help">
            Starts with the client contact email. Change it to send this billing link to another recipient.
          </span>
        </div>
        <div className="hosting-subscription-field__control">
          <label htmlFor="hosting-billing-interval">Default billing option</label>
          <select
            id="hosting-billing-interval"
            value={billingInterval || ''}
            onChange={(event) => setBillingInterval(event.target.value as 'month' | 'year')}
            aria-describedby="hosting-billing-interval-help"
          >
            <option value="">Select an option</option>
            <option value="month">Monthly</option>
            <option value="year">Annual</option>
          </select>
          <span id="hosting-billing-interval-help">
            Preselected on the payment page. The client can switch between monthly and annual.
            Annual clients see only the annual price in the payment link email.
          </span>
        </div>
        <div className="hosting-subscription-field__control">
          <label htmlFor="hosting-billing-start-date">Billing start date</label>
          <input
            id="hosting-billing-start-date"
            type="date"
            value={billingStartDate || ''}
            onChange={(event) => setBillingStartDate(event.target.value || null)}
            aria-describedby="hosting-billing-start-help"
          />
          <span id="hosting-billing-start-help">
            The day work starts. The first full payment and every renewal fall on this date, each
            month or each year. Leave blank to start billing on the day the client signs up. A
            future date means nothing is charged until then.
          </span>
        </div>
      </div>
      <div className="hosting-subscription-field__actions">
        {!id && <p>Save this client before creating a hosting offer.</p>}
        <Button
          type="button"
          size="small"
          disabled={
            !id || !planName || !recipientEmail || !monthlyBaseCents || !billingInterval || creating
          }
          onClick={createOffer}
        >
          {creating ? 'Creating offer…' : 'Create hosting offer'}
        </Button>
        {offerUrl && (
          <>
            <a href={offerUrl} target="_blank" rel="noreferrer">
              Open client payment link
            </a>
            <Button type="button" size="small" buttonStyle="secondary" onClick={copyOfferUrl}>
              {linkCopied ? 'Link copied' : 'Copy payment link'}
            </Button>
          </>
        )}
      </div>
      <p role="status" aria-live="polite" aria-label="Hosting offer status">
        {message}
      </p>

      {stripeSubscriptionId && (
        <div className="hosting-subscription-field__subscription">
          <h3>Current subscription</h3>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{statusLabel}</dd>
            </div>
            {!isStopped && currentPeriodEnd && (
              <div>
                <dt>{cancelAtPeriodEnd ? 'Paid until' : 'Next payment'}</dt>
                <dd>{formatDate(currentPeriodEnd)}</dd>
              </div>
            )}
          </dl>
          {!isStopped && canStopPayments && (
            <div className="hosting-subscription-field__actions">
              {cancelAtPeriodEnd ? (
                <Button
                  type="button"
                  size="small"
                  buttonStyle="secondary"
                  disabled={stopping !== null}
                  onClick={() => stopPayments('undo')}
                >
                  {stopping === 'undo' ? 'Updating…' : 'Undo scheduled stop'}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="small"
                  buttonStyle="secondary"
                  disabled={stopping !== null}
                  onClick={() => stopPayments('end_of_period')}
                >
                  {stopping === 'end_of_period' ? 'Updating…' : 'Stop at end of current period'}
                </Button>
              )}
              <Button
                type="button"
                size="small"
                buttonStyle="error"
                disabled={stopping !== null}
                onClick={() => stopPayments('immediately')}
              >
                {stopping === 'immediately' ? 'Stopping…' : 'Stop payments immediately'}
              </Button>
            </div>
          )}
          <p role="status" aria-live="polite">
            {stopMessage}
          </p>
        </div>
      )}

      {id && canStopPayments && (
        <HostingOneOffPayments
          clientId={id}
          recipientEmail={recipientEmail || ''}
          currency={currency}
          saveClient={submit}
        />
      )}
    </section>
  )
}
