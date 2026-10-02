'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@payloadcms/ui'

type OneOffPayment = {
  id: number
  status: 'active' | 'checkout_pending' | 'paid' | 'revoked'
  description: string
  totalCents: number
  currency: string
  recipientEmail: string
  createdAt: string
  expiresAt: string
  paidAt: string | null
}

type CreateResult = {
  payment: OneOffPayment
  url: string
  emailSent: boolean
  emailedTo?: string
  error?: string
}

const money = (cents: number, currency: string) =>
  (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: currency.toUpperCase() })

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''

function statusLabel(payment: OneOffPayment): string {
  if (payment.status === 'paid') return `Paid ${date(payment.paidAt)}`
  if (payment.status === 'revoked') return 'Cancelled'
  if (new Date(payment.expiresAt) <= new Date()) return 'Expired'
  return payment.status === 'checkout_pending' ? 'Client opened checkout' : 'Waiting for payment'
}

/**
 * One-off payment links for a client (for example, backdated hosting). The
 * amount is charged once by card; it never touches the hosting subscription.
 */
export function HostingOneOffPayments({
  clientId,
  recipientEmail,
  currency,
  saveClient,
}: {
  clientId: string | number
  recipientEmail: string
  /** Hosting Billing Settings currency; the server charges in this currency. */
  currency: string
  /**
   * Saves the client form. The server emails the saved billing address, so
   * saving first makes the address in the confirm box the one actually used,
   * including one filled in from the main contact but not yet saved.
   */
  saveClient: () => Promise<unknown>
}) {
  const [payments, setPayments] = useState<OneOffPayment[]>([])
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [retryCancel, setRetryCancel] = useState<ReadonlySet<number>>(new Set())

  const load = useCallback(async () => {
    const response = await fetch(`/api/clients/${clientId}/hosting-one-off-payments`, {
      credentials: 'include',
    })
    if (!response.ok) throw new Error('One-off payments could not be loaded.')
    const data = (await response.json()) as { payments?: unknown }
    setPayments(Array.isArray(data.payments) ? (data.payments as OneOffPayment[]) : [])
  }, [clientId])

  useEffect(() => {
    load().catch(() => setMessage('Earlier one-off payments could not be loaded.'))
  }, [load])

  const create = async () => {
    const dollars = Number(amount)
    if (
      !window.confirm(
        `Save this client and email a one-off payment link to ${recipientEmail} for ${money(Math.round(dollars * 100), currency)} plus any card surcharge?`,
      )
    )
      return
    setBusy(true)
    setMessage('Saving client details…')
    try {
      await saveClient()
      setMessage('Creating payment link…')
      const response = await fetch(`/api/clients/${clientId}/hosting-one-off-payments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, amount: dollars }),
      })
      const result = (await response.json().catch(() => ({}))) as Partial<CreateResult>
      if (!response.ok || !result.url || !result.payment)
        throw new Error(result.error || 'Could not create the payment link.')
      setLink(result.url)
      setCopied(false)
      setDescription('')
      setAmount('')
      setMessage(
        result.emailSent
          ? `Payment link for ${money(result.payment.totalCents, result.payment.currency)} emailed to ${result.emailedTo}.`
          : 'Payment link created, but the email could not be sent. Use Copy payment link and send it to the client yourself.',
      )
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create the payment link.')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (payment: OneOffPayment) => {
    if (
      !window.confirm(
        `Cancel the payment link for "${payment.description}"? The client will no longer be able to pay it.`,
      )
    )
      return
    setBusy(true)
    try {
      const response = await fetch(
        `/api/clients/${clientId}/hosting-one-off-payments/${payment.id}/revoke`,
        {
          method: 'POST',
          credentials: 'include',
        },
      )
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      // 503: the link is cancelled but Stripe could not be reached to close an
      // open checkout. Keep the button on that row so the admin can retry.
      setRetryCancel((ids) => {
        const next = new Set(ids)
        if (response.status === 503) next.add(payment.id)
        else next.delete(payment.id)
        return next
      })
      if (!response.ok) throw new Error(result.error || 'Could not cancel the payment link.')
      setMessage('Payment link cancelled.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not cancel the payment link.')
    } finally {
      await load().catch(() => undefined)
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setMessage(`Could not copy automatically. The payment link is: ${link}`)
    }
  }

  const amountValid = Number(amount) > 0
  return (
    <div className="hosting-subscription-field__subscription">
      <h3>One-off payment</h3>
      <p>
        Ask the client for a single card payment, for example backdated hosting. The card surcharge
        from Hosting Billing Settings is added, and the link is emailed from accounts. It does not
        change their subscription.
      </p>
      <div className="hosting-subscription-field__grid">
        <div className="hosting-subscription-field__control">
          <label htmlFor="one-off-description">What it's for</label>
          <input
            id="one-off-description"
            value={description}
            maxLength={200}
            placeholder="Backdated hosting, July to September 2026"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="hosting-subscription-field__control">
          <label htmlFor="one-off-amount">Amount before surcharge ({currency.toUpperCase()})</label>
          <input
            id="one-off-amount"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
      </div>
      <div className="hosting-subscription-field__actions">
        {!recipientEmail && <p>Add a billing email above first.</p>}
        <Button
          type="button"
          size="small"
          disabled={busy || !recipientEmail || !description.trim() || !amountValid}
          onClick={create}
        >
          {busy ? 'Working…' : 'Email payment link'}
        </Button>
        {link && (
          <>
            <a href={link} target="_blank" rel="noreferrer">
              Open payment link
            </a>
            <Button type="button" size="small" buttonStyle="secondary" onClick={copy}>
              {copied ? 'Link copied' : 'Copy payment link'}
            </Button>
          </>
        )}
      </div>
      <p role="status" aria-live="polite" aria-label="One-off payment status">
        {message}
      </p>
      {payments.length > 0 && (
        <table className="hosting-subscription-field__one-off-table">
          <caption>Payment links sent</caption>
          <thead>
            <tr>
              <th scope="col">For</th>
              <th scope="col">Total</th>
              <th scope="col">Sent</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => {
              const open =
                ((payment.status === 'active' || payment.status === 'checkout_pending') &&
                  new Date(payment.expiresAt) > new Date()) ||
                (payment.status === 'revoked' && retryCancel.has(payment.id))
              return (
                <tr key={payment.id}>
                  <td>{payment.description}</td>
                  <td>{money(payment.totalCents, payment.currency)}</td>
                  <td>{date(payment.createdAt)}</td>
                  <td>{statusLabel(payment)}</td>
                  <td>
                    {open && (
                      <Button
                        type="button"
                        size="small"
                        buttonStyle="secondary"
                        disabled={busy}
                        onClick={() => revoke(payment)}
                      >
                        Cancel link
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
