'use client'

import { useEffect, useRef, useState } from 'react'
import TaskMateLiveVoice from './TaskMateLiveVoice'
import OptiMateBeamComposer from './OptiMateBeamComposer'
import OptiMateMetalSend from './OptiMateMetalSend'
import { ThinkingOrb } from 'thinking-orbs'
import type { StagedTaskList, TaskMateClient, TaskMateUser } from '@/lib/agents/taskmate'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type StoredState = { messages?: ChatMessage[]; draft?: string; staged?: StagedTaskList }
/** A dropped screenshot waiting to be uploaded onto the generated tasks when they are assigned. */
type PendingImage = { id: number; file: File; previewUrl: string }
const STORAGE_KEY = 'optimate:taskmate'
// Mirrors /api/team-tasks/[id]/screenshots, which these files are uploaded to after assignment.
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_IMAGES = 10
const TASK_LIST_PATH = '/admin/collections/team-tasks'
type AssignedTask = { id: string; title: string }

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
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([])
  const [assignedWeek, setAssignedWeek] = useState('')
  const [images, setImages] = useState<PendingImage[]>([])
  // `${taskIndex}:${imageId}` pairs the admin unticked; every image attaches to every task otherwise.
  const [detachedImages, setDetachedImages] = useState<string[]>([])
  const [dragActive, setDragActive] = useState(false)
  const hydrated = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const nextImageId = useRef(1)
  const imagesRef = useRef<PendingImage[]>([])
  imagesRef.current = images

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

  // Object URLs for previews outlive the component unless released.
  useEffect(() => () => { for (const image of imagesRef.current) URL.revokeObjectURL(image.previewUrl) }, [])

  /**
   * Images dropped anywhere in the window while TaskMate is on screen are held
   * here and attached to the generated tasks on assignment. Drops another drop
   * zone already handled (Payload upload fields, the task detail pane) arrive
   * with defaultPrevented set and are left alone.
   */
  useEffect(() => {
    let dragDepth = 0
    const isVisible = () => (rootRef.current?.getClientRects().length ?? 0) > 0
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const claims = (event: DragEvent) => hasFiles(event) && !event.defaultPrevented && isVisible()

    const onDragEnter = (event: DragEvent) => {
      if (!claims(event)) return
      event.preventDefault()
      dragDepth += 1
      setDragActive(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!claims(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      dragDepth = Math.max(0, dragDepth - 1)
      if (dragDepth === 0) setDragActive(false)
    }
    const onDrop = (event: DragEvent) => {
      dragDepth = 0
      setDragActive(false)
      if (!claims(event)) return
      event.preventDefault()
      addImages(Array.from(event.dataTransfer?.files ?? []))
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  const addImages = (files: File[]) => {
    const problems: string[] = []
    const accepted: PendingImage[] = []
    const room = MAX_IMAGES - imagesRef.current.length
    for (const file of files) {
      if (!IMAGE_TYPES.has(file.type)) problems.push(`${file.name} is not a PNG, JPEG, or WebP image`)
      else if (file.size > MAX_IMAGE_BYTES) problems.push(`${file.name} is larger than 8 MB`)
      else if (accepted.length >= room) problems.push(`${file.name} was skipped; attach up to ${MAX_IMAGES} images`)
      else accepted.push({ id: nextImageId.current++, file, previewUrl: URL.createObjectURL(file) })
    }
    if (accepted.length) setImages((current) => [...current, ...accepted])
    setError(problems.join('. '))
  }

  const removeImage = (id: number) => {
    const image = images.find((item) => item.id === id)
    if (image) URL.revokeObjectURL(image.previewUrl)
    setImages((current) => current.filter((item) => item.id !== id))
    setDetachedImages((current) => current.filter((key) => !key.endsWith(`:${id}`)))
  }

  const stageList = (list: StagedTaskList | undefined) => {
    setStaged(list)
    setDetachedImages([])
  }

  const imagesForTask = (taskIndex: number) => images.filter(({ id }) => !detachedImages.includes(`${taskIndex}:${id}`))

  const toggleImage = (taskIndex: number, id: number, attached: boolean) => {
    const key = `${taskIndex}:${id}`
    setDetachedImages((current) => attached ? current.filter((item) => item !== key) : [...current, key])
  }

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
        body: JSON.stringify({ message, history, today: localDateKey() }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'TaskMate could not reply')
      setMessages((current) => [...current, { role: 'assistant', content: json.reply || 'Review the staged task list below.' }])
      if (json.clients) setClients(json.clients)
      if (json.users) setUsers(json.users)
      if (json.stagedTaskList) stageList(json.stagedTaskList)
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
            today: localDateKey(),
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
      stageList(combined)
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
    setAssignedTasks([])
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
      const ids: unknown[] = Array.isArray(json.ids) ? json.ids : []
      const failed: string[] = []
      let attachedCount = 0
      // The tasks are committed at this point, so an image that fails to upload
      // is reported rather than undoing the assignment.
      for (const [index, id] of ids.entries()) {
        const task = staged.tasks[index]
        if (!task || (typeof id !== 'string' && typeof id !== 'number')) continue
        for (const image of imagesForTask(index)) {
          const formData = new FormData()
          formData.append('file', image.file)
          try {
            const upload = await fetch(`/api/team-tasks/${encodeURIComponent(String(id))}/screenshots`, { method: 'POST', body: formData })
            if (!upload.ok) throw new Error('upload failed')
            attachedCount += 1
          } catch {
            failed.push(`${image.file.name} on “${task.title}”`)
          }
        }
      }
      setAssignedWeek(staged.weekStart)
      setAssignedTasks(ids.flatMap((id, index) => {
        const title = staged.tasks[index]?.title
        return title && (typeof id === 'string' || typeof id === 'number') ? [{ id: String(id), title }] : []
      }))
      setSuccess(`${json.count} task${json.count === 1 ? '' : 's'} assigned${attachedCount ? ` with ${attachedCount} screenshot${attachedCount === 1 ? '' : 's'} attached` : ''}.`)
      if (failed.length) setError(`Could not attach ${failed.join(', ')}. Add ${failed.length === 1 ? 'it' : 'them'} from the task's detail pane.`)
      window.dispatchEvent(new CustomEvent('optimate:taskmate-assigned', { detail: { weekStart: staged.weekStart } }))
      for (const image of images) URL.revokeObjectURL(image.previewUrl)
      setImages([])
      stageList(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not assign tasks')
    } finally { setAssigning(false) }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {dragActive && (
        <div role="status" aria-live="polite" style={{ position: 'absolute', inset: 8, zIndex: 5, display: 'grid', placeItems: 'center', border: '2px dashed #5eead4', borderRadius: 12, background: 'rgba(15, 23, 42, .88)', color: '#fff', fontSize: 15, fontWeight: 800, textAlign: 'center', padding: 16, pointerEvents: 'none' }}>
          Drop screenshots to attach them to the generated tasks
        </div>
      )}
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
              <div {...{ ['k' + 'ey']: `${task.title}-${index}` }} style={{ padding: 10, borderRadius: 9, background: 'transparent', border: '1px solid rgba(255,255,255,.12)', display: 'grid', gap: 6 }}>
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
                {images.length > 0 && (
                  <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <legend style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Screenshots</legend>
                    {images.map((image) => (
                      <label key={image.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          aria-label={`Attach ${image.file.name} to ${task.title}`}
                          checked={!detachedImages.includes(`${index}:${image.id}`)}
                          onChange={(event) => toggleImage(index, image.id, event.target.checked)}
                        />
                        <img src={image.previewUrl} alt="" style={thumbnailStyle} />
                        <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{image.file.name}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>
            ))}
            <button type="button" onClick={() => void assign()} disabled={assigning} style={primaryButtonStyle}>
              {assigning ? 'Assigning…' : `Assign ${staged.tasks.length} task${staged.tasks.length === 1 ? '' : 's'}`}
            </button>
          </section>
        )}
        {error && <div role="alert" style={{ ...noticeStyle, color: '#991b1b', background: '#fef2f2' }}>{error}</div>}
        {success && (
          <div role="status" style={{ ...noticeStyle, color: '#166534', background: '#f0fdf4', display: 'grid', gap: 6 }}>
            <span>{success}</span>
            {assignedTasks.length > 0 && (
              <ul aria-label="Assigned tasks" style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 4 }}>
                {assignedTasks.map((task) => (
                  <li key={task.id}>
                    <a href={`${TASK_LIST_PATH}?${new URLSearchParams({ ...(assignedWeek ? { week: assignedWeek } : {}), task: task.id })}`} target="_blank" rel="noreferrer" style={successLinkStyle}>
                      Open “{task.title}”
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <a href={assignedWeek ? `${TASK_LIST_PATH}?week=${encodeURIComponent(assignedWeek)}` : TASK_LIST_PATH} target="_blank" rel="noreferrer" style={successLinkStyle}>View task list</a>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: '1px solid var(--theme-elevation-150)', padding: 10, display: 'grid', gap: 8 }}>
        <button type="button" disabled={sending || voiceActive || messages.length === 0} onClick={() => void generate()} style={{ ...primaryButtonStyle, background: '#7c3aed', opacity: sending || voiceActive || messages.length === 0 ? 0.55 : 1 }}>Generate task list</button>
        {generationProgress && <span role="status">{generationProgress}</span>}
        {images.length > 0 && (
          <ul aria-label="Screenshots to attach" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {images.map((image) => (
              <li key={image.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 4, borderRadius: 8, border: '1px solid rgba(255,255,255,.12)', fontSize: 12 }}>
                <img src={image.previewUrl} alt="" style={thumbnailStyle} />
                <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{image.file.name}</span>
                <button type="button" onClick={() => removeImage(image.id)} disabled={assigning} aria-label={`Remove ${image.file.name}`} style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 6px' }}>×</button>
              </li>
            ))}
          </ul>
        )}
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

/** The admin's own calendar date, so "next week" means their next week. */
function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
// The TaskMate panel is always dark with light text, so boxes stay transparent; Payload's
// light-theme greys (--theme-elevation-100, --theme-bg) put that light text on a light box.
const noticeStyle: React.CSSProperties = { padding: 10, borderRadius: 9, background: 'transparent', border: '1px solid rgba(255,255,255,.12)', fontSize: 13, lineHeight: 1.45 }
const successLinkStyle: React.CSSProperties = { color: 'inherit', fontWeight: 700, textDecoration: 'underline' }
const thumbnailStyle: React.CSSProperties = { width: 36, height: 36, objectFit: 'cover', borderRadius: 6, display: 'block' }
const bubbleStyle: React.CSSProperties = { maxWidth: '88%', borderRadius: 12, padding: '9px 11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13, lineHeight: 1.45 }
