'use client'

import { useAllFormFields, useDocumentInfo } from '@payloadcms/ui'
import { useState } from 'react'

const RunGoogleAdsAuditFromClientButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ href: string; window: string; state: string } | null>(null)
  if (!id) return null

  const customerId = String(fields?.googleAdsCustomerId?.value ?? '').trim()
  const name = String(fields?.name?.value ?? '')

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const query = new URLSearchParams({
        'where[and][0][client][equals]': String(id),
        'where[and][1][customerId][equals]': customerId,
        limit: '1', depth: '0',
      })
      const foundResponse = await fetch(`/api/google-ads-audits?${query}`, { credentials: 'include' })
      if (!foundResponse.ok) throw new Error('Could not check for an existing audit')
      const found = await foundResponse.json()
      let audit = found.docs?.[0]
      if (!audit) {
        const createdResponse = await fetch('/api/google-ads-audits', {
          method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ businessName: name, websiteUrl: fields?.websiteUrl?.value || '', customerId, client: id, contactEmail: fields?.contactEmail?.value || undefined }),
        })
        const created = await createdResponse.json()
        if (!createdResponse.ok) throw new Error(created?.errors?.[0]?.message || 'Could not create audit')
        audit = created.doc ?? created
      }
      const confirmNew = audit.snapshotState === 'completed'
      if (confirmNew && !window.confirm('Create a new point-in-time snapshot? This changes the evidence baseline and leaves the completed snapshot unchanged.')) return
      const snapshotResponse = await fetch(`/api/google-ads-audits/${audit.id}/snapshot`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmNew }),
      })
      const snapshot = await snapshotResponse.json()
      if (!snapshotResponse.ok) throw new Error(snapshot.error || 'Could not start snapshot')
      setResult({ href: `/admin/collections/google-ads-audits/${audit.id}`, window: `${String(snapshot.periodStart).slice(0, 10)} to ${String(snapshot.periodEnd).slice(0, 10)}`, state: snapshot.status })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Snapshot request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section style={{ marginBottom: 20 }} aria-labelledby="client-audit-snapshot-title">
      <h3 id="client-audit-snapshot-title" style={{ margin: '0 0 8px', fontSize: 15 }}>Google Ads audit snapshot</h3>
      <button type="button" className="btn btn--style-primary" onClick={handleClick} disabled={loading || !customerId} style={{ minHeight: 44 }}>
        {loading ? 'Checking snapshot…' : 'Create or resume audit snapshot'}
      </button>
      {!customerId && <p style={{ marginTop: 8, fontSize: 13 }}>Enter a Google Ads Customer ID first.</p>}
      <div aria-live="polite">
        {result && <p style={{ marginTop: 8, fontSize: 13 }}>Snapshot {result.state}. Frozen window: {result.window}. <a href={result.href}>Review audit</a></p>}
        {error && <p role="alert" style={{ marginTop: 8, fontSize: 13, color: 'var(--theme-error-600)' }}>{error}</p>}
      </div>
    </section>
  )
}

export default RunGoogleAdsAuditFromClientButton
