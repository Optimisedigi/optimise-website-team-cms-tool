'use client'

import { Button, useDocumentInfo, useField, useForm } from '@payloadcms/ui'
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

type OfferResult = { url: string; expiresAt: string }
const CUSTOM_PLAN = '__custom__'

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
  const [plans, setPlans] = useState<HostingPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [customPlanSelected, setCustomPlanSelected] = useState(false)
  const [message, setMessage] = useState('')
  const [offerUrl, setOfferUrl] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/globals/hosting-billing-settings?depth=0', { credentials: 'include' })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error('Plan lookup failed')),
      )
      .then((settings) =>
        setPlans((settings.plans || []).filter((plan: HostingPlan) => plan.active !== false)),
      )
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
        `Create a seven-day hosting payment offer for ${recipientEmail}? This revokes any current offer.`,
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
      setMessage(`Offer created. It expires ${new Date(result.expiresAt!).toLocaleString()}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create the hosting offer.')
    } finally {
      setCreating(false)
    }
  }

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
          <label htmlFor="hosting-billing-interval">Billing interval</label>
          <select
            id="hosting-billing-interval"
            value={billingInterval || ''}
            onChange={(event) => setBillingInterval(event.target.value as 'month' | 'year')}
          >
            <option value="">Select an interval</option>
            <option value="month">Monthly</option>
            <option value="year">Annual</option>
          </select>
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
          <a href={offerUrl} target="_blank" rel="noreferrer">
            Open client payment link
          </a>
        )}
      </div>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  )
}
