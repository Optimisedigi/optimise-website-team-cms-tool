'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs the SEO Audit Proposal engine.
 *
 * Context-aware via collectionSlug:
 *  - seo-audit-proposals : run this record directly.
 *  - clients / client-proposals : create-or-find a linked record, then run it.
 *
 * Polls /api/seo-audit-proposals/[id]/status for progress.
 */
const RunSeoProposalButton = () => {
  const { id, collectionSlug } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState('')
  const [percent, setPercent] = useState(0)
  const [recordId, setRecordId] = useState<string | number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPolling = useCallback(
    (targetId: string | number) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/seo-audit-proposals/${targetId}/status`, {
            credentials: 'include',
          })
          if (!res.ok) return
          const data = await res.json()
          if (data.stage) setStage(data.stage)
          if (typeof data.percent === 'number') setPercent(data.percent)

          if (data.status === 'completed') {
            stopPolling()
            setLoading(false)
            setPercent(100)
            setStage('Complete')
            setMessage('SEO Audit Proposal complete. Refresh to see the report.')
          } else if (data.status === 'failed') {
            stopPolling()
            setLoading(false)
            setPercent(100)
            setStage('Failed')
            setError(data.error || 'Run failed')
          }
        } catch {
          /* network hiccup — keep polling */
        }
      }, 3000)
    },
    [stopPolling],
  )

  useEffect(() => () => stopPolling(), [stopPolling])

  const run = useCallback(async () => {
    setError(null)
    setMessage(null)
    setLoading(true)
    setStage('Starting')
    setPercent(0)

    try {
      let targetId: string | number | null = null

      if (collectionSlug === 'seo-audit-proposals') {
        targetId = id ?? null
      } else {
        // clients / client-proposals — create or find the linked record first.
        const body =
          collectionSlug === 'client-proposals'
            ? { proposalId: id }
            : { clientId: id }
        const createRes = await fetch('/api/seo-audit-proposals/create-and-run', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const createData = await createRes.json()
        if (!createRes.ok) throw new Error(createData.error || 'Failed to prepare the run')
        targetId = createData.id
      }

      if (targetId == null) throw new Error('Could not resolve a record to run')
      setRecordId(targetId)

      const runRes = await fetch(`/api/seo-audit-proposals/${targetId}/run`, {
        method: 'POST',
        credentials: 'include',
      })
      const runData = await runRes.json()
      if (!runRes.ok) throw new Error(runData.error || 'Failed to start the run')

      startPolling(targetId)
    } catch (e: any) {
      setLoading(false)
      setError(e?.message || 'Failed to start')
    }
  }, [collectionSlug, id, startPolling])

  if (!id) {
    return (
      <div style={{ marginBottom: 16, fontSize: 13, color: '#888' }}>
        Save this record first, then run the SEO Audit Proposal.
      </div>
    )
  }

  // Soft validation hint (full validation happens server-side).
  const websiteUrl = fields?.websiteUrl?.value as string | undefined
  const gscSiteUrl = fields?.gscSiteUrl?.value as string | undefined
  const clientGscSiteUrl = fields?.gscSiteUrl?.value as string | undefined
  const missing: string[] = []
  if (collectionSlug === 'seo-audit-proposals' || collectionSlug === 'client-proposals' || collectionSlug === 'clients') {
    if (!websiteUrl) missing.push('Website URL')
    if (!(collectionSlug === 'clients' ? clientGscSiteUrl : gscSiteUrl)) missing.push('GSC Property')
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: loading ? '#475569' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 14,
          cursor: loading ? 'default' : 'pointer',
        }}
      >
        {loading ? 'Running…' : 'Run SEO Audit Proposal'}
      </button>

      {loading && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
            {stage} ({percent}%)
          </div>
          <div style={{ height: 6, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${percent}%`,
                background: '#38bdf8',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
            This can take 1–3 minutes (full crawl + analysis). You can leave this page.
          </div>
        </div>
      )}

      {missing.length > 0 && !loading && (
        <div style={{ marginTop: 10, fontSize: 13, color: '#f59e0b' }}>
          Missing: {missing.join(', ')} — the run needs both before it can start.
        </div>
      )}

      {recordId && !loading && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <a href={`/admin/collections/seo-audit-proposals/${recordId}`} style={{ color: '#38bdf8' }}>
            Open the SEO Audit Proposal record →
          </a>
        </div>
      )}

      {message && <div style={{ marginTop: 10, fontSize: 13, color: '#22c55e' }}>{message}</div>}
      {error && <div style={{ marginTop: 10, fontSize: 13, color: '#ef4444' }}>{error}</div>}
    </div>
  )
}

export default RunSeoProposalButton
