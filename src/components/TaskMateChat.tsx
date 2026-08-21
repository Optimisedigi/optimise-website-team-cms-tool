'use client'

import { useEffect, useRef, useState } from 'react'
import OptiMateTranscribe from './OptiMateTranscribe'
import type { StagedTaskList, TaskMateClient, TaskMateUser } from '@/lib/agents/taskmate'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type StoredState = { messages?: ChatMessage[]; draft?: string; staged?: StagedTaskList }
const STORAGE_KEY = 'optimate:taskmate'

export default function TaskMateChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [clients, setClients] = useState<TaskMateClient[]>([])
  const [users, setUsers] = useState<TaskMateUser[]>([])
  const [staged, setStaged] = useState<StagedTaskList>()
  const [sending, setSending] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const hydrated = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') as StoredState
      if (Array.isArray(stored.messages)) setMessages(stored.messages)
      if (typeof stored.draft === 'string') setDraft(stored.draft)
      if (stored.staged) setStaged(stored.staged)
    } catch { sessionStorage.removeItem(STORAGE_KEY) }
    hydrated.current = true
    void fetch('/api/optimate/taskmate/chat').then(async (response) => {
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not load TaskMate')
      setClients(json.clients || [])
      setUsers(json.users || [])
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load TaskMate'))
  }, [])

  useEffect(() => {
    if (hydrated.current) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, draft, staged }))
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, draft, staged])

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
      const response = await fetch('/api/optimate/taskmate/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'TaskMate could not reply')
      setMessages((current) => [...current, { role: 'assistant', content: json.reply || 'Review the staged task list below.' }])
      if (json.clients) setClients(json.clients)
      if (json.users) setUsers(json.users)
      if (json.stagedTaskList) setStaged(json.stagedTaskList)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'TaskMate could not reply')
      setDraft(message)
    } finally { setSending(false) }
  }

  const assign = async () => {
    if (!staged || assigning) return
    setAssigning(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch('/api/optimate/taskmate/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart: staged.weekStart,
          tasks: staged.tasks.map(({ clientName: _clientName, assignedToName: _assignedToName, ...task }) => task),
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not assign tasks')
      setSuccess(`${json.count} task${json.count === 1 ? '' : 's'} assigned.`)
      window.dispatchEvent(new CustomEvent('optimate:taskmate-assigned', { detail: { weekStart: staged.weekStart } }))
      setStaged(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not assign tasks')
    } finally { setAssigning(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px', display: 'grid', alignContent: 'start', gap: 10 }}>
        {messages.length === 0 && (
          <div style={noticeStyle}>
            Tell TaskMate which week and client work you need. Refine the plan together, then generate a review list before anything is assigned.
          </div>
        )}
        {messages.map((message, index) => (
          <div {...{ ['k' + 'ey']: `${message.role}-${index}` }} style={{ ...bubbleStyle, justifySelf: message.role === 'user' ? 'end' : 'start', background: message.role === 'user' ? '#0f766e' : 'var(--theme-elevation-100)', color: message.role === 'user' ? '#fff' : 'var(--theme-text)' }}>
            {message.content}
          </div>
        ))}
        {sending && <div style={{ color: 'var(--theme-elevation-500)', fontSize: 13 }}>TaskMate is thinking…</div>}
        {staged && (
          <section aria-label="Task list review" style={{ border: '1px solid #5eead4', borderRadius: 12, padding: 12, background: 'rgba(20,184,166,.08)', display: 'grid', gap: 10 }}>
            <div><strong>Review week</strong> · {staged.weekStart}</div>
            {staged.tasks.map((task, index) => (
              <div {...{ ['k' + 'ey']: `${task.title}-${index}` }} style={{ padding: 10, borderRadius: 9, background: 'var(--theme-bg)', border: '1px solid var(--theme-elevation-150)', display: 'grid', gap: 6 }}>
                <strong>{task.title}</strong>
                <label style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 700 }}>
                  Client
                  <select
                    aria-label={`Client for ${task.title}`}
                    value={task.clientId}
                    onChange={(event) => setStaged((current) => current && ({ ...current, tasks: current.tasks.map((item, taskIndex) => taskIndex === index ? { ...item, clientId: event.target.value, clientName: clients.find(({ id }) => id === event.target.value)?.name || '' } : item) }))}
                    style={inputStyle}
                  >
                    {clients.map((client) => <option {...{ ['k' + 'ey']: client.id }} value={client.id}>{client.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 700 }}>
                  Assigned to
                  <select
                    aria-label={`Assignee for ${task.title}`}
                    value={task.assignedToId || ''}
                    onChange={(event) => setStaged((current) => current && ({ ...current, tasks: current.tasks.map((item, taskIndex) => taskIndex === index ? { ...item, assignedToId: event.target.value || undefined, assignedToName: users.find(({ id }) => id === event.target.value)?.name } : item) }))}
                    style={inputStyle}
                  >
                    <option value="">Unassigned</option>
                    {users.map((user) => <option {...{ ['k' + 'ey']: user.id }} value={user.id}>{user.name}</option>)}
                  </select>
                </label>
                <span style={{ fontSize: 12, color: 'var(--theme-elevation-600)' }}>{task.dueDate} · {task.taskType.replaceAll('_', ' ')} · {task.priority}</span>
                {task.instructions && <span style={{ fontSize: 13 }}>{task.instructions}</span>}
              </div>
            ))}
            <button type="button" onClick={() => void assign()} disabled={assigning} style={primaryButtonStyle}>
              {assigning ? 'Assigning…' : `Assign ${staged.tasks.length} task${staged.tasks.length === 1 ? '' : 's'}`}
            </button>
          </section>
        )}
        {error && <div role="alert" style={{ ...noticeStyle, color: '#991b1b', background: '#fef2f2' }}>{error}</div>}
        {success && <div role="status" style={{ ...noticeStyle, color: '#166534', background: '#f0fdf4' }}>{success}</div>}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: '1px solid var(--theme-elevation-150)', padding: 10, display: 'grid', gap: 8 }}>
        <button type="button" disabled={sending} onClick={() => void send('Generate task list for review now.')} style={{ ...primaryButtonStyle, background: '#7c3aed' }}>Generate task list</button>
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
          <textarea
            aria-label="Message TaskMate"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (['Enter'].includes(event.key) && !event.shiftKey) { event.preventDefault(); void send() } }}
            placeholder="Discuss tasks, clients, dates, and priorities…"
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
const primaryButtonStyle: React.CSSProperties = { border: 0, borderRadius: 8, padding: '9px 12px', background: '#0f766e', color: '#fff', fontWeight: 800, cursor: 'pointer' }
const noticeStyle: React.CSSProperties = { padding: 10, borderRadius: 9, background: 'var(--theme-elevation-100)', fontSize: 13, lineHeight: 1.45 }
const bubbleStyle: React.CSSProperties = { maxWidth: '88%', borderRadius: 12, padding: '9px 11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13, lineHeight: 1.45 }
