'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'
import type React from 'react'

/**
 * Contracts panel on the client Business tab.
 *
 * Shows every contract linked to this client (draft / sent / completed) with
 * a link to open it, the signed PDF when one exists, and "New contract from
 * template" buttons that create a draft already linked to (and pre-filled
 * from) this client via POST /api/contracts/{templateId}/duplicate.
 */

type ContractRow = {
  id: string | number
  contractTitle: string
  status?: 'draft' | 'sent' | 'completed' | null
  contractDate?: string | null
  signedPdfUrl?: string | null
  clientSignedAt?: string | null
}

type Template = { id: string | number; contractTitle: string; templateLabel?: string | null }

const STATUS_LABEL: Record<string, { text: string; pill: string }> = {
  draft: { text: 'Draft', pill: 'od-biz-pill' },
  sent: { text: 'Sent', pill: 'od-biz-pill od-biz-pill--accent' },
  completed: { text: 'Signed', pill: 'od-biz-pill od-biz-pill--green' },
}

const templateLabel = (t: Template): string =>
  (t.templateLabel && t.templateLabel.trim()) || t.contractTitle || 'Untitled template'

const formatDate = (value?: string | null): string => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ClientSignedContractButton = (): React.ReactElement => {
  const { id: clientId } = useDocumentInfo()
  const signedContractUrl = useFormFields(([fields]) => {
    const value = fields?.signedContractUrl?.value
    return typeof value === 'string' ? value.trim() : ''
  })

  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    const contractsQuery = new URLSearchParams({
      'where[client][equals]': String(clientId),
      limit: '50',
      sort: '-contractDate',
      depth: '0',
    })
    Promise.all([
      fetch(`/api/contracts?${contractsQuery}`).then((res) => (res.ok ? res.json() : { docs: [] })),
      fetch('/api/contracts?where[isTemplate][equals]=true&limit=50&depth=0').then((res) => (res.ok ? res.json() : { docs: [] })),
    ])
      .then(([contractData, templateData]) => {
        if (cancelled) return
        // Every row is linked to this client by the query, so it is this
        // client's contract even when it is also used as a template. Trashed
        // contracts stay hidden until restored.
        const rows: ContractRow[] = (contractData.docs ?? []).filter(
          (doc: { deletedAt?: string | null }) => !doc.deletedAt,
        )
        setContracts(rows)
        const docs: Template[] = templateData.docs ?? []
        docs.sort((a, b) => templateLabel(a).localeCompare(templateLabel(b)))
        setTemplates(docs)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load contracts for this client.')
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  const handleOpenSigned = useCallback(() => {
    if (!signedContractUrl) return
    window.open(signedContractUrl, '_blank', 'noopener,noreferrer')
  }, [signedContractUrl])

  const handleCreate = async (template: Template) => {
    if (!clientId) return
    const name = templateLabel(template)
    if (!window.confirm(`Create a new contract from “${name}” for this client?\n\nA draft will be created, linked to this client, and opened.`)) return
    setCreating(String(template.id))
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${template.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create contract')
      window.location.href = `/admin/collections/contracts/${data.id}`
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create contract')
      setCreating(null)
    }
  }

  if (!clientId) {
    return <p className="od-biz-empty">Save the client first to link or create contracts.</p>
  }

  // The legacy `signedContractUrl` only gets its own row when no linked
  // contract already carries a signed PDF.
  const showLegacySigned =
    Boolean(signedContractUrl) && !contracts.some((c) => c.status === 'completed' && c.signedPdfUrl)

  return (
    <div className="od-biz-contracts">
      {showLegacySigned && (
        <div className="od-biz-contract-row">
          <span className="od-biz-pill od-biz-pill--green">Signed</span>
          <span className="od-biz-contract-row__name">
            <b>Signed contract</b>
          </span>
          <button type="button" className="od-biz-btn" onClick={handleOpenSigned}>
            View signed contract
          </button>
        </div>
      )}

      {!loaded && <p className="od-biz-empty">Loading contracts…</p>}

      {loaded && contracts.length === 0 && !signedContractUrl && (
        <p className="od-biz-empty">No contracts linked to this client yet.</p>
      )}

      {contracts.length > 0 && (
        <ul className="od-biz-contracts__list">
          {contracts.map((contract) => {
            const status = STATUS_LABEL[contract.status ?? 'draft'] ?? STATUS_LABEL.draft
            const signed = contract.status === 'completed'
            const date = formatDate(signed ? contract.clientSignedAt || contract.contractDate : contract.contractDate)
            const title = contract.contractTitle || 'Untitled contract'
            const signedUrl = contract.signedPdfUrl || (signed ? signedContractUrl : '')
            return (
              <li key={String(contract.id)} className="od-biz-contract-row">
                <span className={status.pill}>{status.text}</span>
                <span className="od-biz-contract-row__name">
                  <a href={`/admin/collections/contracts/${contract.id}`}>
                    <b>{title}</b>
                  </a>
                  {date && <span className="od-biz-contract-row__meta"> · {signed ? 'signed' : 'dated'} {date}</span>}
                </span>
                {signed && signedUrl ? (
                  <a className="od-biz-btn" href={signedUrl} target="_blank" rel="noopener noreferrer">
                    View signed contract
                  </a>
                ) : (
                  <a className="od-biz-btn" href={`/admin/collections/contracts/${contract.id}`} aria-label={`Open ${title}`}>
                    Open
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {templates.length > 0 && (
        <div className="od-biz-contracts__templates">
          <span className="od-biz-label">New contract from template</span>
          {templates.map((template) => (
            <button
              key={String(template.id)}
              type="button"
              className="od-biz-btn"
              onClick={() => void handleCreate(template)}
              disabled={creating !== null}
              aria-busy={creating === String(template.id) || undefined}
            >
              {creating === String(template.id) ? 'Creating…' : templateLabel(template)}
            </button>
          ))}
        </div>
      )}

      {error && <p className="od-biz-error" role="alert">{error}</p>}
    </div>
  )
}

export default ClientSignedContractButton
