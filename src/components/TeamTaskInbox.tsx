'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CommentComposer, htmlFromPlainText, initials, relName, stripHtml } from './TeamTaskDetailPane'
import { announceNotificationsChanged, NOTIFICATIONS_CHANGED_EVENT } from '@/lib/notifications-events'
import type { TeamTaskInboxItem } from '@/lib/team-task-inbox'

type UserOption = { id: string | number; name: string; email?: string; role?: string }
type UserRel = UserOption | string | number | null | undefined
type CommentRow = { id: string | number; body: string; author?: UserRel; createdAt?: string }
type ThreadResponse = { comments: CommentRow[]; users: UserOption[]; currentUser: UserOption }

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  awaiting_response: 'Awaiting Response',
  ready_for_review: 'Ready for Review',
  completed: 'Completed',
  task_postponed: 'Task Postponed',
}

const fieldStyle: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  padding: '8px 12px',
  background: 'var(--theme-input-bg)',
  color: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

const primaryButtonStyle: React.CSSProperties = { ...fieldStyle, background: '#2563eb', borderColor: '#2563eb', color: '#fff', fontWeight: 800 }

const mutedText: React.CSSProperties = { color: 'var(--theme-elevation-500)', fontSize: 12 }

function timeAgo(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const minutes = Math.round((Date.now() - date.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function authorId(author: UserRel): string {
  if (author && typeof author === 'object') return String(author.id)
  return author == null ? '' : String(author)
}

// The comment is saved just before its mention notification, so allow a short gap.
const NEW_COMMENT_SLACK_MS = 10_000

/** A comment from someone else posted since your oldest unread mention on the task. */
export function isNewComment(row: CommentRow, unreadSince: string | null, meId: string): boolean {
  if (!unreadSince || !row.createdAt) return false
  if (meId && authorId(row.author) === meId) return false
  return new Date(row.createdAt).getTime() >= new Date(unreadSince).getTime() - NEW_COMMENT_SLACK_MS
}

/**
 * Team Tasks "Notifications" tab: every task you were @mentioned on, one row
 * per task, read one at a time with the comment thread and a reply box.
 * Replying (or "Mark as read") clears that task's mentions from the bell.
 */
export default function TeamTaskInbox({ mobile, onOpenTask, onUnreadChange }: {
  mobile: boolean
  onOpenTask: (taskId: string) => void
  onUnreadChange?: (unreadTasks: number) => void
}) {
  const [showRead, setShowRead] = useState(false)
  const [items, setItems] = useState<TeamTaskInboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileReading, setMobileReading] = useState(false)
  const [thread, setThread] = useState<ThreadResponse | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const latestLoad = useRef(0)
  const selectedIndexRef = useRef(0)
  const readerHeadingRef = useRef<HTMLHeadingElement | null>(null)

  const load = useCallback(async () => {
    const loadId = ++latestLoad.current
    setError('')
    try {
      const res = await fetch(`/api/team-tasks/notifications${showRead ? '?include=read' : ''}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load notifications')
      if (loadId !== latestLoad.current) return
      const next: TeamTaskInboxItem[] = json.items || []
      setItems(next)
      onUnreadChange?.(Number(json.unreadTasks) || 0)
      // Keep the open task; if it just left the list, move to the one that took its place.
      setSelectedId((current) => {
        if (current && next.some((item) => item.taskId === current)) return current
        if (!next.length) return null
        return next[Math.min(selectedIndexRef.current, next.length - 1)]?.taskId ?? null
      })
    } catch (err) {
      if (loadId === latestLoad.current) setError(err instanceof Error ? err.message : 'Failed to load notifications')
    } finally {
      if (loadId === latestLoad.current) setLoading(false)
    }
  }, [showRead, onUnreadChange])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  // The bell, the task pane, or another tab changed notifications: refresh.
  useEffect(() => {
    const onChanged = () => { void load() }
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
  }, [load])

  const selectedIndex = items.findIndex((item) => item.taskId === selectedId)
  const selected = selectedIndex >= 0 ? items[selectedIndex] : undefined
  if (selectedIndex >= 0) selectedIndexRef.current = selectedIndex

  useEffect(() => {
    setReply('')
    setThread(null)
    if (!selectedId || selected?.taskMissing) return
    let cancelled = false
    setThreadLoading(true)
    fetch(`/api/team-tasks/${encodeURIComponent(selectedId)}/detail`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load comments')
        if (!cancelled) setThread({ comments: json.comments || [], users: json.users || [], currentUser: json.currentUser })
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load comments') })
      .finally(() => { if (!cancelled) setThreadLoading(false) })
    return () => { cancelled = true }
  }, [selectedId, selected?.taskMissing])

  const select = (taskId: string) => {
    setSelectedId(taskId)
    if (mobile) {
      setMobileReading(true)
      window.requestAnimationFrame(() => readerHeadingRef.current?.focus())
    }
  }

  const step = (delta: number) => {
    const next = items[selectedIndex + delta]
    if (next) select(next.taskId)
  }

  const markRead = async () => {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/team-tasks/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: selected.taskId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to mark as read')
      announceNotificationsChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as read')
    } finally {
      setBusy(false)
    }
  }

  const sendReply = async () => {
    if (!selected || !stripHtml(reply)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/team-tasks/${encodeURIComponent(selected.taskId)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to post reply')
      setReply('')
      setThread((current) => current ? { ...current, comments: [json.comment, ...current.comments] } : current)
      // The server marked this task's mentions read; the list moves on to the next task.
      announceNotificationsChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post reply')
    } finally {
      setBusy(false)
    }
  }

  const unreadTasks = items.filter((item) => item.unreadCount > 0).length
  const showList = !mobile || !mobileReading || !selected
  const showReader = Boolean(selected) && (!mobile || mobileReading)
  const users = thread?.users || []
  const meId = thread?.currentUser ? String(thread.currentUser.id) : ''

  return (
    <div className="od-team-task-inbox" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontSize: 14 }} aria-live="polite">
          {loading ? 'Loading notifications…' : unreadTasks === 0 ? 'No unread task mentions.' : <><strong>{unreadTasks}</strong> {unreadTasks === 1 ? 'task needs' : 'tasks need'} your reply</>}
        </p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <input type="checkbox" checked={showRead} onChange={(e) => setShowRead(e.target.checked)} />
          Include read
        </label>
      </div>

      {error && <div role="alert" style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#991b1b' }}>{error}</div>}

      {!loading && items.length === 0 ? (
        <div style={{ padding: 24, border: '1px dashed var(--theme-elevation-150)', borderRadius: 12, color: 'var(--theme-elevation-500)', textAlign: 'center' }}>
          {showRead ? 'No one has mentioned you on a team task yet.' : 'Nothing to review. Replies and mentions on team tasks will show up here.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(360px, 480px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          {showList && (
            <ul aria-label="Tasks you were mentioned on" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, maxHeight: mobile ? undefined : 'calc(100vh - 230px)', overflowY: mobile ? undefined : 'auto' }}>
              {items.map((item) => {
                const isSelected = item.taskId === selectedId
                const unread = item.unreadCount > 0
                return (
                  <li key={item.taskId}>
                    <button
                      type="button"
                      onClick={() => select(item.taskId)}
                      aria-current={isSelected && !mobile ? 'true' : undefined}
                      style={{
                        display: 'grid', gap: 2, width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', color: 'inherit', font: 'inherit', lineHeight: 1.3,
                        border: `1px solid ${isSelected && !mobile ? '#2563eb' : 'var(--theme-elevation-150)'}`,
                        borderInlineStart: `4px solid ${unread ? '#2563eb' : 'var(--theme-elevation-150)'}`,
                        background: isSelected && !mobile ? 'var(--theme-elevation-50)' : 'var(--theme-elevation-0, #fff)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ fontWeight: 800, color: '#1d4ed8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{item.clientName || 'No client'}</span>
                        <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                          {unread
                            ? <span aria-label={`${item.unreadCount} unread ${item.unreadCount === 1 ? 'mention' : 'mentions'}`} style={{ fontWeight: 800, color: '#1d4ed8' }}>{item.unreadCount} unread</span>
                            : <span style={{ color: 'var(--theme-elevation-500)' }}>Read</span>}
                          <span style={{ color: 'var(--theme-elevation-500)' }}>{timeAgo(item.latestAt)}</span>
                        </span>
                      </span>
                      <span style={{ fontWeight: unread ? 800 : 600, fontSize: 14, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.taskTitle}</span>
                      {item.latestExcerpt && (
                        <span style={{ fontSize: 13, color: 'var(--theme-elevation-600, #4b5563)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.latestExcerpt}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {showReader && selected && (
            <section aria-labelledby="od-team-task-inbox-title" style={{ display: 'grid', gap: 14, padding: 18, border: '1px solid var(--theme-elevation-150)', borderRadius: 12, background: 'var(--theme-elevation-0, #fff)', minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                {mobile ? (
                  <button type="button" onClick={() => setMobileReading(false)} style={fieldStyle}>← All notifications</button>
                ) : <span style={mutedText}>{selectedIndex + 1} of {items.length}</span>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => step(-1)} disabled={selectedIndex <= 0} style={{ ...fieldStyle, opacity: selectedIndex <= 0 ? .5 : 1 }}>Previous</button>
                  <button type="button" onClick={() => step(1)} disabled={selectedIndex >= items.length - 1} style={{ ...fieldStyle, opacity: selectedIndex >= items.length - 1 ? .5 : 1 }}>Next</button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8' }}>{selected.clientName ? `Client: ${selected.clientName}` : 'No client'}</span>
                <h2 id="od-team-task-inbox-title" ref={readerHeadingRef} tabIndex={-1} style={{ margin: 0, fontSize: 20, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{selected.taskTitle}</h2>
                <span style={mutedText}>
                  {selected.taskMissing ? 'This task has been deleted.' : [
                    selected.status ? STATUS_LABELS[selected.status] || selected.status : null,
                    selected.assignedName ? `Assigned to ${selected.assignedName}` : 'Unassigned',
                  ].filter(Boolean).join(' · ')}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {!selected.taskMissing && <button type="button" onClick={() => onOpenTask(selected.taskId)} style={fieldStyle}>Open task</button>}
                {selected.unreadCount > 0 && <button type="button" onClick={() => void markRead()} disabled={busy} style={fieldStyle}>Mark as read</button>}
              </div>

              {!selected.taskMissing && (
                <>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <CommentComposer value={reply} users={users} onChange={setReply} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <span style={mutedText}>Replying marks this task as read.</span>
                      <button type="button" onClick={() => void sendReply()} disabled={!stripHtml(reply) || busy} style={{ ...primaryButtonStyle, opacity: !stripHtml(reply) || busy ? .6 : 1 }}>{busy ? 'Sending…' : 'Reply'}</button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 14 }} aria-busy={threadLoading}>
                    {threadLoading && !thread ? <span style={mutedText}>Loading comments…</span> : thread?.comments.length === 0 ? (
                      <span style={mutedText}>No comments on this task yet.</span>
                    ) : thread?.comments.map((row) => {
                      const isNew = isNewComment(row, selected.unreadSince, meId)
                      return (
                        <article key={row.id} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr)', gap: 10 }}>
                          <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 999, background: '#1d4ed8', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 13 }}>{initials(row.author, users)}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
                              <strong>{relName(row.author, users)}</strong>
                              {row.createdAt && <span style={mutedText}>{new Date(row.createdAt).toLocaleString('en-AU')}</span>}
                              {isNew && <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: '#2563eb', borderRadius: 999, padding: '1px 8px' }}>New</span>}
                            </div>
                            <div className="od-rich-text" dangerouslySetInnerHTML={{ __html: htmlFromPlainText(row.body) }} style={{ padding: 12, borderRadius: 10, background: 'var(--theme-elevation-50)', border: `1px solid ${isNew ? '#93c5fd' : 'var(--theme-elevation-100)'}`, lineHeight: 1.45, overflowWrap: 'anywhere' }} />
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
