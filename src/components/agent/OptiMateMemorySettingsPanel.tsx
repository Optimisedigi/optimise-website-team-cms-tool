'use client'

import { useEffect, useState } from 'react'

function HelpTooltip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      <span>{label}</span>
      <button type="button" aria-label={`${label} help`} style={{ border: 0, background: 'transparent', color: 'var(--theme-elevation-500)', cursor: 'help', padding: 0, font: 'inherit' }}>ⓘ</button>
      {open && (
        <span role="tooltip" style={{ position: 'absolute', zIndex: 20, left: 0, top: 'calc(100% + 8px)', width: 260, border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: '10px 12px', background: 'var(--theme-bg)', color: 'var(--theme-text)', boxShadow: '0 10px 30px rgba(0,0,0,0.14)', textTransform: 'none', letterSpacing: 0, fontSize: 12, fontWeight: 500, lineHeight: 1.45 }}>
          {text}
        </span>
      )}
    </span>
  )
}

type ClientOption = { id: string | number; name?: string | null }

type MemoryRow = {
  id: string | number
  scope?: 'client' | 'global' | null
  client?: number | string | { id?: number | string; name?: string } | null
  category?: string | null
  subject?: string | null
  content?: string | null
  importance?: number | null
  status?: 'active' | 'needs_review' | 'archived' | null
  confidence?: number | null
  source?: string | null
  updatedAt?: string | null
}

type MemoryDraft = {
  scope: 'client' | 'global'
  client: string
  category: string
  subject: string
  content: string
  importance: number
  confidence: number
  status: 'active' | 'needs_review'
}

const MEMORY_GRID_COLUMNS = '110px minmax(170px, 230px) minmax(140px, 170px) minmax(170px, 230px) minmax(360px, 1fr) 88px 92px 90px auto'

const categoryOptions = [
  { label: 'Preference', value: 'preference' },
  { label: 'Client context', value: 'client-context' },
  { label: 'Account context', value: 'account-context' },
  { label: 'Decision', value: 'decision' },
  { label: 'Constraint', value: 'constraint' },
  { label: 'Policy', value: 'policy' },
  { label: 'History', value: 'history' },
  { label: 'Goal', value: 'goal' },
  { label: 'Other', value: 'other' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 6,
  padding: '8px 10px',
  background: 'var(--theme-input-bg)',
  color: 'var(--theme-text)',
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 6,
  padding: '7px 10px',
  background: 'var(--theme-elevation-50)',
  color: 'var(--theme-text)',
  cursor: 'pointer',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

function clientId(client: MemoryRow['client']): string {
  if (!client) return ''
  if (typeof client === 'object') return String(client.id || '')
  return String(client)
}

const emptyDraft: MemoryDraft = {
  scope: 'client',
  client: '',
  category: 'preference',
  subject: '',
  content: '',
  importance: 50,
  confidence: 80,
  status: 'active',
}

export default function OptiMateMemorySettingsPanel() {
  const [rows, setRows] = useState<MemoryRow[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [draft, setDraft] = useState<MemoryDraft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const loadRows = async () => {
    setLoading(true)
    setMessage('')
    try {
      const [memoryRes, clientsRes] = await Promise.all([
        fetch('/api/agent-memory?limit=100&sort=-updatedAt&depth=1', { credentials: 'include' }),
        fetch('/api/clients/list', { credentials: 'include' }),
      ])
      const memoryData = await memoryRes.json()
      const clientsData = await clientsRes.json()
      if (!memoryRes.ok) throw new Error(memoryData?.message || memoryData?.error || 'Failed to load OptiMate Memory')
      setRows(Array.isArray(memoryData.docs) ? memoryData.docs : [])
      setClients(Array.isArray(clientsData) ? clientsData : [])
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load OptiMate Memory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
  }, [])

  const updateLocalRow = (id: MemoryRow['id'], patch: Partial<MemoryRow>) => {
    setRows((prev) => prev.map((row) => row.id === id ? { ...row, ...patch } : row))
  }

  const memoryPayload = (row: Pick<MemoryDraft, 'scope' | 'client' | 'category' | 'subject' | 'content' | 'importance' | 'confidence' | 'status'>) => {
    const scope = row.scope || 'global'
    const client = scope === 'client' ? row.client : null
    return {
      scope,
      client,
      category: row.category.trim(),
      subject: row.subject.trim(),
      content: row.content.trim(),
      importance: Number(row.importance ?? 50),
      confidence: Number(row.confidence ?? 80),
      status: row.status || 'active',
      source: 'admin-created',
    }
  }

  const validateMemory = (payload: ReturnType<typeof memoryPayload>) => {
    if (!payload.subject || !payload.category || !payload.content) return 'Subject, category, and memory content are required.'
    if (payload.scope === 'client' && !payload.client) return 'Choose a client or set scope to Global.'
    return ''
  }

  const createRow = async () => {
    const payload = memoryPayload(draft)
    const validation = validateMemory(payload)
    if (validation) {
      setMessage(validation)
      return
    }

    const res = await fetch('/api/agent-memory', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage(data?.message || data?.error || 'Could not add OptiMate Memory.')
      return
    }

    setRows((prev) => [data.doc || data, ...prev])
    setDraft(emptyDraft)
    setMessage('Added OptiMate Memory.')
  }

  const saveRow = async (row: MemoryRow) => {
    const payload = memoryPayload({
      scope: row.scope || 'global',
      client: clientId(row.client),
      category: row.category || '',
      subject: row.subject || '',
      content: row.content || '',
      importance: Number(row.importance ?? 50),
      confidence: Number(row.confidence ?? 80),
      status: row.status === 'needs_review' ? 'needs_review' : 'active',
    })
    const validation = validateMemory(payload)
    if (validation) {
      setMessage(validation)
      return
    }

    const res = await fetch(`/api/agent-memory/${row.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage(data?.message || data?.error || 'Could not update OptiMate Memory.')
      return
    }

    setRows((prev) => prev.map((item) => item.id === row.id ? (data.doc || data) : item))
    setMessage('Updated OptiMate Memory.')
  }

  const deleteRow = async (row: MemoryRow) => {
    const label = row.subject || 'this memory'
    if (!window.confirm(`Delete “${label}”? This permanently removes the memory.`)) return

    const res = await fetch(`/api/agent-memory/${row.id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(data?.message || data?.error || 'Could not delete OptiMate Memory.')
      return
    }

    setRows((prev) => prev.filter((item) => item.id !== row.id))
    setMessage('Deleted OptiMate Memory.')
  }

  const categorySelect = (value: string, onChange: (value: string) => void) => (
    <select value={value || 'preference'} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
      {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )

  const clientSelect = (value: string, onChange: (value: string) => void, disabled = false) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }}>
      <option value="">Select client</option>
      {clients.map((client) => <option key={String(client.id)} value={String(client.id)}>{client.name || client.id}</option>)}
    </select>
  )

  return (
    <section style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 18, background: 'var(--theme-elevation-0)', marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>OptiMate Memory</h3>
      <p style={{ margin: '0 0 8px', color: 'var(--theme-elevation-600)', maxWidth: 900 }}>
        Use memory for durable facts about clients, accounts, preferences, decisions, or context. Use Soul for how OptiMate should communicate, such as tone, formatting, and writing style.
      </p>
      <p style={{ margin: '0 0 16px', color: 'var(--theme-elevation-500)', fontSize: 13, maxWidth: 980 }}>
        Required: scope, category, subject, and memory. Client is required only for client-scoped rows. Importance 80+ pins a memory into matching prompts; lower scores stay searchable and are pulled only when relevant. Use Delete to remove memories you no longer want.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: MEMORY_GRID_COLUMNS, gap: 8, alignItems: 'end', marginBottom: 8, fontSize: 11, fontWeight: 700, color: 'var(--theme-elevation-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        <span>Scope</span>
        <span>Client</span>
        <span>Category</span>
        <span>Subject</span>
        <span>Memory</span>
        <HelpTooltip label="Importance" text="0–100. Use 80+ for facts that should be pinned into matching OptiMate prompts. Keep most memories around 50 so they stay searchable without always adding tokens." />
        <HelpTooltip label="Confidence" text="0–100. How sure we are this memory is accurate. Low-confidence memories should be reviewed before relying on them." />
        <span>Status</span>
        <span>Action</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: MEMORY_GRID_COLUMNS, gap: 8, alignItems: 'start', marginBottom: 18 }}>
        <select value={draft.scope} onChange={(e) => setDraft((prev) => ({ ...prev, scope: e.target.value as MemoryDraft['scope'], client: e.target.value === 'global' ? '' : prev.client }))} style={inputStyle}>
          <option value="client">Client</option>
          <option value="global">Global</option>
        </select>
        {clientSelect(draft.client, (client) => setDraft((prev) => ({ ...prev, client })), draft.scope === 'global')}
        {categorySelect(draft.category, (category) => setDraft((prev) => ({ ...prev, category })))}
        <input value={draft.subject} onChange={(e) => setDraft((prev) => ({ ...prev, subject: e.target.value }))} placeholder="subject" style={inputStyle} />
        <textarea value={draft.content} onChange={(e) => setDraft((prev) => ({ ...prev, content: e.target.value }))} placeholder="Memory content" rows={4} style={{ ...inputStyle, minHeight: 104, resize: 'vertical' }} />
        <input type="number" min={0} max={100} value={draft.importance} onChange={(e) => setDraft((prev) => ({ ...prev, importance: Number(e.target.value) }))} title="0–100. Use 80+ to pin important facts into matching OptiMate prompts. Keep most memories around 50 so they stay searchable without always adding tokens." style={inputStyle} />
        <input type="number" min={0} max={100} value={draft.confidence} onChange={(e) => setDraft((prev) => ({ ...prev, confidence: Number(e.target.value) }))} title="0–100. How sure we are this memory is accurate. Low-confidence memories should be reviewed before relying on them." style={inputStyle} />
        <select value={draft.status} onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value as MemoryDraft['status'] }))} style={inputStyle}>
          <option value="active">Active</option>
          <option value="needs_review">Review</option>
        </select>
        <button type="button" onClick={createRow} style={buttonStyle}>Add</button>
      </div>

      {message && <div style={{ marginBottom: 12, fontSize: 13, color: message.includes('Could') || message.includes('Failed') || message.includes('required') || message.includes('Choose') ? '#b91c1c' : 'var(--theme-elevation-600)' }}>{message}</div>}
      {loading && <div style={{ fontSize: 13, color: 'var(--theme-elevation-500)' }}>Loading OptiMate Memory…</div>}
      {!loading && rows.length === 0 && <div style={{ fontSize: 13, color: 'var(--theme-elevation-500)' }}>No OptiMate Memory rows saved yet.</div>}

      {!loading && rows.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((row) => {
            const scope = row.scope || 'global'
            return (
              <div key={String(row.id)} style={{ display: 'grid', gridTemplateColumns: MEMORY_GRID_COLUMNS, gap: 8, alignItems: 'start', borderTop: '1px solid var(--theme-elevation-100)', paddingTop: 10 }}>
                <select value={scope} onChange={(e) => updateLocalRow(row.id, { scope: e.target.value as MemoryRow['scope'], client: e.target.value === 'global' ? null : row.client })} style={inputStyle}>
                  <option value="client">Client</option>
                  <option value="global">Global</option>
                </select>
                {clientSelect(clientId(row.client), (client) => updateLocalRow(row.id, { client }), scope === 'global')}
                {categorySelect(row.category || 'preference', (category) => updateLocalRow(row.id, { category }))}
                <input value={row.subject || ''} onChange={(e) => updateLocalRow(row.id, { subject: e.target.value })} placeholder="subject" style={inputStyle} />
                <textarea value={row.content || ''} onChange={(e) => updateLocalRow(row.id, { content: e.target.value })} rows={4} style={{ ...inputStyle, minHeight: 104, resize: 'vertical' }} />
                <input type="number" min={0} max={100} value={row.importance ?? 50} onChange={(e) => updateLocalRow(row.id, { importance: Number(e.target.value) })} title="0–100. Use 80+ to pin important facts into matching OptiMate prompts. Keep most memories around 50 so they stay searchable without always adding tokens." style={inputStyle} />
                <input type="number" min={0} max={100} value={row.confidence ?? 80} onChange={(e) => updateLocalRow(row.id, { confidence: Number(e.target.value) })} title="0–100. How sure we are this memory is accurate. Low-confidence memories should be reviewed before relying on them." style={inputStyle} />
                <select value={row.status === 'needs_review' ? 'needs_review' : 'active'} onChange={(e) => updateLocalRow(row.id, { status: e.target.value as MemoryRow['status'] })} style={inputStyle}>
                  <option value="active">Active</option>
                  <option value="needs_review">Review</option>
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => saveRow(row)} style={buttonStyle}>Save</button>
                  <button type="button" onClick={() => deleteRow(row)} style={{ ...buttonStyle, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
