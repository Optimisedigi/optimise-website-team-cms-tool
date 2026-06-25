'use client'

import { useCallback, useEffect, useState } from 'react'

interface AllowListTerm {
  id: string | number
  term: string
  category?: string
  active?: boolean
  notes?: string
  updatedAt?: string
}

type Draft = { term: string; category: string; notes: string }

const CATEGORY_OPTIONS = [
  { value: 'acronym', label: 'Acronym' },
  { value: 'job_title', label: 'Job title' },
  { value: 'industry_term', label: 'Industry term' },
  { value: 'client_jargon', label: 'Client jargon' },
  { value: 'other', label: 'Other' },
]

function inputStyle(): React.CSSProperties {
  return { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }
}

function buttonStyle(variant: 'primary' | 'ghost' | 'danger' = 'primary', disabled?: boolean): React.CSSProperties {
  const bg = variant === 'danger' ? '#dc2626' : variant === 'ghost' ? '#f8fafc' : '#2563eb'
  const color = variant === 'ghost' ? '#334155' : 'white'
  return { padding: '8px 12px', border: variant === 'ghost' ? '1px solid #cbd5e1' : 'none', borderRadius: 6, background: disabled ? '#cbd5e1' : bg, color, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' }
}

function draftFrom(row: AllowListTerm): Draft {
  return { term: row.term || '', category: row.category || 'acronym', notes: row.notes || '' }
}

export default function MatchTypeAllowListManager() {
  const [terms, setTerms] = useState<AllowListTerm[]>([])
  const [term, setTerm] = useState('')
  const [category, setCategory] = useState('acronym')
  const [notes, setNotes] = useState('')
  const [editingId, setEditingId] = useState<string | number | null>(null)
  const [draft, setDraft] = useState<Draft>({ term: '', category: 'acronym', notes: '' })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTerms = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/match-type-allow-list')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setTerms(Array.isArray(data.docs) ? data.docs : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load allow-list terms')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchTerms() }, [fetchTerms])

  const save = async () => {
    if (!term.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/match-type-allow-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, category, notes }),
      })
      if (!res.ok) throw new Error(await res.text())
      setTerm('')
      setNotes('')
      await fetchTerms()
    } catch (e: any) {
      setError(e?.message || 'Failed to save allow-list term')
    } finally {
      setSaving(false)
    }
  }

  const update = async (id: string | number) => {
    if (!draft.term.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/match-type-allow-list', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...draft }),
      })
      if (!res.ok) throw new Error(await res.text())
      setEditingId(null)
      await fetchTerms()
    } catch (e: any) {
      setError(e?.message || 'Failed to update allow-list term')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: AllowListTerm) => {
    if (!window.confirm(`Delete allow-list term “${row.term}”?`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/match-type-allow-list', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      })
      if (!res.ok) throw new Error(await res.text())
      if (String(editingId) === String(row.id)) setEditingId(null)
      await fetchTerms()
    } catch (e: any) {
      setError(e?.message || 'Failed to delete allow-list term')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '0 24px 32px' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Allow List</h2>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
          Terms here are treated as neutral in confidence scoring. Edit or delete a term, then refresh the Violations tab to recategorize visible rows.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 180px 1fr auto', gap: 10, alignItems: 'start', marginBottom: 18, padding: 14, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f8fafc' }}>
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. cio" style={inputStyle()} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle()}>
          {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes optional" style={inputStyle()} />
        <button onClick={() => void save()} disabled={!term.trim() || saving} style={buttonStyle('primary', !term.trim() || saving)}>{saving ? 'Saving…' : 'Add term'}</button>
      </div>

      {error && <div style={{ marginBottom: 12, padding: 10, borderRadius: 6, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: 13 }}>{error}</div>}
      {loading ? (
        <div style={{ padding: 30, color: '#64748b' }}>Loading allow-list terms…</div>
      ) : terms.length === 0 ? (
        <div style={{ padding: 30, color: '#64748b', border: '1px dashed #cbd5e1', borderRadius: 8 }}>No saved allow-list terms yet. Default acronym terms still apply.</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
            <thead><tr style={{ background: '#f8fafc' }}><th style={th()}>Term</th><th style={th()}>Category</th><th style={th()}>Notes</th><th style={th()}>Updated</th><th style={th()}>Actions</th></tr></thead>
            <tbody>
              {terms.map((row) => {
                const isEditing = String(editingId) === String(row.id)
                return (
                  <tr key={String(row.id)} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={td()}>{isEditing ? <input value={draft.term} onChange={(e) => setDraft({ ...draft, term: e.target.value })} style={inputStyle()} /> : <strong>{row.term}</strong>}</td>
                    <td style={td()}>{isEditing ? <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} style={inputStyle()}>{CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : (CATEGORY_OPTIONS.find((option) => option.value === row.category)?.label ?? row.category ?? '—')}</td>
                    <td style={td()}>{isEditing ? <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} style={inputStyle()} /> : (row.notes || '—')}</td>
                    <td style={td()}>{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : '—'}</td>
                    <td style={td()}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {isEditing ? (
                          <>
                            <button onClick={() => void update(row.id)} disabled={!draft.term.trim() || saving} style={buttonStyle('primary', !draft.term.trim() || saving)}>Save</button>
                            <button onClick={() => setEditingId(null)} disabled={saving} style={buttonStyle('ghost', saving)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingId(row.id); setDraft(draftFrom(row)) }} disabled={saving} style={buttonStyle('ghost', saving)}>Edit</button>
                            <button onClick={() => void remove(row)} disabled={saving} style={buttonStyle('danger', saving)}>Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function th(): React.CSSProperties { return { padding: '10px 12px', textAlign: 'left', color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' } }
function td(): React.CSSProperties { return { padding: '10px 12px', verticalAlign: 'top', color: '#334155' } }
