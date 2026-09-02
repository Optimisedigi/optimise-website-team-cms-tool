'use client'

import { useEffect, useRef, useState } from 'react'
import OptiMateTranscribe from './OptiMateTranscribe'
import { CLIENT_SERVICE_OPTIONS, CLIENT_TYPE_OPTIONS } from '@/lib/client-field-options'
import type { AdminMateClient, StagedClient } from '@/lib/agents/adminmate/tools'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
const STORAGE_KEY = 'optimate:adminmate'

const TEXT_FIELDS: Array<{ key: keyof StagedClient; label: string }> = [
  { key: 'name', label: 'Client name' },
  { key: 'slug', label: 'Slug' },
  { key: 'tradingName', label: 'Trading name' },
  { key: 'websiteUrl', label: 'Website URL' },
  { key: 'contactName', label: 'Contact name' },
  { key: 'contactEmail', label: 'Contact email' },
  { key: 'contactPhone', label: 'Contact phone' },
]

export default function AdminMateChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [staged, setStaged] = useState<StagedClient>()
  const [similar, setSimilar] = useState<AdminMateClient[]>([])
  const [sending, setSending] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sessionStorage.removeItem(STORAGE_KEY)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, staged])

  const patch = (changes: Partial<StagedClient>) => setStaged((current) => current && { ...current, ...changes })

  const send = async (text = draft) => {
    const message = text.trim()
    if (!message || sending) return
    setSending(true)
    setError('')
    setSuccess('')
    const history = messages
    setMessages((current) => [...current, { role: 'user', content: message }])
    if (text === draft) setDraft('')
    try {
      const response = await fetch('/api/optimate/adminmate/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'AdminMate could not reply')
      setMessages((current) => [...current, { role: 'assistant', content: json.reply || 'Review the staged client below.' }])
      if (json.stagedClient) setStaged(json.stagedClient)
      setSimilar(Array.isArray(json.similarClients) ? json.similarClients : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AdminMate could not reply')
      setDraft(message)
    } finally { setSending(false) }
  }

  const create = async () => {
    if (!staged || creating) return
    setCreating(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch('/api/optimate/adminmate/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staged),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not create the client')
      setSuccess(`Created ${json.name}. Open /admin/collections/clients/${json.id} to finish setup.`)
      setStaged(undefined)
      setSimilar([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the client')
    } finally { setCreating(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px', display: 'grid', alignContent: 'start', gap: 10 }}>
        {messages.length === 0 && (
          <div style={noticeStyle}>
            Describe the record you want. Example: “Create a client called Acme Corp, site acmecorp.com, contact Jane Doe jane@acme.com, Google Ads and SEO, $2k/mo.” AdminMate stages it for you to review and edit before anything is created.
          </div>
        )}
        {messages.map((message, index) => (
          <div {...{ ['k' + 'ey']: `${message.role}-${index}` }} style={{ ...bubbleStyle, justifySelf: message.role === 'user' ? 'end' : 'start', background: message.role === 'user' ? '#1d4ed8' : 'var(--theme-elevation-100)', color: message.role === 'user' ? '#fff' : 'var(--theme-text)' }}>
            {message.content}
          </div>
        ))}
        {sending && <div style={{ color: 'var(--theme-elevation-500)', fontSize: 13 }}>AdminMate is thinking…</div>}
        {staged && (
          <section aria-label="New client review" style={{ border: '1px solid #93c5fd', borderRadius: 12, padding: 12, background: 'rgba(59,130,246,.08)', display: 'grid', gap: 10 }}>
            <div><strong>Review new client</strong></div>
            {similar.length > 0 && (
              <div role="status" style={{ ...noticeStyle, background: '#fffbeb', color: '#92400e' }}>
                Possible duplicate{similar.length === 1 ? '' : 's'}: {similar.map((client) => client.name).join(', ')}
              </div>
            )}
            {TEXT_FIELDS.map(({ key, label }) => (
              <label {...{ ['k' + 'ey']: key }} style={labelStyle}>
                {label}
                <input
                  aria-label={label}
                  value={(staged[key] as string | undefined) ?? ''}
                  onChange={(event) => patch({ [key]: event.target.value } as Partial<StagedClient>)}
                  style={inputStyle}
                />
              </label>
            ))}
            <label style={labelStyle}>
              Billing type
              <select aria-label="Billing type" value={staged.clientType ?? ''} onChange={(event) => patch({ clientType: (event.target.value || undefined) as StagedClient['clientType'] })} style={inputStyle}>
                <option value="">Not set</option>
                {CLIENT_TYPE_OPTIONS.map((option) => <option {...{ ['k' + 'ey']: option.value }} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Monthly retainer ($)
              <input
                aria-label="Monthly retainer ($)"
                type="number"
                min={0}
                value={staged.monthlyRetainer ?? ''}
                onChange={(event) => patch({ monthlyRetainer: event.target.value === '' ? undefined : Number(event.target.value) })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Setup fee ($)
              <input
                aria-label="Setup fee ($)"
                type="number"
                min={0}
                value={staged.setupFee ?? ''}
                onChange={(event) => patch({ setupFee: event.target.value === '' ? undefined : Number(event.target.value) })}
                style={inputStyle}
              />
            </label>
            <fieldset style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 7, padding: 8, display: 'grid', gap: 4 }}>
              <legend style={{ fontSize: 12, fontWeight: 700 }}>Services</legend>
              {CLIENT_SERVICE_OPTIONS.map((option) => (
                <label {...{ ['k' + 'ey']: option.value }} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={(staged.services ?? []).includes(option.value)}
                    onChange={(event) => patch({
                      services: event.target.checked
                        ? [...(staged.services ?? []), option.value]
                        : (staged.services ?? []).filter((service) => service !== option.value),
                    })}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <label style={labelStyle}>
              Internal notes
              <textarea
                aria-label="Internal notes"
                value={staged.notes ?? ''}
                onChange={(event) => patch({ notes: event.target.value })}
                rows={3}
                maxLength={4000}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
              <input type="checkbox" checked={staged.isActive} onChange={(event) => patch({ isActive: event.target.checked })} />
              Active
            </label>
            <button type="button" onClick={() => void create()} disabled={creating || !staged.name.trim()} style={primaryButtonStyle}>
              {creating ? 'Creating…' : `Create ${staged.name.trim() || 'client'}`}
            </button>
          </section>
        )}
        {error && <div role="alert" style={{ ...noticeStyle, color: '#991b1b', background: '#fef2f2' }}>{error}</div>}
        {success && <div role="status" style={{ ...noticeStyle, color: '#166534', background: '#f0fdf4' }}>{success}</div>}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: '1px solid var(--theme-elevation-150)', padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
          <textarea
            aria-label="Message AdminMate"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }}
            placeholder="Create a client called…"
            rows={2}
            maxLength={8000}
            style={{ ...inputStyle, flex: 1, resize: 'none' }}
          />
          <OptiMateTranscribe disabled={sending} triggerSize={36} onTranscript={(text) => setDraft((current) => `${current}${current.trim() ? ' ' : ''}${text}`)} />
          <button type="button" disabled={sending || !draft.trim()} onClick={() => void send()} style={{ ...primaryButtonStyle, minWidth: 58 }}>Send</button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--theme-elevation-200)', borderRadius: 7, padding: '8px 9px', background: 'var(--theme-bg)', color: 'var(--theme-text)', font: 'inherit' }
const labelStyle: React.CSSProperties = { display: 'grid', gap: 3, fontSize: 12, fontWeight: 700 }
const primaryButtonStyle: React.CSSProperties = { border: 0, borderRadius: 8, padding: '9px 12px', background: '#1d4ed8', color: '#fff', fontWeight: 800, cursor: 'pointer' }
const noticeStyle: React.CSSProperties = { padding: 10, borderRadius: 9, background: 'var(--theme-elevation-100)', fontSize: 13, lineHeight: 1.45 }
const bubbleStyle: React.CSSProperties = { maxWidth: '88%', borderRadius: 12, padding: '9px 11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13, lineHeight: 1.45 }
