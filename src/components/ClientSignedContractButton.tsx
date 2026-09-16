'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

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

const STATUS_LABEL: Record<string, { text: string; bg: string; fg: string }> = {
  draft: { text: 'Draft', bg: '#f3f4f6', fg: '#374151' },
  sent: { text: 'Sent to client', bg: '#fef3c7', fg: '#92400e' },
  completed: { text: 'Signed', bg: '#dcfce7', fg: '#166534' },
}

const templateLabel = (t: Template): string =>
  (t.templateLabel && t.templateLabel.trim()) || t.contractTitle || 'Untitled template'

const formatDate = (value?: string | null): string => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ClientSignedContractButton = () => {
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
        // Templates never carry a client, but filter defensively; trashed
        // contracts stay hidden until restored.
        const rows: ContractRow[] = (contractData.docs ?? []).filter(
          (doc: { deletedAt?: string | null; isTemplate?: boolean | null }) => !doc.deletedAt && !doc.isTemplate,
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
    } catch (e: any) {
      setError(e.message)
      setCreating(null)
    }
  }

  if (!clientId) {
    return <div style={hintStyle}>Save the client first to link or create contracts.</div>
  }

  return (
    <div style={{ display: 'grid', gap: 10, paddingTop: 4, paddingBottom: 6 }}>
      {signedContractUrl && (
        <div>
          <button type="button" onClick={handleOpenSigned} style={primaryButtonStyle}>
            Open Signed Contract ↗
          </button>
        </div>
      )}

      {!loaded && <div style={hintStyle}>Loading contracts…</div>}

      {loaded && contracts.length === 0 && !signedContractUrl && (
        <div style={hintStyle}>No contracts linked to this client yet.</div>
      )}

      {contracts.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {contracts.map((contract) => {
            const status = STATUS_LABEL[contract.status ?? 'draft'] ?? STATUS_LABEL.draft
            return (
              <li
                key={String(contract.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  border: '1px solid var(--theme-elevation-150)',
                  borderRadius: 8,
                  background: 'var(--theme-elevation-50)',
                  fontSize: 13,
                }}
              >
                <a
                  href={`/admin/collections/contracts/${contract.id}`}
                  style={{ fontWeight: 700, color: 'var(--theme-text)', textDecoration: 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {contract.contractTitle || 'Untitled contract'}
                </a>
                <span style={{ color: 'var(--theme-elevation-500)', whiteSpace: 'nowrap' }}>{formatDate(contract.contractDate)}</span>
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: status.bg, color: status.fg, whiteSpace: 'nowrap' }}>
                  {status.text}
                </span>
                {contract.signedPdfUrl && (
                  <a href={contract.signedPdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap' }}>
                    PDF ↗
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {templates.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>New contract from template:</span>
          {templates.map((template) => (
            <button
              key={String(template.id)}
              type="button"
              onClick={() => void handleCreate(template)}
              disabled={creating !== null}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                borderRadius: 6,
                background: '#7c3aed',
                color: '#fff',
                cursor: creating ? 'wait' : 'pointer',
                opacity: creating && creating !== String(template.id) ? 0.5 : 1,
              }}
            >
              {creating === String(template.id) ? 'Creating…' : templateLabel(template)}
            </button>
          ))}
        </div>
      )}

      {error && <p style={{ margin: 0, fontSize: 13, color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

const hintStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minHeight: 38,
  fontSize: 13,
  color: 'var(--theme-elevation-500, #888)',
  fontStyle: 'italic',
}

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 18px',
  background: '#2563eb',
  color: 'white',
  border: '1px solid rgba(37, 99, 235, 0.35)',
  borderRadius: 10,
  boxShadow: '0 10px 22px rgba(37, 99, 235, 0.26)',
  fontSize: 13.5,
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  lineHeight: 1.2,
}

export default ClientSignedContractButton
