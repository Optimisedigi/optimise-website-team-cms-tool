'use client'

import type {
  OneOffPaymentPreview,
  StagedOneOffPayment,
} from '@/lib/agents/adminmate/one-off-payment-tool'
import { formatMoney } from '@/lib/hosting-billing'
import { createOneOffQuote } from '@/lib/hosting-one-off-payment'

interface Props {
  staged: StagedOneOffPayment
  preview?: OneOffPaymentPreview
  sending: boolean
  onChange: (changes: Partial<StagedOneOffPayment>) => void
  onConfirm: () => void
  onDiscard: () => void
}

/** Total the client will be charged, or null while the amount is not valid. */
function totalFor(amount: number, preview?: OneOffPaymentPreview): string | null {
  const cents = Math.round(amount * 100)
  if (!preview || !Number.isFinite(amount) || cents <= 0) return null
  try {
    const quote = createOneOffQuote(cents, preview.currency, preview.surcharge)
    return formatMoney(quote.totalCents, quote.currency)
  } catch {
    return null
  }
}

const sendLabel = (sendOn: string) =>
  new Date(`${sendOn}T12:00:00Z`).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

/**
 * Review card for a one-off payment AdminMate staged. Nothing is created or
 * emailed until the admin presses the confirm button.
 */
export default function AdminMateOneOffPaymentCard({
  staged,
  preview,
  sending,
  onChange,
  onConfirm,
  onDiscard,
}: Props) {
  const total = totalFor(staged.amount, preview)
  const recipient = preview?.recipientEmail ?? ''
  const canSend =
    !sending && Boolean(recipient) && staged.description.trim() !== '' && total !== null
  return (
    <section
      aria-label="One-off payment review"
      style={{
        border: '1px solid #86efac',
        borderRadius: 12,
        padding: 12,
        background: 'rgba(22,163,74,.08)',
        display: 'grid',
        gap: 10,
      }}
    >
      <div>
        <strong>Review one-off payment</strong>
      </div>
      <div style={{ fontSize: 13 }}>
        <strong>Client:</strong> {staged.clientName}
      </div>
      <label style={labelStyle}>
        What it&apos;s for
        <input
          aria-label="What it's for"
          maxLength={200}
          value={staged.description}
          onChange={(event) => onChange({ description: event.target.value })}
          style={inputStyle}
        />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={labelStyle}>
          Amount before surcharge
          <input
            aria-label="Amount before surcharge"
            type="number"
            min="0.01"
            step="0.01"
            value={Number.isFinite(staged.amount) ? staged.amount : ''}
            onChange={(event) => onChange({ amount: Number(event.target.value) })}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Send email on (optional)
          <input
            aria-label="Send email on"
            type="date"
            value={staged.sendOn ?? ''}
            onChange={(event) => onChange({ sendOn: event.target.value || undefined })}
            style={inputStyle}
          />
        </label>
      </div>
      <div role="status" style={noticeStyle}>
        {!preview
          ? 'Could not load the billing details. Check the client page before sending.'
          : !recipient
            ? 'This client has no hosting billing email. Add one on the client page first.'
            : `${total ? `${total} including card surcharge` : 'Enter an amount'}, emailed from accounts to ${recipient} ${
                staged.sendOn
                  ? `at 9am Sydney time on ${sendLabel(staged.sendOn)}`
                  : 'as soon as you confirm'
              }.`}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onConfirm} disabled={!canSend} style={primaryButtonStyle}>
          {sending ? 'Sending…' : staged.sendOn ? 'Schedule payment email' : 'Email payment link'}
        </button>
        <button type="button" onClick={onDiscard} disabled={sending} style={secondaryButtonStyle}>
          Discard
        </button>
      </div>
    </section>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 7,
  padding: '8px 9px',
  background: 'var(--theme-bg)',
  color: 'var(--theme-text)',
  font: 'inherit',
}
const labelStyle: React.CSSProperties = { display: 'grid', gap: 3, fontSize: 12, fontWeight: 700 }
const primaryButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 8,
  padding: '9px 12px',
  background: '#166534',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
}
const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: 'transparent',
  color: 'var(--theme-text)',
  border: '1px solid var(--theme-elevation-200)',
}
const noticeStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 9,
  background: 'var(--theme-elevation-100)',
  fontSize: 13,
  lineHeight: 1.45,
}
