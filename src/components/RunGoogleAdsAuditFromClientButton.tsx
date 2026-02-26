'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

const RunGoogleAdsAuditFromClientButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [auditLink, setAuditLink] = useState<string | null>(null)

  if (!id) return null

  const name = fields?.name?.value as string | undefined
  const websiteUrl = fields?.websiteUrl?.value as string | undefined
  const businessType = fields?.businessType?.value as string | undefined
  const googleAdsCustomerId = fields?.googleAdsCustomerId?.value as string | undefined
  const contactEmail = fields?.contactEmail?.value as string | undefined

  const hasCid = !!googleAdsCustomerId?.trim()

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    setAuditLink(null)

    try {
      // 1. Create audit record
      const createRes = await fetch('/api/google-ads-audits', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: name || '',
          websiteUrl: websiteUrl || '',
          businessType: businessType || undefined,
          customerId: googleAdsCustomerId!.trim(),
          contactEmail: contactEmail || undefined,
          client: id,
        }),
      })

      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}))
        throw new Error(data?.errors?.[0]?.message || `Failed to create audit (${createRes.status})`)
      }

      const audit = await createRes.json()
      const auditId = audit.doc?.id || audit.id

      // 2. Trigger the audit
      const runRes = await fetch(`/api/google-ads-audits/${auditId}/run-audit`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!runRes.ok) {
        const data = await runRes.json().catch(() => ({}))
        throw new Error(data?.error || `Failed to start audit (${runRes.status})`)
      }

      setAuditLink(`/admin/collections/google-ads-audits/${auditId}`)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || !hasCid}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: loading ? '#6b7280' : !hasCid ? '#9ca3af' : '#2563eb',
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          cursor: loading || !hasCid ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Creating & Running Audit...' : 'Run Google Ads Audit'}
      </button>

      {!hasCid && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Enter a Google Ads Customer ID first (Business tab).
        </p>
      )}

      {auditLink && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>
          Audit created and running.{' '}
          <a href={auditLink} style={{ color: '#2563eb', textDecoration: 'underline' }}>
            View audit →
          </a>
        </p>
      )}

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}
    </div>
  )
}

export default RunGoogleAdsAuditFromClientButton
