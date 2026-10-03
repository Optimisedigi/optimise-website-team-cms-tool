'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@payloadcms/ui'

type OneOffPayment = {
  id: number
  status: 'scheduled' | 'active' | 'checkout_pending' | 'paid' | 'revoked'
  description: string
  totalCents: number
  currency: string
  recipientEmail: string
  createdAt: string
  expiresAt: string
  paidAt: string | null
  scheduledSendAt: string | null
  emailSentAt: string | null
  /** When this unpaid link is due to be emailed again, if scheduled. */
  resendAt: string | null
  sendFailed: boolean
}

type CreateResult = {
  payment: OneOffPayment
  /** Absent for a scheduled email: the link is made when it is sent. */
  url?: string
  emailSent: boolean
  emailedTo?: string
  error?: string
}

const money = (cents: number, currency: string) =>
  (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: currency.toUpperCase() })

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('en-AU', {
        timeZone: 'Australia/Sydney',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''

/** Tomorrow's date (YYYY-MM-DD) in Sydney, the earliest send date allowed. */
function tomorrowInSydney(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(
    new Date(),
  )
  const next = new Date(`${today}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

function statusLabel(payment: OneOffPayment): string {
  if (payment.status === 'scheduled')
    return payment.sendFailed
      ? 'Scheduled email failed to send. Cancel it and send a new link.'
      : `Email scheduled for ${date(payment.scheduledSendAt)}`
  if (payment.status === 'paid') return `Paid ${date(payment.paidAt)}`
  if (payment.status === 'revoked') return 'Cancelled'
  const current =
    new Date(payment.expiresAt) <= new Date()
      ? 'Expired'
      : payment.status === 'checkout_pending'
        ? 'Client opened checkout'
        : 'Waiting for payment'
  if (!payment.resendAt) return current
  return payment.sendFailed
    ? `${current}. Scheduled resend failed; resend it now instead.`
    : `${current}. Resend scheduled for ${date(payment.resendAt)}`
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
  const [sendOn, setSendOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [retryCancel, setRetryCancel] = useState<ReadonlySet<number>>(new Set())
  // The row whose resend options are open, and the optional date chosen there.
  const [resendFor, setResendFor] = useState<number | null>(null)
  const [resendOn, setResendOn] = useState('')

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
    const price = `${money(Math.round(dollars * 100), currency)} plus any card surcharge`
    const scheduledFor = sendOn ? date(`${sendOn}T12:00:00Z`) : ''
    if (
      !window.confirm(
        sendOn
          ? `Save this client and schedule a one-off payment link for ${price}, emailed to ${recipientEmail} at 9am on ${scheduledFor}?`
          : `Save this client and email a one-off payment link to ${recipientEmail} for ${price}?`,
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
        body: JSON.stringify({ description, amount: dollars, ...(sendOn ? { sendOn } : {}) }),
      })
      const result = (await response.json().catch(() => ({}))) as Partial<CreateResult>
      if (!response.ok || !result.payment || (!sendOn && !result.url))
        throw new Error(result.error || 'Could not create the payment link.')
      const total = money(result.payment.totalCents, result.payment.currency)
      setLink(result.url ?? '')
      setCopied(false)
      setDescription('')
      setAmount('')
      setSendOn('')
      setMessage(
        result.payment.status === 'scheduled'
          ? `Payment link for ${total} will be emailed to ${result.payment.recipientEmail} at 9am on ${date(result.payment.scheduledSendAt)}.`
          : result.emailSent
            ? `Payment link for ${total} emailed to ${result.emailedTo}.`
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

  /**
   * Emails the link again now, or schedules that for 9am Sydney on a date.
   * Either way the client gets a new link valid for 14 days and the link in
   * the earlier email stops working when the resend goes out.
   */
  const resend = async (
    payment: OneOffPayment,
    options: { sendOn?: string; cancelSchedule?: boolean } = {},
  ) => {
    const when = options.sendOn ? `at 9am on ${date(`${options.sendOn}T12:00:00Z`)}` : 'now'
    const question = options.cancelSchedule
      ? `Cancel the scheduled resend for "${payment.description}"? The current link keeps working.`
      : `Email the payment link for "${payment.description}" to ${payment.recipientEmail} again ${when}? They get a new link valid for 14 days, and the link in the earlier email stops working.`
    if (!window.confirm(question)) return
    setBusy(true)
    try {
      const response = await fetch(
        `/api/clients/${clientId}/hosting-one-off-payments/${payment.id}/resend`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            options.cancelSchedule
              ? { cancelSchedule: true }
              : options.sendOn
                ? { sendOn: options.sendOn }
                : {},
          ),
        },
      )
      const result = (await response.json().catch(() => ({}))) as {
        url?: string
        emailSent?: boolean
        emailedTo?: string
        resendAt?: string | null
        error?: string
      }
      const scheduling = Boolean(options.sendOn || options.cancelSchedule)
      if (!response.ok || (!scheduling && !result.url))
        throw new Error(result.error || 'Could not resend the payment link.')
      setResendFor(null)
      setResendOn('')
      if (options.cancelSchedule) setMessage('Scheduled resend cancelled.')
      else if (options.sendOn)
        setMessage(
          `Payment link will be emailed again to ${payment.recipientEmail} at 9am on ${date(result.resendAt ?? null)}.`,
        )
      else {
        setLink(result.url ?? '')
        setCopied(false)
        setMessage(
          result.emailSent
            ? `Payment link for ${money(payment.totalCents, payment.currency)} emailed again to ${result.emailedTo}.`
            : 'A new payment link was made, but the email could not be sent. Use Copy payment link and send it to the client yourself.',
        )
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not resend the payment link.')
    } finally {
      await load().catch(() => undefined)
      setBusy(false)
    }
  }

  // Hides a cancelled link from this list; the record itself is kept.
  const hide = async (payment: OneOffPayment) => {
    setBusy(true)
    try {
      const response = await fetch(
        `/api/clients/${clientId}/hosting-one-off-payments/${payment.id}/hide`,
        { method: 'POST', credentials: 'include' },
      )
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Could not remove the payment link.')
      setMessage('Cancelled payment link removed from the list.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove the payment link.')
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
        <div className="hosting-subscription-field__control">
          <label htmlFor="one-off-send-on">Send email on (optional)</label>
          <input
            id="one-off-send-on"
            type="date"
            min={tomorrowInSydney()}
            value={sendOn}
            aria-describedby="one-off-send-on-hint"
            onChange={(event) => setSendOn(event.target.value)}
          />
          <small id="one-off-send-on-hint">
            Leave blank to send now. Scheduled emails go out at 9am Sydney time.
          </small>
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
          {busy ? 'Working…' : sendOn ? 'Schedule payment email' : 'Email payment link'}
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
                payment.status === 'scheduled' ||
                ((payment.status === 'active' || payment.status === 'checkout_pending') &&
                  new Date(payment.expiresAt) > new Date()) ||
                (payment.status === 'revoked' && retryCancel.has(payment.id))
              return (
                <tr key={payment.id}>
                  <td>{payment.description}</td>
                  <td>{money(payment.totalCents, payment.currency)}</td>
                  <td>
                    {payment.status === 'scheduled'
                      ? 'Not yet'
                      : date(payment.emailSentAt ?? payment.createdAt)}
                  </td>
                  <td>{statusLabel(payment)}</td>
                  <td>
                    {(payment.status === 'active' || payment.status === 'checkout_pending') &&
                      (resendFor === payment.id ? (
                        <div
                          className="hosting-subscription-field__resend"
                          role="group"
                          aria-label={`Resend options for ${payment.description}`}
                        >
                          <label htmlFor={`resend-on-${payment.id}`}>Resend on (optional)</label>
                          <input
                            id={`resend-on-${payment.id}`}
                            type="date"
                            min={tomorrowInSydney()}
                            value={resendOn}
                            onChange={(event) => setResendOn(event.target.value)}
                          />
                          <Button
                            type="button"
                            size="small"
                            disabled={busy}
                            onClick={() => resend(payment, resendOn ? { sendOn: resendOn } : {})}
                          >
                            {resendOn ? 'Schedule resend' : 'Resend now'}
                          </Button>
                          <Button
                            type="button"
                            size="small"
                            buttonStyle="secondary"
                            disabled={busy}
                            onClick={() => {
                              setResendFor(null)
                              setResendOn('')
                            }}
                          >
                            Back
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="small"
                            buttonStyle="secondary"
                            disabled={busy}
                            aria-label={`Resend link for ${payment.description}`}
                            onClick={() => {
                              setResendFor(payment.id)
                              setResendOn('')
                            }}
                          >
                            Resend link
                          </Button>
                          {payment.resendAt && (
                            <Button
                              type="button"
                              size="small"
                              buttonStyle="secondary"
                              disabled={busy}
                              aria-label={`Cancel scheduled resend for ${payment.description}`}
                              onClick={() => resend(payment, { cancelSchedule: true })}
                            >
                              Cancel resend
                            </Button>
                          )}
                        </>
                      ))}
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
                    {payment.status === 'revoked' && !retryCancel.has(payment.id) && (
                      <Button
                        type="button"
                        size="small"
                        buttonStyle="secondary"
                        disabled={busy}
                        aria-label={`Remove cancelled link for ${payment.description}`}
                        onClick={() => hide(payment)}
                      >
                        Remove
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
