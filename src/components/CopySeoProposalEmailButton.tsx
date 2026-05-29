'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useMemo, useState } from 'react'
import {
  buildSeoProposalEmail,
  type SeoProposalEmailReport,
} from '@/lib/seo-proposal-email'

/**
 * "Copy Email" button (next to the View deck button). Builds the detailed
 * outreach email from the report and copies it — rich HTML for Gmail paste, or
 * plain text. Disabled until a completed report exists.
 *
 * Two usages:
 *  - On the SEO Audit Proposal **record** (no props): reads report/status/
 *    websiteUrl from the admin form fields.
 *  - On the **Client** SEO Audit Proposal tab (props passed): the parent has
 *    already fetched the latest run, so report/websiteUrl come in directly.
 */
export const CopySeoProposalEmailButton = ({
  report: reportProp,
  websiteUrl: websiteUrlProp,
  businessName: businessNameProp,
}: {
  report?: SeoProposalEmailReport | null
  websiteUrl?: string | null
  businessName?: string | null
} = {}) => {
  const usingProps = reportProp !== undefined
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'none' | 'html' | 'plain' | 'subject'>('none')

  const anyFields = fields as Record<string, { value?: unknown }>
  const status = usingProps ? 'completed' : (anyFields?.status?.value as string | undefined)
  const report = (usingProps ? reportProp : (anyFields?.report?.value as SeoProposalEmailReport | undefined)) ?? undefined
  const websiteUrl = (usingProps ? websiteUrlProp : (anyFields?.websiteUrl?.value as string | undefined)) ?? undefined

  const businessName = useMemo(() => {
    if (businessNameProp) return businessNameProp
    try {
      if (websiteUrl) {
        const host = new URL(websiteUrl).hostname.replace(/^www\./, '')
        const label = host.split('.')[0]
        return label.charAt(0).toUpperCase() + label.slice(1)
      }
    } catch {
      /* fall through */
    }
    return 'your business'
  }, [websiteUrl, businessNameProp])

  const email = useMemo(() => {
    if (!report || typeof report !== 'object') return null
    try {
      return buildSeoProposalEmail(report, { businessName, websiteUrl: websiteUrl ?? null })
    } catch {
      return null
    }
  }, [report, businessName, websiteUrl])

  // On the record we also gate on `id`; with props we trust the parent.
  if ((!usingProps && !id) || status !== 'completed' || !email) return null

  const copy = async (which: 'html' | 'plain' | 'subject') => {
    try {
      if (which === 'html' && typeof ClipboardItem !== 'undefined') {
        // Copy as rich HTML so it pastes formatted (with tables) into Gmail.
        const item = new ClipboardItem({
          'text/html': new Blob([email.htmlBody], { type: 'text/html' }),
          'text/plain': new Blob([email.plainBody], { type: 'text/plain' }),
        })
        await navigator.clipboard.write([item])
      } else if (which === 'subject') {
        await navigator.clipboard.writeText(email.subject)
      } else {
        await navigator.clipboard.writeText(email.plainBody)
      }
      setCopied(which)
      setTimeout(() => setCopied('none'), 2000)
    } catch {
      // Clipboard blocked — fall back to plain text.
      await navigator.clipboard.writeText(email.plainBody).catch(() => {})
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: '#7c3aed',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        {open ? 'Hide email' : 'Copy Email'}
      </button>

      {open && (
        <div style={{ marginTop: 14, border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, background: '#fff' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <CopyBtn label={copied === 'html' ? '✓ Copied — paste into Gmail' : 'Copy for Gmail (formatted)'} onClick={() => copy('html')} primary />
            <CopyBtn label={copied === 'subject' ? 'Copied!' : 'Copy subject'} onClick={() => copy('subject')} />
            <CopyBtn label={copied === 'plain' ? 'Copied!' : 'Copy plain text'} onClick={() => copy('plain')} />
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
            “Copy for Gmail” copies the email as rich HTML — paste directly into a Gmail compose window and the tables &amp; formatting come through.
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Subject</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{email.subject}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Live preview (this is what pastes in)</div>
          <div
            style={{ border: '1px solid #eef2f7', borderRadius: 8, padding: 16, maxHeight: 460, overflow: 'auto', background: '#fff' }}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: email.htmlBody }}
          />
        </div>
      )}
    </div>
  )
}

function CopyBtn({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 14px',
        background: primary ? '#2563eb' : '#f1f5f9',
        color: primary ? '#fff' : '#334155',
        border: 'none',
        borderRadius: 6,
        fontWeight: 600,
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

export default CopySeoProposalEmailButton
