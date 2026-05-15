'use client'

import { useFormFields } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'
import { buildStatementEmail, SAMPLE_STATEMENT_SNAPSHOT } from '../lib/invoice-statement-email'

const FIELD_PATHS = [
  'subjectTemplate',
  'greeting',
  'openingLine',
  'summaryTemplate',
  'paymentMethodsHtml',
  'closingLine',
  'signOff',
  'senderName',
  'signatureHtml',
] as const

type FieldKey = (typeof FIELD_PATHS)[number]

interface FieldSnapshot {
  subjectTemplate: string
  greeting: string
  openingLine: string
  summaryTemplate: string
  paymentMethodsHtml: string
  closingLine: string
  signOff: string
  senderName: string
  signatureHtml: string
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Custom UI field rendered at the top of the Invoice Statement tab.
 *
 * Subscribes to all the statement template fields + signatureHtml in the
 * form, debounces 300ms, calls the same `buildStatementEmail` function that
 * the cron + approve-send routes use, and renders the result in an iframe.
 *
 * Uses `SAMPLE_STATEMENT_SNAPSHOT` so the user can iterate on copy without
 * needing real Xero data.
 */
const InvoiceStatementPreviewField = () => {
  // The lead-response sub-tabs use field names like `signatureHtml` that are
  // unique to their own tab, but Payload stores all global field values in a
  // flat tree. We need to look up by these flat field names \u2014 they happen to
  // be unique across this global.
  const fieldMap = useFormFields(([fields]) => {
    const out: Record<FieldKey, string> = {
      subjectTemplate: '',
      greeting: '',
      openingLine: '',
      summaryTemplate: '',
      paymentMethodsHtml: '',
      closingLine: '',
      signOff: '',
      senderName: '',
      signatureHtml: '',
    }
    // Field names in the global have the `statement` prefix except subjectTemplate (which is shared
    // with lead-responses). We look up both shapes.
    out.subjectTemplate = asString(fields?.statementSubjectTemplate?.value ?? '')
    out.greeting = asString(fields?.statementGreeting?.value ?? '')
    out.openingLine = asString(fields?.statementOpeningLine?.value ?? '')
    out.summaryTemplate = asString(fields?.statementSummaryTemplate?.value ?? '')
    out.paymentMethodsHtml = asString(fields?.statementPaymentMethodsHtml?.value ?? '')
    out.closingLine = asString(fields?.statementClosingLine?.value ?? '')
    out.signOff = asString(fields?.statementSignOff?.value ?? '')
    out.senderName = asString(fields?.statementSenderName?.value ?? '')
    out.signatureHtml = asString(fields?.signatureHtml?.value ?? '')
    return out
  })

  const [debounced, setDebounced] = useState<FieldSnapshot>(fieldMap)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(fieldMap), 300)
    return () => clearTimeout(t)
  }, [fieldMap])

  const result = useMemo(() => {
    try {
      return buildStatementEmail({
        snapshot: SAMPLE_STATEMENT_SNAPSHOT,
        customMessage: 'Great chat earlier — really appreciate you sticking with us through the campaign rebuild. Let me know if anything below looks off.',
        templates: {
          subjectTemplate: debounced.subjectTemplate || '',
          greeting: debounced.greeting || '',
          openingLine: debounced.openingLine || '',
          summaryTemplate: debounced.summaryTemplate || '',
          paymentMethodsHtml: debounced.paymentMethodsHtml || '',
          closingLine: debounced.closingLine || '',
          signOff: debounced.signOff || '',
          senderName: debounced.senderName || '',
        },
        signatureHtml: debounced.signatureHtml || '',
        attachmentsAttached: true,
        // Pin a deterministic "now" so the status pills don't shift on rerender.
        now: new Date('2026-05-02T08:00:00+10:00'),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        subject: '(preview error)',
        html: `<pre style="color:#b91c1c;font-family:monospace;padding:12px;">${message}</pre>`,
        text: '',
      }
    }
  }, [debounced])

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          border: '1px solid var(--theme-elevation-100)',
          borderRadius: 6,
          overflow: 'hidden',
          background: '#fff',
        }}
      >
        <div
          style={{
            padding: '6px 12px',
            background: 'var(--theme-elevation-50)',
            fontSize: 12,
            color: 'var(--theme-elevation-600)',
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span>Live preview (sample: Acme Pty Ltd, 3 invoices)</span>
          <span style={{ fontWeight: 400, color: 'var(--theme-elevation-500)' }}>Subject: {result.subject}</span>
        </div>
        <iframe
          title="Invoice statement preview"
          srcDoc={result.html}
          sandbox=""
          style={{ width: '100%', minHeight: 700, border: 0, background: '#fff' }}
        />
      </div>
    </div>
  )
}

export default InvoiceStatementPreviewField
