'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Option = { id: string | number; name: string; email?: string; role?: string }
type Rel = Option | string | number | null | undefined
type LinkRow = { id?: string; label?: string; url?: string; kind?: string }
type TeamTask = {
  id: string | number
  title: string
  client?: Rel
  assignedTo?: Rel
  taskType?: string
  status?: string
  priority?: string
  dueDate?: string | null
  instructions?: string | null
  sourceUrl?: string | null
  relatedLinks?: LinkRow[] | null
}
type CommentRow = {
  id: string | number
  body: string
  author?: Rel
  mentions?: Rel[] | null
  attachments?: LinkRow[] | null
  createdAt?: string
}

type DetailResponse = {
  task: TeamTask
  comments: CommentRow[]
  users: Option[]
  currentUser: Option
  canManage: boolean
}

const statuses = [
  ['not_started', 'Not Started'],
  ['in_progress', 'In Progress'],
  ['ready_for_review', 'Ready for Review'],
  ['completed', 'Completed'],
  ['task_postponed', 'Task Postponed'],
]

const fieldStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  padding: '9px 10px',
  background: 'var(--theme-input-bg)',
  color: 'inherit',
  fontSize: 14,
}

function relId(value: Rel): string {
  if (value && typeof value === 'object') return String(value.id)
  return value == null ? '' : String(value)
}

function relName(value: Rel, users: Option[]): string {
  const id = relId(value)
  if (value && typeof value === 'object') return value.name || value.email || id
  return users.find((user) => String(user.id) === id)?.name || id
}

function initials(value: Rel, users: Option[]): string {
  const name = relName(value, users) || 'User'
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function htmlFromPlainText(value: string): string {
  if (value.includes('<')) return value
  return value.split('\n').map((line) => line.trim() ? `<div>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : '<div><br /></div>').join('')
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function RichBox({ value, onSave, placeholder }: { value: string; onSave: (value: string) => void; placeholder?: string }) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const initialHtml = useMemo(() => htmlFromPlainText(value || ''), [value])

  return (
    <div
      key={initialHtml}
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: initialHtml }}
      data-placeholder={placeholder}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
          e.preventDefault()
          document.execCommand('bold')
          return
        }
        if (e.key !== ' ') return
        const selection = window.getSelection()
        const text = selection?.anchorNode?.textContent || ''
        const offset = selection?.anchorOffset || 0
        if (text.slice(0, offset).endsWith('-')) {
          e.preventDefault()
          document.execCommand('delete')
          document.execCommand('insertUnorderedList')
        }
      }}
      onBlur={(e) => onSave(e.currentTarget.innerHTML)}
      style={{ ...fieldStyle, minHeight: 90, lineHeight: 1.45, outline: 'none', overflowWrap: 'anywhere' }}
    />
  )
}

function CommentComposer({ value, users, onChange }: { value: string; users: Option[]; onChange: (value: string) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [query, setQuery] = useState<string | null>(null)

  const suggestions = useMemo(() => {
    if (query == null) return []
    const normalised = query.toLowerCase()
    return users
      .filter((user) => {
        const haystack = `${user.name || ''} ${user.email || ''}`.toLowerCase()
        return !normalised || haystack.includes(normalised)
      })
      .slice(0, 8)
  }, [query, users])

  const updateMentionQuery = (next: string, cursor: number) => {
    const before = next.slice(0, cursor)
    const match = before.match(/(?:^|\s)@([\w.-]*)$/)
    setQuery(match ? match[1] : null)
  }

  const selectUser = (user: Option) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const cursor = textarea.selectionStart
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const match = before.match(/(?:^|\s)@([\w.-]*)$/)
    const handle = (user.name || user.email || String(user.id)).replace(/\s+/g, '')
    const nextBefore = match ? before.slice(0, before.length - match[1].length - 1) : before
    const next = `${nextBefore}@${handle} ${after}`
    onChange(next)
    setQuery(null)
    window.requestAnimationFrame(() => {
      const nextCursor = `${nextBefore}@${handle} `.length
      textarea.focus()
      textarea.setSelectionRange(nextCursor, nextCursor)
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          updateMentionQuery(e.target.value, e.target.selectionStart)
        }}
        onKeyUp={(e) => updateMentionQuery(e.currentTarget.value, e.currentTarget.selectionStart)}
        onClick={(e) => updateMentionQuery(e.currentTarget.value, e.currentTarget.selectionStart)}
        placeholder="Write a comment… type @ to mention someone"
        rows={4}
        style={{ ...fieldStyle, minHeight: 96, resize: 'vertical', lineHeight: 1.45 }}
      />
      {query != null && suggestions.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 5, border: '1px solid var(--theme-elevation-150)', borderRadius: 10, background: 'var(--theme-bg)', boxShadow: '0 12px 28px rgba(15,23,42,.16)', overflow: 'hidden' }}>
          {suggestions.map((user) => (
            <button
              key={user.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectUser(user) }}
              style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'center', padding: '9px 10px', border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ width: 28, height: 28, borderRadius: 999, background: '#1d4ed8', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 900 }}>{initials(user, users)}</span>
              <span>
                <strong>{user.name || user.email}</strong>
                {user.email && <span style={{ display: 'block', fontSize: 12, color: 'var(--theme-elevation-500)' }}>{user.email}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TeamTaskDetailPane({ taskId, onClose, onTaskUpdated }: { taskId: string | number; onClose: () => void; onTaskUpdated?: (task: TeamTask) => void }) {
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [comment, setComment] = useState('')
  const [linkDraft, setLinkDraft] = useState<LinkRow>({ label: '', url: '' })

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/team-tasks/${taskId}/detail`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load task')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [taskId])

  const patchTask = async (patch: Partial<TeamTask>) => {
    if (!data) return
    const previous = data.task
    const next = { ...data.task, ...patch }
    setData({ ...data, task: next })
    onTaskUpdated?.(next)
    setSaving(true)
    try {
      const res = await fetch(`/api/team-tasks/${taskId}/detail`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save task')
      setData((current) => current ? { ...current, task: json.task } : current)
      onTaskUpdated?.(json.task)
    } catch (err) {
      setData((current) => current ? { ...current, task: previous } : current)
      setError(err instanceof Error ? err.message : 'Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  const postComment = async () => {
    if (!comment.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/team-tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: comment }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to post comment')
      setData((current) => current ? { ...current, comments: [...current.comments, json.comment] } : current)
      setComment('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setSaving(false)
    }
  }

  const addLink = () => {
    if (!data || !linkDraft.url?.trim()) return
    const label = linkDraft.label?.trim() || linkDraft.url.trim()
    const nextLinks = [...(data.task.relatedLinks || []), { label, url: linkDraft.url.trim(), kind: 'other' }]
    setLinkDraft({ label: '', url: '' })
    void patchTask({ relatedLinks: nextLinks })
  }

  const removeLink = (index: number) => {
    if (!data) return
    const nextLinks = (data.task.relatedLinks || []).filter((_, i) => i !== index)
    void patchTask({ relatedLinks: nextLinks })
  }

  const task = data?.task
  const users = data?.users || []

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, .35)', display: 'flex', justifyContent: 'flex-end' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside style={{ width: 'min(1080px, 94vw)', height: '100%', background: 'var(--theme-bg)', boxShadow: '-18px 0 44px rgba(15,23,42,.22)', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--theme-elevation-150)', position: 'sticky', top: 0, background: 'var(--theme-bg)', zIndex: 2 }}>
          <strong style={{ fontSize: 18 }}>Task details</strong>
          <button type="button" onClick={onClose} style={{ ...fieldStyle, width: 42, cursor: 'pointer', fontWeight: 900 }}>×</button>
        </div>

        {loading ? (
          <div style={{ padding: 24, color: 'var(--theme-elevation-500)' }}>Loading task…</div>
        ) : !task ? (
          <div style={{ padding: 24, color: '#991b1b' }}>{error || 'Task not found'}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.08fr) minmax(360px, .92fr)', gap: 28, padding: 24 }}>
            <section style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
              {error && <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#991b1b' }}>{error}</div>}
              <input
                value={task.title || ''}
                onChange={(e) => setData((current) => current ? { ...current, task: { ...current.task, title: e.target.value } } : current)}
                onBlur={(e) => { if (e.target.value !== task.title) void patchTask({ title: e.target.value || 'New task' }) }}
                style={{ ...fieldStyle, fontSize: 30, fontWeight: 900, border: 'none', padding: 0, background: 'transparent' }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'grid', gap: 5, fontWeight: 700, fontSize: 12, color: 'var(--theme-elevation-500)' }}>
                  Assigned
                  <select value={relId(task.assignedTo)} onChange={(e) => void patchTask({ assignedTo: e.target.value })} style={fieldStyle}>
                    <option value="">Unassigned</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 5, fontWeight: 700, fontSize: 12, color: 'var(--theme-elevation-500)' }}>
                  Status
                  <select value={task.status || 'in_progress'} onChange={(e) => void patchTask({ status: e.target.value })} style={fieldStyle}>
                    {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <strong>Description / instructions</strong>
                <RichBox value={task.instructions || ''} placeholder="Add task instructions…" onSave={(next) => { if (next !== (task.instructions || '')) void patchTask({ instructions: next }) }} />
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <strong>Links</strong>
                {(task.relatedLinks || []).map((link, index) => (
                  <div key={`${link.url}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', padding: 8, borderRadius: 8, background: 'var(--theme-elevation-50)' }}>
                    <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{link.label || link.url}</span>
                    <a href={link.url} target="_blank" rel="noreferrer" style={{ ...fieldStyle, width: 76, textAlign: 'center', textDecoration: 'none', color: '#2563eb', fontWeight: 800 }}>Open</a>
                    <button type="button" onClick={() => removeLink(index)} style={{ ...fieldStyle, width: 38, color: '#991b1b', cursor: 'pointer' }}>×</button>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 8 }}>
                  <input value={linkDraft.label || ''} onChange={(e) => setLinkDraft({ ...linkDraft, label: e.target.value })} placeholder="Label" style={fieldStyle} />
                  <input value={linkDraft.url || ''} onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })} placeholder="Link URL" style={fieldStyle} />
                  <button type="button" onClick={addLink} style={{ ...fieldStyle, width: 82, cursor: 'pointer', fontWeight: 800 }}>Add</button>
                </div>
              </div>
            </section>

            <section style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 18 }}>Comments and activity</strong>
                {saving && <span style={{ color: 'var(--theme-elevation-500)', fontSize: 12 }}>Saving…</span>}
              </div>
              <CommentComposer value={comment} users={users} onChange={setComment} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>Tip: @mention a team member to create a bell notification.</span>
                <button type="button" onClick={postComment} disabled={!stripHtml(comment).trim() || saving} style={{ ...fieldStyle, width: 150, cursor: 'pointer', background: '#2563eb', color: '#fff', fontWeight: 900 }}>Comment</button>
              </div>

              <div style={{ display: 'grid', gap: 16 }}>
                {data.comments.length === 0 ? (
                  <div style={{ color: 'var(--theme-elevation-500)', padding: 16, border: '1px dashed var(--theme-elevation-150)', borderRadius: 10 }}>No comments yet.</div>
                ) : data.comments.map((row) => (
                  <article key={row.id} style={{ display: 'grid', gridTemplateColumns: '42px 1fr', gap: 10 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 999, background: '#1d4ed8', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{initials(row.author, users)}</div>
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
                        <strong>{relName(row.author, users)}</strong>
                        {row.createdAt && <span style={{ color: 'var(--theme-elevation-500)', fontSize: 12 }}>{new Date(row.createdAt).toLocaleString('en-AU')}</span>}
                      </div>
                      <div dangerouslySetInnerHTML={{ __html: htmlFromPlainText(row.body) }} style={{ padding: 12, borderRadius: 10, background: 'var(--theme-elevation-50)', border: '1px solid var(--theme-elevation-100)', lineHeight: 1.45 }} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </aside>
    </div>
  )
}
