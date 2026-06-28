'use client'

import { useEffect, useState } from 'react'

type SoulRule = {
  id: string | number
  appliesTo?: 'all' | 'google-ads' | 'email' | 'invoice' | null
  aspect?: string | null
  content?: string | null
}

const appliesToOptions = [
  { label: 'All OptiMate surfaces', value: 'all' },
  { label: 'Google Ads OptiMate', value: 'google-ads' },
  { label: 'Email drafting', value: 'email' },
  { label: 'InvoiceMate / Xero', value: 'invoice' },
] as const

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
}

function normaliseAspect(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function OptiMateSoulSettingsPanel() {
  const [rules, setRules] = useState<SoulRule[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [draft, setDraft] = useState({ appliesTo: 'all', aspect: '', content: '' })

  const loadRules = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/agent-soul?limit=100&sort=appliesTo,aspect', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'Failed to load OptiMate Soul')
      setRules(Array.isArray(data.docs) ? data.docs : [])
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load OptiMate Soul')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRules()
  }, [])

  const createRule = async () => {
    const aspect = normaliseAspect(draft.aspect)
    const content = draft.content.trim()
    if (!aspect || !content) {
      setMessage('Add both an aspect key and a rule before saving.')
      return
    }

    setMessage('')
    const res = await fetch('/api/agent-soul', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliesTo: draft.appliesTo, aspect, content }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage(data?.message || data?.error || 'Could not save OptiMate Soul rule.')
      return
    }

    setDraft({ appliesTo: 'all', aspect: '', content: '' })
    setRules((prev) => [data.doc || data, ...prev])
    setMessage('Saved OptiMate Soul rule.')
  }

  const updateRule = async (rule: SoulRule) => {
    const aspect = normaliseAspect(rule.aspect || '')
    const content = (rule.content || '').trim()
    if (!aspect || !content) {
      setMessage('Aspect and content are required.')
      return
    }

    const res = await fetch(`/api/agent-soul/${rule.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliesTo: rule.appliesTo || 'all', aspect, content }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage(data?.message || data?.error || 'Could not update OptiMate Soul rule.')
      return
    }

    setRules((prev) => prev.map((item) => item.id === rule.id ? (data.doc || data) : item))
    setMessage('Updated OptiMate Soul rule.')
  }

  const updateLocalRule = (id: SoulRule['id'], patch: Partial<SoulRule>) => {
    setRules((prev) => prev.map((rule) => rule.id === id ? { ...rule, ...patch } : rule))
  }

  return (
    <section style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 18, background: 'var(--theme-elevation-0)' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>OptiMate Soul</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--theme-elevation-600)', maxWidth: 820 }}>
        Store OptiMate communication rules here. These are loaded into prompts as tone, formatting, pacing, and behaviour guidance.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) minmax(180px, 260px) minmax(420px, 1fr) auto', gap: 10, alignItems: 'start', marginBottom: 18 }}>
        <select value={draft.appliesTo} onChange={(e) => setDraft((prev) => ({ ...prev, appliesTo: e.target.value }))} style={inputStyle}>
          {appliesToOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input value={draft.aspect} onChange={(e) => setDraft((prev) => ({ ...prev, aspect: e.target.value }))} placeholder="aspect-key" style={inputStyle} />
        <textarea value={draft.content} onChange={(e) => setDraft((prev) => ({ ...prev, content: e.target.value }))} placeholder="Rule, e.g. Lead with the answer first." rows={4} style={{ ...inputStyle, minHeight: 112, resize: 'vertical' }} />
        <button type="button" onClick={createRule} style={buttonStyle}>Add</button>
      </div>

      {message && <div style={{ marginBottom: 12, fontSize: 13, color: message.includes('Could') || message.includes('Failed') || message.includes('required') ? '#b91c1c' : 'var(--theme-elevation-600)' }}>{message}</div>}
      {loading && <div style={{ fontSize: 13, color: 'var(--theme-elevation-500)' }}>Loading OptiMate Soul…</div>}

      {!loading && rules.length === 0 && <div style={{ fontSize: 13, color: 'var(--theme-elevation-500)' }}>No OptiMate Soul rules saved yet.</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        {rules.map((rule) => (
          <div key={String(rule.id)} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) minmax(180px, 260px) minmax(420px, 1fr) auto', gap: 10, alignItems: 'start', borderTop: '1px solid var(--theme-elevation-100)', paddingTop: 10 }}>
            <select value={rule.appliesTo || 'all'} onChange={(e) => updateLocalRule(rule.id, { appliesTo: e.target.value as SoulRule['appliesTo'] })} style={inputStyle}>
              {appliesToOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <input value={rule.aspect || ''} onChange={(e) => updateLocalRule(rule.id, { aspect: e.target.value })} style={inputStyle} />
            <textarea value={rule.content || ''} onChange={(e) => updateLocalRule(rule.id, { content: e.target.value })} rows={4} style={{ ...inputStyle, minHeight: 112, resize: 'vertical' }} />
            <button type="button" onClick={() => updateRule(rule)} style={buttonStyle}>Save</button>
          </div>
        ))}
      </div>
    </section>
  )
}
