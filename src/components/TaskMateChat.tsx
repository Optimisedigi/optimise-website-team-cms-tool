'use client'

import { useEffect, useRef, useState } from 'react'
import TaskMateLiveVoice from './TaskMateLiveVoice'
import OptiMateBeamComposer from './OptiMateBeamComposer'
import OptiMateMetalSend from './OptiMateMetalSend'
import { ThinkingOrb } from 'thinking-orbs'
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
  const [voiceActive, setVoiceActive] = useState(false)
  const [generationProgress, setGenerationProgress] = useState('')
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

  const send = async (text = draft, displayText = text) => {
    const message = text.trim()
    if (!message || sending) return
    setSending(true)
    setError('')
    setSuccess('')
    const history = messages.slice(-50)
    setMessages((current) => [...current, { role: 'user', content: displayText }])
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
      if (text === draft) setDraft(message)
    } finally { setSending(false) }
  }

  const generate = async () => {
    const requests = messages.filter((entry) => entry.role === 'user' && entry.content !== 'Generate task list for review now.').map((entry) => entry.content)
    const prompt = `Generate task list for review now from all of these requests, accounting for later corrections:\n${requests.join('\n')}`
    if (prompt.length <= 8000) {
      await send(prompt, 'Generate task list for review now.')
      return
    }

    const conversation = messages.filter((entry) => entry.content !== 'Generate task list for review now.')
      .map((entry) => `${entry.role === 'user' ? 'Admin' : 'TaskMate'}: ${entry.content}`)
    const portions = splitRequests(conversation, 6900)
    setSending(true)
    setError('')
    setSuccess('')
    setMessages((current) => [...current, { role: 'user', content: 'Generate task list for review now.' }])
    try {
      let combined: StagedTaskList | undefined
      for (const [index, portion] of portions.entries()) {
        setGenerationProgress(`Generating portion ${index + 1} of ${portions.length}…`)
        const response = await fetch('/api/optimate/taskmate/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Generate task list for review now from portion ${index + 1} of ${portions.length}. TaskMate lines are context, not new requests. Include only the admin's tasks in this portion; keep the requested week${combined ? ` starting ${combined.weekStart}` : ''}. Account for corrections here to earlier tasks, retaining their title and client when updating them:\n${portion}`,
            history: [],
          }),
        })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'TaskMate could not generate this portion')
        const next = json.stagedTaskList as StagedTaskList | undefined
        if (!next?.tasks?.length) throw new Error(`TaskMate did not stage portion ${index + 1}. No partial list was applied; try again.`)
        if (combined && combined.weekStart !== next.weekStart) throw new Error('The portions used different weeks. No partial list was applied; clarify the week and try again.')
        const tasks = combined ? [...combined.tasks] : []
        for (const task of next.tasks) {
          const previous = tasks.findIndex((item) => item.clientId === task.clientId && item.title.toLowerCase() === task.title.toLowerCase())
          if (previous >= 0) tasks[previous] = task
          else tasks.push(task)
        }
        if (tasks.length > 50) throw new Error('More than 50 tasks were proposed. No partial list was applied; prepare separate weekly lists.')
        combined = { weekStart: next.weekStart, tasks }
        if (json.clients) setClients(json.clients)
        if (json.users) setUsers(json.users)
      }
      setStaged(combined)
      setMessages((current) => [...current, { role: 'assistant', content: `Review the ${combined?.tasks.length ?? 0} tasks gathered from ${portions.length} portions before assigning.` }])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'TaskMate could not generate the task list')
    } finally {
      setGenerationProgress('')
      setSending(false)
    }
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
          <div {...{ ['k' + 'ey']: `${message.role}-${index}` }} style={{ ...bubbleStyle, justifySelf: message.role === 'user' ? 'end' : 'start', background: message.role === 'user' ? '#0f766e' : '#2a2a2d', color: '#fff' }}>
            {message.content}
          </div>
        ))}
        {sending && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--theme-elevation-600)', fontSize: 13 }}>
            <ThinkingOrb state="working" size={20} theme="dark" aria-label="TaskMate is thinking" />
            <span>TaskMate is thinking…</span>
          </div>
        )}
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
        <button type="button" disabled={sending || voiceActive || messages.length === 0} onClick={() => void generate()} style={{ ...primaryButtonStyle, background: '#7c3aed', opacity: sending || voiceActive || messages.length === 0 ? 0.55 : 1 }}>Generate task list</button>
        {generationProgress && <span role="status">{generationProgress}</span>}
        <span id="taskmate-live-notice" role={voiceActive ? 'status' : undefined} style={{ fontSize: 12, color: 'var(--theme-elevation-700)' }}>
          {voiceActive ? 'End the live call before generating the review list.' : 'GPT Live sends microphone audio to OpenAI when you start a call.'}
        </span>
        <OptiMateBeamComposer>
          <div style={{ position: 'relative', minHeight: 116, padding: '16px 16px 54px' }}>
            <textarea
              aria-label="Message TaskMate"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (['Enter'].includes(event.key) && !event.shiftKey) { event.preventDefault(); void send() } }}
              placeholder="Discuss tasks, clients, dates, and priorities…"
              rows={3}
              maxLength={8000}
              data-optimate-input=""
              style={{ ...inputStyle, minHeight: 48, resize: 'none', padding: 0 }}
            />
            <div data-optimate-control-row="" style={{ position: 'absolute', insetInline: 16, bottom: 12, justifyContent: 'flex-end' }}>
              <TaskMateLiveVoice disabled={sending} onActiveChange={setVoiceActive} onTurn={(role, content) => setMessages((current) => [...current, { role, content }])} />
              <OptiMateMetalSend>
                <button type="button" disabled={sending || !draft.trim()} onClick={() => void send()} aria-label="Send" title="Send" data-optimate-send="">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </OptiMateMetalSend>
            </div>
          </div>
        </OptiMateBeamComposer>
      </div>
    </div>
  )
}

function splitRequests(requests: string[], maxLength: number): string[] {
  const portions: string[] = []
  let current = ''
  for (const request of requests) {
    let remaining = request
    while (remaining.length) {
      const available = maxLength - current.length - (current ? 1 : 0)
      if (remaining.length <= available) {
        current += `${current ? '\n' : ''}${remaining}`
        break
      }
      if (current && available < remaining.length) {
        portions.push(current)
        current = ''
        continue
      }
      portions.push(remaining.slice(0, maxLength))
      const role = request.startsWith('TaskMate: ') ? 'TaskMate' : 'Admin'
      remaining = `${role} (continued): ${remaining.slice(maxLength)}`
    }
  }
  if (current) portions.push(current)
  return portions
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--theme-elevation-200)', borderRadius: 7, padding: '8px 9px', background: 'var(--theme-bg)', color: 'var(--theme-text)', font: 'inherit' }
const primaryButtonStyle: React.CSSProperties = { border: 0, borderRadius: 8, padding: '9px 12px', background: '#0f766e', color: '#fff', fontWeight: 800, cursor: 'pointer' }
const noticeStyle: React.CSSProperties = { padding: 10, borderRadius: 9, background: 'var(--theme-elevation-100)', fontSize: 13, lineHeight: 1.45 }
const bubbleStyle: React.CSSProperties = { maxWidth: '88%', borderRadius: 12, padding: '9px 11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13, lineHeight: 1.45 }
