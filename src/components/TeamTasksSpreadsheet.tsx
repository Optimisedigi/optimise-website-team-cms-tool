'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import TeamTaskDetailPane from './TeamTaskDetailPane'

type Option = { id: string | number; name: string; email?: string; slug?: string }
type Rel = Option | string | number | null | undefined

type TeamTask = {
  id: string | number
  title: string
  client?: Rel
  taskType: string
  status: string
  priority: string
  assignedTo?: Rel
  dueDate?: string | null
  completedAt?: string | null
  instructions?: string | null
  staffNotes?: string | null
  reviewNotes?: string | null
  sheetWeek?: string | null
  createdAt?: string | null
}

const taskTypes = [
  ['blog_post', 'Blog Post'],
  ['email', 'Email'],
  ['product_page', 'Product Page'],
  ['product_update', 'Product Update'],
  ['research', 'Research'],
  ['website_content', 'Website Content'],
  ['seo', 'SEO'],
  ['internal_documentation', 'Internal Documentation'],
  ['reporting', 'Reporting'],
  ['google_ads', 'Google Ads'],
  ['schema_fix', 'Schema Fix'],
  ['faq_schema', 'FAQ Schema'],
  ['product_feed', 'Product Feed'],
  ['google_sheet', 'Google Sheet'],
  ['other', 'Other'],
]

const statuses = [
  ['not_started', 'Not Started'],
  ['in_progress', 'In Progress'],
  ['ready_for_review', 'Ready for Review'],
  ['completed', 'Completed'],
  ['task_postponed', 'Task Postponed'],
]

const priorities = [
  ['low', 'Low'],
  ['normal', 'Normal'],
  ['high', 'High'],
  ['urgent', 'Urgent'],
]

function relId(value: Rel): string {
  if (value && typeof value === 'object') return String(value.id)
  return value == null ? '' : String(value)
}

function relName(value: Rel, options: Option[]): string {
  const id = relId(value)
  if (value && typeof value === 'object') return value.name || value.email || id
  return options.find((option) => String(option.id) === id)?.name || ''
}

function mondayKey(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function weekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  if (sameMonth) {
    return `${start.getDate()} – ${end.getDate()} ${end.toLocaleDateString('en-AU', { month: 'long' })}`
  }
  return `${start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
}

function taskWeek(value?: string | null): string {
  return value ? mondayKey(new Date(`${value.slice(0, 10)}T00:00:00`)) : ''
}

function statusTone(status: string): React.CSSProperties {
  if (status === 'completed') return { background: '#dcfce7', color: '#166534' }
  if (status === 'ready_for_review') return { background: '#fef3c7', color: '#92400e' }
  if (status === 'task_postponed') return { background: '#f3f4f6', color: '#4b5563' }
  if (status === 'not_started') return { background: '#e0f2fe', color: '#075985' }
  return { background: '#ede9fe', color: '#5b21b6' }
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 6,
  padding: '7px 8px',
  background: 'var(--theme-input-bg)',
  color: 'inherit',
  fontSize: 13,
}

const thStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 2,
  textAlign: 'left',
  background: 'var(--theme-bg)',
  borderBottom: '1px solid var(--theme-elevation-150)',
  padding: '10px 8px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  color: 'var(--theme-elevation-500)',
}

const tdStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--theme-elevation-100)',
  padding: 6,
  verticalAlign: 'top',
}

const weekColors = [
  { bg: '#ecfeff', box: '#0e7490' },
  { bg: '#f0fdf4', box: '#15803d' },
  { bg: '#eff6ff', box: '#1d4ed8' },
  { bg: '#fefce8', box: '#a16207' },
  { bg: '#f5f3ff', box: '#6d28d9' },
  { bg: '#fff7ed', box: '#c2410c' },
]

function htmlFromPlainText(value: string): string {
  if (value.includes('<')) return value
  return value
    .split('\n')
    .map((line) => line.trim() ? `<div>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : '<div><br /></div>')
    .join('')
}

function NotesEditor({ value, onSave, minWidth = 320 }: { value: string; onSave: (next: string) => void; minWidth?: number }) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const initialHtml = useMemo(() => htmlFromPlainText(value || ''), [value])

  return (
    <div style={{ minWidth, width: '100%' }}>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: initialHtml }}
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
        style={{
          ...inputStyle,
          minHeight: 58,
          lineHeight: 1.35,
          outline: 'none',
          overflowWrap: 'anywhere',
        }}
      />
    </div>
  )
}

function plainTextFromHtml(value: string): string {
  if (!value) return ''
  if (!value.includes('<')) return value.trim()
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function NotesPreview({ value }: { value: string }) {
  const text = plainTextFromHtml(value)

  return (
    <div
      title={text || 'Open task details to add notes'}
      style={{
        minHeight: 58,
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 6,
        padding: '7px 8px',
        background: 'rgba(255,255,255,.45)',
        color: text ? 'inherit' : 'var(--theme-elevation-400)',
        fontSize: 13,
        lineHeight: 1.35,
        overflow: 'hidden',
        overflowWrap: 'anywhere',
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 4,
        whiteSpace: 'pre-wrap',
      }}
    >
      {text || 'Open details to add notes…'}
    </div>
  )
}

function WeekPickerCell({ value, onChange, rowSpan, color, boxColor }: { value: string; onChange: (date: string) => void; rowSpan?: number; color?: string; boxColor?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const week = taskWeek(value) || mondayKey()

  return (
    <td rowSpan={rowSpan} style={{ ...tdStyle, width: 132, minWidth: 132, verticalAlign: 'middle', background: color }}>
      <button
        type="button"
        onClick={() => {
          const input = inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null
          if (input?.showPicker) input.showPicker()
          else input?.focus()
        }}
        style={{
          width: '100%',
          minHeight: rowSpan && rowSpan > 1 ? Math.max(rowSpan * 72, 72) : 58,
          border: '1px solid rgba(255,255,255,.35)',
          borderRadius: 8,
          padding: '8px',
          background: boxColor || '#0f766e',
          color: '#fff',
          cursor: 'pointer',
          textAlign: 'left',
          fontWeight: 900,
          lineHeight: 1.2,
        }}
        title="Click to choose any date in this week"
      >
        {weekLabel(week)}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value ? value.slice(0, 10) : week}
        onChange={(e) => onChange(mondayKey(new Date(`${e.target.value}T00:00:00`)))}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
        tabIndex={-1}
      />
    </td>
  )
}

export default function TeamTasksSpreadsheet() {
  const [tasks, setTasks] = useState<TeamTask[]>([])
  const [clients, setClients] = useState<Option[]>([])
  const [users, setUsers] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | number | null>(null)
  const [statusFilter, setStatusFilter] = useState('open')
  const [clientFilter, setClientFilter] = useState('')
  const [weekStart, setWeekStart] = useState(() => mondayKey())
  const [weekMode, setWeekMode] = useState<'week' | 'all'>('week')
  const [error, setError] = useState('')
  const [canManage, setCanManage] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | number | null>(null)
  const [draft, setDraft] = useState({ title: '', client: '', taskType: 'blog_post', dueDate: mondayKey(), assignedTo: '', instructions: '' })

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ status: statusFilter, weekStart: weekMode === 'all' ? 'all' : weekStart })
      if (clientFilter) params.set('client', clientFilter)
      const res = await fetch(`/api/team-tasks/grid?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load tasks')
      setTasks(json.tasks || [])
      setClients(json.clients || [])
      setUsers(json.users || [])
      setCanManage(Boolean(json.canManage))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [statusFilter, clientFilter, weekStart, weekMode])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const task = params.get('task')
    if (task) setSelectedTaskId(task)
  }, [])

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, TeamTask[]>()
    for (const task of tasks) {
      const week = taskWeek(task.dueDate) || weekStart
      if (!groups.has(week)) groups.set(week, [])
      groups.get(week)!.push(task)
    }
    return Array.from(groups.entries())
  }, [tasks, weekStart])
  const draftWeek = taskWeek(draft.dueDate) || weekStart
  const lastGroupIndex = groupedTasks.length - 1
  const draftMergesWithLastWeek = lastGroupIndex >= 0 && groupedTasks[lastGroupIndex]?.[0] === draftWeek
  const draftWeekColor = draftMergesWithLastWeek ? weekColors[lastGroupIndex % weekColors.length] : weekColors[groupedTasks.length % weekColors.length]

  const openTask = (id: string | number) => {
    setSelectedTaskId(id)
    const url = new URL(window.location.href)
    url.searchParams.set('task', String(id))
    window.history.replaceState(null, '', url.toString())
  }

  const closeTask = () => {
    setSelectedTaskId(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('task')
    window.history.replaceState(null, '', url.toString())
  }

  const deleteRow = async (id: string | number) => {
    if (!window.confirm('Delete this task row?')) return
    setSavingId(id)
    setError('')
    const previousTasks = tasks
    setTasks((prev) => prev.filter((task) => task.id !== id))
    try {
      const res = await fetch(`/api/team-tasks/grid?id=${encodeURIComponent(String(id))}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete task')
    } catch (err) {
      setTasks(previousTasks)
      setError(err instanceof Error ? err.message : 'Failed to delete task')
    } finally {
      setSavingId(null)
    }
  }

  const patch = async (id: string | number, data: Partial<TeamTask>) => {
    setSavingId(id)
    setError('')
    setTasks((prev) => prev.map((task) => task.id === id ? { ...task, ...data } : task))
    try {
      const res = await fetch('/api/team-tasks/grid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save task')
      setTasks((prev) => prev.map((task) => task.id === id ? json.task : task))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task')
      await load()
    } finally {
      setSavingId(null)
    }
  }

  const addRow = async () => {
    setSavingId('new')
    setError('')
    try {
      const res = await fetch('/api/team-tasks/grid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, title: draft.title.trim() || 'New task', status: 'in_progress', priority: 'normal' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add task')
      setDraft({ title: '', client: draft.client, taskType: draft.taskType, dueDate: weekStart, assignedTo: draft.assignedTo, instructions: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add task')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ padding: '24px 0 40px' }}>
      <h1 style={{ margin: '0 0 14px', fontSize: 34 }}>Team Tasks</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '150px 220px 180px 260px 1fr', gap: 8, alignItems: 'end', marginBottom: 10 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--theme-elevation-500)', fontWeight: 700 }}>
          Weeks
          <select value={weekMode} onChange={(e) => setWeekMode(e.target.value as 'week' | 'all')} style={inputStyle}>
            <option value="week">Selected week</option>
            <option value="all">All weeks</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--theme-elevation-500)', fontWeight: 700, opacity: weekMode === 'all' ? .55 : 1 }}>
          Week
          <input
            type="date"
            value={weekStart}
            disabled={weekMode === 'all'}
            onChange={(e) => {
              const next = mondayKey(new Date(`${e.target.value}T00:00:00`))
              setWeekStart(next)
              setDraft((current) => ({ ...current, dueDate: next }))
            }}
            style={inputStyle}
          />
        </label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
          <option value="open">Open work</option>
          <option value="all">All tasks</option>
          {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={inputStyle}>
          <option value="">All clients</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
        <div style={{ fontSize: 13, color: 'var(--theme-elevation-500)', paddingBottom: 8 }}>
          Showing work to do for <strong>{weekMode === 'all' ? 'all weeks' : weekLabel(weekStart)}</strong>
        </div>
      </div>

      {error && <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: '#fef2f2', color: '#991b1b' }}>{error}</div>}

      <div style={{ width: '100%', maxWidth: 'none', border: '1px solid var(--theme-elevation-150)', borderRadius: 12, overflow: 'auto', background: 'var(--theme-bg)' }}>
        <table style={{ width: '100%', minWidth: 1360, borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 132 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 145 }} />
            <col style={{ width: 260 }} />
            <col style={{ width: 128 }} />
            <col style={{ width: 150 }} />
            <col />
            <col style={{ width: 96 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>Week</th>
              <th style={thStyle}>Client</th>
              <th style={thStyle}>Task Type</th>
              <th style={thStyle}>Topic / Title</th>
              <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>Status</th>
              <th style={thStyle}>Assigned</th>
              <th style={thStyle}>Notes / Instructions</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 28, textAlign: 'center', color: 'var(--theme-elevation-500)' }}>Loading tasks…</td></tr>
            ) : groupedTasks.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 14, textAlign: 'center', color: 'var(--theme-elevation-500)' }}>No tasks match this week — add the first row below.</td></tr>
            ) : groupedTasks.map(([week, rows], groupIndex) => {
              const weekColor = weekColors[groupIndex % weekColors.length]
              const mergesDraft = groupIndex === lastGroupIndex && draftMergesWithLastWeek
              return rows.map((task, index) => (
              <tr key={task.id} style={{ background: weekColor.bg, ...(savingId === task.id ? { opacity: .6 } : undefined) }}>
                {index === 0 && (
                  <WeekPickerCell value={week} rowSpan={rows.length + (mergesDraft ? 1 : 0)} color={weekColor.bg} boxColor={weekColor.box} onChange={(nextWeek) => {
                    void Promise.all(rows.map((row) => patch(row.id, { dueDate: nextWeek })))
                    if (mergesDraft) setDraft((current) => ({ ...current, dueDate: nextWeek }))
                  }} />
                )}
                <td style={tdStyle}>
                  <select value={relId(task.client)} onChange={(e) => patch(task.id, { client: e.target.value })} style={inputStyle} title={relName(task.client, clients)} disabled={!canManage}>
                    <option value="">—</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select>
                </td>
                <td style={tdStyle}>
                  <select value={task.taskType || 'other'} onChange={(e) => patch(task.id, { taskType: e.target.value })} style={inputStyle} disabled={!canManage}>
                    {taskTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </td>
                <td style={tdStyle}>
                  <textarea
                    defaultValue={task.title || ''}
                    rows={2}
                    onBlur={(e) => {
                      if (e.target.value !== task.title) void patch(task.id, { title: e.target.value })
                    }}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') e.currentTarget.blur()
                    }}
                    style={{ ...inputStyle, minWidth: 260, minHeight: 58, resize: 'vertical', lineHeight: 1.35, overflowWrap: 'anywhere' }}
                  />
                </td>
                <td style={tdStyle}>
                  <select value={task.status || 'in_progress'} onChange={(e) => patch(task.id, { status: e.target.value })} style={{ ...inputStyle, width: 126, whiteSpace: 'nowrap', fontSize: 12, ...statusTone(task.status) }}>
                    {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </td>
                <td style={tdStyle}>
                  <select value={relId(task.assignedTo)} onChange={(e) => patch(task.id, { assignedTo: e.target.value })} style={inputStyle} title={relName(task.assignedTo, users)} disabled={!canManage}>
                    <option value="">Unassigned</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </td>
                <td style={tdStyle}>
                  <NotesPreview value={task.instructions || task.staffNotes || ''} />
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => openTask(task.id)}
                      title="Open task details"
                      style={{ ...inputStyle, padding: '7px 0', cursor: 'pointer', color: '#1d4ed8', fontWeight: 900 }}
                    >
                      ↗
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => void deleteRow(task.id)}
                        disabled={savingId === task.id}
                        title="Delete row"
                        style={{ ...inputStyle, padding: '7px 0', cursor: 'pointer', color: '#991b1b', fontWeight: 900 }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              ))
            })}
            {!loading && (
              <>
                <tr style={{ background: draftWeekColor.bg }}>
                  {!draftMergesWithLastWeek && (
                    <WeekPickerCell value={draft.dueDate} color={draftWeekColor.bg} boxColor={draftWeekColor.box} onChange={(nextWeek) => setDraft({ ...draft, dueDate: nextWeek })} />
                  )}
                  <td style={tdStyle}>
                    <select value={draft.client} onChange={(e) => setDraft({ ...draft, client: e.target.value })} style={inputStyle}>
                      <option value="">Client</option>
                      {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select value={draft.taskType} onChange={(e) => setDraft({ ...draft, taskType: e.target.value })} style={inputStyle}>
                      {taskTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Type task title here…" style={{ ...inputStyle, minWidth: 260, borderColor: '#14b8a6' }} onKeyDown={(e) => { if (e.key === 'Enter') void addRow() }} />
                  </td>
                  <td style={tdStyle}>
                    <span style={{ display: 'block', borderRadius: 6, padding: '8px', fontSize: 12, fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', ...statusTone('in_progress') }}>In Progress</span>
                  </td>
                  <td style={tdStyle}>
                    <select value={draft.assignedTo} onChange={(e) => setDraft({ ...draft, assignedTo: e.target.value })} style={inputStyle}>
                      <option value="">Unassigned</option>
                      {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <NotesEditor
                      value={draft.instructions}
                      onSave={(next) => setDraft({ ...draft, instructions: next })}
                      minWidth={260}
                    />
                  </td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => setDraft({ title: '', client: '', taskType: 'blog_post', dueDate: weekStart, assignedTo: '', instructions: '' })}
                      title="Clear draft row"
                      style={{ ...inputStyle, padding: '7px 0', cursor: 'pointer', color: '#64748b', fontWeight: 900 }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
                <tr style={{ background: 'rgba(70, 141, 139, 0.08)' }}>
                  <td colSpan={8} style={{ padding: '8px 10px 12px', borderBottom: '1px solid var(--theme-elevation-100)' }}>
                    <button type="button" onClick={addRow} disabled={savingId === 'new'} style={{ ...inputStyle, width: 'auto', minWidth: 180, cursor: 'pointer', fontWeight: 900, background: '#14b8a6', borderColor: '#0f766e', color: '#fff' }}>
                      {savingId === 'new' ? 'Adding row…' : '+ Add row'}
                    </button>
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      {selectedTaskId && (
        <TeamTaskDetailPane
          taskId={selectedTaskId}
          onClose={closeTask}
          onTaskUpdated={(updatedTask) => {
            setTasks((prev) => prev.map((task) => task.id === updatedTask.id ? { ...task, ...updatedTask } : task))
          }}
        />
      )}
    </div>
  )
}
