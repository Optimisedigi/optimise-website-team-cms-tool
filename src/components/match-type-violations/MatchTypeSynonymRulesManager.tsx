'use client'

import { useCallback, useEffect, useState } from 'react'

interface SynonymRule {
  id: string | number
  termA: string
  termB: string
  contextTerms?: string
  sourceSearchTerm?: string
  sourceTriggeringKeyword?: string
  notes?: string
  updatedAt?: string
}

type Draft = { termA: string; termB: string; contextTerms: string; notes: string }

function inputStyle(): React.CSSProperties {
  return { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' }
}

function buttonStyle(variant: 'primary' | 'ghost' | 'danger' = 'primary', disabled?: boolean): React.CSSProperties {
  const bg = variant === 'danger' ? '#dc2626' : variant === 'ghost' ? '#f8fafc' : '#2563eb'
  const color = variant === 'ghost' ? '#334155' : 'white'
  return { padding: '8px 12px', border: variant === 'ghost' ? '1px solid #cbd5e1' : 'none', borderRadius: 6, background: disabled ? '#cbd5e1' : bg, color, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' }
}

function draftFrom(rule: SynonymRule): Draft {
  return { termA: rule.termA || '', termB: rule.termB || '', contextTerms: rule.contextTerms || '', notes: rule.notes || '' }
}

export default function MatchTypeSynonymRulesManager() {
  const [rules, setRules] = useState<SynonymRule[]>([])
  const [form, setForm] = useState<Draft>({ termA: '', termB: '', contextTerms: '', notes: '' })
  const [editingId, setEditingId] = useState<string | number | null>(null)
  const [draft, setDraft] = useState<Draft>({ termA: '', termB: '', contextTerms: '', notes: '' })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/match-type-synonyms')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setRules(Array.isArray(data.docs) ? data.docs : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load synonym rules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchRules() }, [fetchRules])

  const canSave = (input: Draft) => input.termA.trim() && input.termB.trim() && input.termA.trim().toLowerCase() !== input.termB.trim().toLowerCase()

  const create = async () => {
    if (!canSave(form)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/match-type-synonyms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await res.text())
      setForm({ termA: '', termB: '', contextTerms: '', notes: '' })
      await fetchRules()
    } catch (e: any) {
      setError(e?.message || 'Failed to add synonym rule')
    } finally {
      setSaving(false)
    }
  }

  const update = async (id: string | number) => {
    if (!canSave(draft)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/match-type-synonyms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...draft }),
      })
      if (!res.ok) throw new Error(await res.text())
      setEditingId(null)
      await fetchRules()
    } catch (e: any) {
      setError(e?.message || 'Failed to update synonym rule')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (rule: SynonymRule) => {
    if (!window.confirm(`Delete synonym “${rule.termA} ↔ ${rule.termB}”?`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/match-type-synonyms', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id }),
      })
      if (!res.ok) throw new Error(await res.text())
      if (String(editingId) === String(rule.id)) setEditingId(null)
      await fetchRules()
    } catch (e: any) {
      setError(e?.message || 'Failed to delete synonym rule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '0 24px 32px' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Synonyms</h2>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
          Add, edit, or delete synonym rules used by confidence categorization. They do not change Google Ads detection.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '160px 160px 1fr 1fr auto', gap: 10, alignItems: 'start', marginBottom: 18, padding: 14, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f8fafc' }}>
        <input value={form.termA} onChange={(e) => setForm({ ...form, termA: e.target.value })} placeholder="Term A" style={inputStyle()} />
        <input value={form.termB} onChange={(e) => setForm({ ...form, termB: e.target.value })} placeholder="Term B" style={inputStyle()} />
        <input value={form.contextTerms} onChange={(e) => setForm({ ...form, contextTerms: e.target.value })} placeholder="Context optional" style={inputStyle()} />
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes optional" style={inputStyle()} />
        <button onClick={() => void create()} disabled={!canSave(form) || saving} style={buttonStyle('primary', !canSave(form) || saving)}>{saving ? 'Saving…' : 'Add synonym'}</button>
      </div>

      {error && <div style={{ marginBottom: 12, padding: 10, borderRadius: 6, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: 13 }}>{error}</div>}
      {loading ? (
        <div style={{ padding: 30, color: '#64748b' }}>Loading synonym rules…</div>
      ) : rules.length === 0 ? (
        <div style={{ padding: 30, color: '#64748b', border: '1px dashed #cbd5e1', borderRadius: 8 }}>No saved synonym rules yet. Add one above or use Teach synonym from a violation row.</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th()}>Term A</th>
                <th style={th()}>Term B</th>
                <th style={th()}>Context</th>
                <th style={th()}>Notes / Source</th>
                <th style={th()}>Updated</th>
                <th style={th()}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const isEditing = String(editingId) === String(rule.id)
                return (
                  <tr key={String(rule.id)} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={td()}>{isEditing ? <input value={draft.termA} onChange={(e) => setDraft({ ...draft, termA: e.target.value })} style={inputStyle()} /> : <strong>{rule.termA}</strong>}</td>
                    <td style={td()}>{isEditing ? <input value={draft.termB} onChange={(e) => setDraft({ ...draft, termB: e.target.value })} style={inputStyle()} /> : <strong>{rule.termB}</strong>}</td>
                    <td style={td()}>{isEditing ? <input value={draft.contextTerms} onChange={(e) => setDraft({ ...draft, contextTerms: e.target.value })} style={inputStyle()} /> : (rule.contextTerms || 'Global')}</td>
                    <td style={td()}>{isEditing ? <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} style={inputStyle()} /> : (rule.notes || (rule.sourceSearchTerm || rule.sourceTriggeringKeyword ? `${rule.sourceSearchTerm || '—'} ↔ ${rule.sourceTriggeringKeyword || '—'}` : '—'))}</td>
                    <td style={td()}>{rule.updatedAt ? new Date(rule.updatedAt).toLocaleDateString() : '—'}</td>
                    <td style={td()}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {isEditing ? (
                          <>
                            <button onClick={() => void update(rule.id)} disabled={!canSave(draft) || saving} style={buttonStyle('primary', !canSave(draft) || saving)}>Save</button>
                            <button onClick={() => setEditingId(null)} disabled={saving} style={buttonStyle('ghost', saving)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingId(rule.id); setDraft(draftFrom(rule)) }} disabled={saving} style={buttonStyle('ghost', saving)}>Edit</button>
                            <button onClick={() => void remove(rule)} disabled={saving} style={buttonStyle('danger', saving)}>Delete</button>
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
