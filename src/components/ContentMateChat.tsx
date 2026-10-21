'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BlogIdeaLiveVoice } from './BlogIdeaVoiceChat'
import {
  BLOG_IDEA_FIELDS,
  buildContentMateVoiceSession,
  emptyBlogIdeaDraft,
  mergeBlogIdeaDraft,
  resolveSaveTarget,
  validateBlogIdeaDraft,
  validateBlogIdeaSaveRequest,
  type BlogIdeaAction,
  type BlogIdeaClient,
  type BlogIdeaDraft,
  type SavedBlogIdea,
} from '@/lib/contentmate/blog-idea'

/**
 * ContentMate (OptiMate agent, desktop and phone): talk or type a blog idea.
 * The plan fills every Blog Prompter field below as it takes shape. When the
 * user says it is final, ContentMate saves it under the client they named.
 * Later changes update that same idea until the user moves on to the next one
 * ("Start next idea", or telling ContentMate it is a new idea).
 */

interface ChatMessage { role: 'user' | 'assistant'; content: string }

export default function ContentMateChat(): React.ReactElement {
  const [clients, setClients] = useState<BlogIdeaClient[]>([])
  const [clientId, setClientId] = useState('')
  const [fields, setFields] = useState<BlogIdeaDraft>(emptyBlogIdeaDraft)
  const [current, setCurrent] = useState<SavedBlogIdea | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  // Voice tool calls run asynchronously; refs give them the latest state.
  const stateRef = useRef({ clients, clientId, fields, current })
  stateRef.current = { clients, clientId, fields, current }

  useEffect(() => {
    void fetch('/api/optimate/contentmate/chat', { credentials: 'include' })
      .then(async (response) => {
        const json: unknown = await response.json()
        if (!response.ok || !isRecord(json) || !Array.isArray(json.clients)) throw new Error('Could not load clients')
        setClients(json.clients.filter((c): c is BlogIdeaClient => isRecord(c) && typeof c.id === 'string' && typeof c.name === 'string'))
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load clients'))
  }, [])

  const addTurn = useCallback((role: 'user' | 'assistant', content: string) => {
    setMessages((list) => [...list, { role, content }])
  }, [])

  const showPlan = useCallback((plan: BlogIdeaDraft) => {
    setFields((prev) => mergeBlogIdeaDraft(prev, plan))
    if (plan.clientId) setClientId(plan.clientId)
    setStatus('')
  }, [])

  /**
   * Saves the plan under its client: updates the idea saved in this
   * conversation, or creates a new one. Returns the message for the model/user;
   * throws with a message the model can act on (e.g. ask for the client).
   */
  const savePlan = useCallback(async (plan: BlogIdeaDraft, action: BlogIdeaAction): Promise<string> => {
    const state = stateRef.current
    const target = resolveSaveTarget(state.current, action)
    const base = target.kind === 'update' && state.current ? state.current.draft : emptyBlogIdeaDraft()
    const merged = mergeBlogIdeaDraft(base, plan)
    const client = state.clients.find((c) => c.id === (plan.clientId || state.clientId))
    if (!client) throw new Error('No client chosen. Ask the user which client this blog idea is for.')
    const draft: BlogIdeaDraft = { ...merged, clientId: client.id, clientName: client.name }
    setFields(draft)
    setClientId(client.id)
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/optimate/contentmate/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, confirmed: true, ...(target.kind === 'update' ? { ideaId: target.id } : {}) }),
      })
      const json: unknown = await response.json().catch(() => null)
      const saved = isRecord(json) && isRecord(json.saved) ? json.saved : null
      if (!response.ok || !saved || (typeof saved.id !== 'string' && typeof saved.id !== 'number')) {
        throw new Error(isRecord(json) && typeof json.error === 'string' ? json.error : 'Could not save the blog idea')
      }
      const id = String(saved.id)
      setCurrent({ id, clientId: client.id, clientName: client.name, draft })
      const message = target.kind === 'update'
        ? `Updated the blog idea for ${client.name}.`
        : `Saved a new blog idea for ${client.name} in the Blog Prompter.`
      setStatus(message)
      return message
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save the blog idea'
      setError(message)
      throw new Error(message)
    } finally {
      setSaving(false)
    }
  }, [])

  const handleVoiceSave = useCallback(async (args: unknown): Promise<string> => {
    const parsed = validateBlogIdeaSaveRequest(args, stateRef.current.clients)
    if (!parsed.ok) throw new Error(parsed.error)
    return savePlan(parsed.value.draft, parsed.value.action)
  }, [savePlan])

  const send = async (): Promise<void> => {
    const message = text.trim()
    if (!message || sending) return
    setText('')
    setError('')
    setSending(true)
    addTurn('user', message)
    try {
      const response = await fetch('/api/optimate/contentmate/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: messages.slice(-40),
          ...(current ? { currentIdea: { id: current.id, clientName: current.clientName, blogIdea: current.draft.blogIdea } } : {}),
        }),
      })
      const json: unknown = await response.json()
      if (!response.ok || !isRecord(json)) throw new Error(isRecord(json) && typeof json.error === 'string' ? json.error : 'ContentMate could not reply')
      if (json.proposal !== undefined) {
        const plan = validateBlogIdeaDraft(json.proposal, clients)
        if (plan.ok) showPlan(plan.value)
      }
      let reply = typeof json.reply === 'string' && json.reply ? json.reply : 'The plan is filled in below.'
      if (isRecord(json.saveRequest) && isRecord(json.saveRequest.draft)) {
        const request = validateBlogIdeaSaveRequest({ ...json.saveRequest.draft, ideaAction: json.saveRequest.action }, clients)
        if (request.ok) {
          try {
            await savePlan(request.value.draft, request.value.action)
          } catch (cause) {
            reply = cause instanceof Error ? cause.message : 'Could not save the blog idea'
          }
        }
      }
      addTurn('assistant', reply)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ContentMate could not reply')
    } finally {
      setSending(false)
    }
  }

  const saveNow = (): void => {
    if (!fields.blogIdea.trim()) { setError('Add the blog idea first.'); return }
    void savePlan(fields, current ? 'update_current' : 'new_idea').catch(() => {})
  }

  const startNext = (): void => {
    setCurrent(null)
    setFields(emptyBlogIdeaDraft())
    setStatus('Ready for the next blog idea.')
    setError('')
  }

  const setField = (key: (typeof BLOG_IDEA_FIELDS)[number]['key'], value: string): void => {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="contentmate" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0', color: '#f5f5f7' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <BlogIdeaLiveVoice
          tone="dark"
          onTurn={addTurn}
          onProposal={showPlan}
          onSaveRequest={handleVoiceSave}
          getSession={() => buildContentMateVoiceSession(stateRef.current.clients)}
        />
        <span style={{ fontSize: 12.5, lineHeight: 1.4, color: '#c7c7cc' }}>
          Talk or type your blog idea and say which client it is for. Say it is final to save it.
        </span>
      </div>

      {messages.length > 0 && (
        <div aria-label="ContentMate conversation" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {messages.map((m, index) => (
            <div key={index} style={{ ...bubbleStyle, alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', background: m.role === 'user' ? '#2563eb' : '#2c2c2e', color: '#f5f5f7' }}>
              {m.content}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void send() }} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          aria-label="Message ContentMate"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your blog idea or a change…"
          maxLength={6000}
          style={inputStyle}
        />
        <button type="submit" disabled={sending || !text.trim()} style={primaryButtonStyle}>{sending ? '…' : 'Send'}</button>
      </form>

      {current && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 10, background: '#16302a', border: '1px solid #2f6b5a', fontSize: 12.5 }}>
          <span>Editing the saved idea for <b>{current.clientName}</b>. Changes update it.</span>
          <button type="button" onClick={startNext} style={ghostButtonStyle}>Start next idea</button>
        </div>
      )}

      <section aria-label="Blog brief" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={labelStyle}>
          Client
          <select aria-label="ContentMate client" value={clientId} onChange={(e) => setClientId(e.target.value)} style={inputStyle}>
            <option value="">Select a client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {BLOG_IDEA_FIELDS.map(({ key, label, max, multiline }) => (
          <label key={key} style={labelStyle}>
            {label}
            {multiline ? (
              <textarea aria-label={label} value={fields[key]} maxLength={max} rows={key === 'blogIdea' ? 3 : 2} onChange={(e) => setField(key, e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
            ) : (
              <input type="text" aria-label={label} value={fields[key]} maxLength={max} onChange={(e) => setField(key, e.target.value)} style={inputStyle} />
            )}
          </label>
        ))}
      </section>

      <div style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 0, paddingTop: 4, background: '#1c1c1e' }}>
        <button type="button" onClick={saveNow} disabled={saving} style={{ ...primaryButtonStyle, flex: 1 }}>
          {saving ? 'Saving…' : current ? 'Update idea' : 'Save to Blog Prompter'}
        </button>
      </div>
      {error && <div role="alert" style={{ fontSize: 12.5, color: '#fca5a5' }}>{error}</div>}
      {status && !error && <div role="status" style={{ fontSize: 12.5, color: '#86efac' }}>{status}</div>}
    </div>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: '#d1d1d6' }
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0, boxSizing: 'border-box', border: '1px solid #3a3a3e', borderRadius: 8, padding: '8px 10px', background: '#2a2a2d', color: '#f5f5f7', font: 'inherit', fontSize: 14, fontWeight: 400 }
const primaryButtonStyle: React.CSSProperties = { minHeight: 40, border: 0, borderRadius: 8, padding: '8px 14px', background: '#327766', color: '#fff', fontWeight: 600, cursor: 'pointer' }
const ghostButtonStyle: React.CSSProperties = { minHeight: 32, border: '1px solid #3a3a3e', borderRadius: 8, padding: '4px 10px', background: 'transparent', color: '#f5f5f7', cursor: 'pointer', whiteSpace: 'nowrap' }
const bubbleStyle: React.CSSProperties = { maxWidth: '88%', borderRadius: 12, padding: '8px 11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13, lineHeight: 1.45 }
