'use client'

import { Button, useDocumentInfo, useField, useForm } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'
import './HostingSubscriptionField.css'

type HostingPlan = {
  name: string
  includedAllowance?: string | null
  monthlyBaseCents: number
  annualBaseCents: number
  active?: boolean | null
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
  const { setValue: setAnnualBaseCents } = useField<number>({
    path: 'hostingSubscription.annualBaseCents',
  })
  const { setValue: setRecipientEmail } = useField<string>({
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

  useEffect(() => {
    setRecipientEmail(clientEmail || '')
  }, [clientEmail, setRecipientEmail])

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.name === planName),
    [planName, plans],
  )
  const selectedPlanValue =
    customPlanSelected || (planName && !selectedPlan) ? CUSTOM_PLAN : selectedPlan?.name || ''
  const monthlyFee = Number(monthlyBaseCents || 0) / 100

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
      setMonthlyBaseCents(plan.monthlyBaseCents)
      setAnnualBaseCents(plan.annualBaseCents)
    }
  }

  const updateMonthlyFee = (amount: number) => {
    const cents = Math.max(0, Math.round((Number.isFinite(amount) ? amount : 0) * 100))
    setMonthlyBaseCents(cents)
    setAnnualBaseCents(cents * 12)
  }

  const createOffer = async () => {
    if (
      !id ||
      !window.confirm(
        `Create a seven-day hosting payment offer for ${clientEmail}? This revokes any current offer.`,
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
    <div className="hosting-subscription-field">
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
          />
        </div>
        <div className="hosting-subscription-field__control">
          <label htmlFor="hosting-recipient-email">Recipient email</label>
          <input
            id="hosting-recipient-email"
            type="email"
            value={clientEmail || ''}
            readOnly
            aria-describedby="hosting-recipient-help"
          />
          <span id="hosting-recipient-help">
            Uses the client email from Contacts &amp; Managers.
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
            !id || !planName || !clientEmail || !monthlyBaseCents || !billingInterval || creating
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
    </div>
  )
}
