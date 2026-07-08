'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

type Option = { id: string | number; name: string; email?: string | null }
type Allocation = { client: string | number; hours: number }
type TimeEntry = {
  id: string | number
  user?: Option | string | number | null
  contractor?: Option | string | number | null
  weekCommencing: string
  hours: number
  status: string
  notes?: string | null
  clientAllocations?: Allocation[]
}

type MonthlyTotal = { clientId: string; clientName: string; hours: number }
type MonthlyAllocationRow = { month: string; monthLabel: string; totals: MonthlyTotal[] }

const statuses = [
  ['draft', 'Draft'],
  ['submitted', 'Submitted'],
  ['approved', 'Approved'],
  ['paid', 'Paid'],
]

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

function relId(value: Option | string | number | null | undefined): string {
  if (value && typeof value === 'object') return String(value.id)
  return value == null ? '' : String(value)
}

function relName(value: Option | string | number | null | undefined, options: Option[]): string {
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

function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function firstMondayInMonth(month: string): string {
  const first = new Date(`${month}-01T00:00:00`)
  const day = first.getDay() || 7
  if (day !== 1) first.setDate(first.getDate() + (8 - day))
  return mondayKey(first)
}

function weekLabel(weekStart: string): string {
  const start = new Date(`${weekStart.slice(0, 10)}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const startMonth = start.toLocaleDateString('en-AU', { month: 'long' })
  const endMonth = end.toLocaleDateString('en-AU', { month: 'long' })
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) return `${start.getDate()}-${end.getDate()} ${endMonth}`
  return `${start.getDate()} ${startMonth} - ${end.getDate()} ${endMonth}`
}

function allocationHours(entry: TimeEntry, clientId: string | number): number {
  return Number(entry.clientAllocations?.find((allocation) => String(allocation.client) === String(clientId))?.hours || 0)
}

function allocationInputValue(entry: TimeEntry, clientId: string | number): string {
  const hours = allocationHours(entry, clientId)
  return hours > 0 ? String(hours) : ''
}

function allocatedTotal(entry: TimeEntry): number {
  return (entry.clientAllocations || []).reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0)
}

function openDatePicker(input: HTMLInputElement) {
  const pickerInput = input as HTMLInputElement & { showPicker?: () => void }
  if (pickerInput.showPicker) pickerInput.showPicker()
  else pickerInput.focus()
}

function statusTone(status: string): React.CSSProperties {
  if (status === 'paid') return { background: '#e0e7ff', color: '#3730a3' }
  if (status === 'approved') return { background: '#dcfce7', color: '#166534' }
  if (status === 'submitted') return { background: '#dbeafe', color: '#1e40af' }
  return { background: '#fef3c7', color: '#92400e' }
}

function WeekDateCell({ value, locked, onChange }: { value: string; locked: boolean; onChange: (date: string) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const date = value.slice(0, 10)
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => { if (!locked && inputRef.current) openDatePicker(inputRef.current) }}
        disabled={locked}
        style={{ ...inputStyle, cursor: locked ? 'default' : 'pointer', textAlign: 'left', fontWeight: 800, minHeight: 34 }}
        title="Click to choose any date in this week"
      >
        {weekLabel(date)}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={date}
        onChange={(event) => onChange(mondayKey(new Date(`${event.target.value}T00:00:00`)))}
        disabled={locked}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1, left: 0, top: 0 }}
        tabIndex={-1}
      />
    </div>
  )
}

export default function ContractorTimeEntriesSpreadsheet() {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [clients, setClients] = useState<Option[]>([])
  const [users, setUsers] = useState<Option[]>([])
  const [currentUser, setCurrentUser] = useState<Option | null>(null)
  const [monthlyTotals, setMonthlyTotals] = useState<MonthlyAllocationRow[]>([])
  const [weekMode, setWeekMode] = useState<'week' | 'all'>('week')
  const [weekStart, setWeekStart] = useState(() => mondayKey())
  const month = weekStart.slice(0, 7)
  const [userFilter, setUserFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | number | null>(null)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [autoTotalEntryIds, setAutoTotalEntryIds] = useState<Set<string | number>>(() => new Set())
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({})
  const selectedClientIdSet = useMemo(() => new Set(selectedClientIds), [selectedClientIds])
  const visibleClients = useMemo(() => clients.filter((client) => selectedClientIdSet.has(String(client.id))), [clients, selectedClientIdSet])
  const visibleMonthlyTotals = useMemo(() => monthlyTotals.map((row) => ({
    ...row,
    totals: row.totals.filter((total) => selectedClientIdSet.has(String(total.clientId))),
  })), [monthlyTotals, selectedClientIdSet])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ month, weekMode, week: weekStart })
      if (userFilter) params.set('user', userFilter)
      const res = await fetch(`/api/contractor-time-entries/grid?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load contractor time entries')
      const nextClients = json.clients || []
      const nextEntries = json.entries || []
      setEntries(nextEntries)
      setAutoTotalEntryIds(new Set(nextEntries.filter((entry: TimeEntry) => {
        const hours = Number(entry.hours || 0)
        return hours === 0 || Math.abs(hours - allocatedTotal(entry)) < 0.01
      }).map((entry: TimeEntry) => entry.id)))
      setClients(nextClients)
      setUsers(json.users || [])
      setCurrentUser(json.currentUser || null)
      setMonthlyTotals(json.monthlyTotals || [])
      setIsAdmin(Boolean(json.isAdmin))
      setCanDelete(Boolean(json.canDelete))
      const availableClientIds = new Set(nextClients.map((client: Option) => String(client.id)))
      const defaultClientIds = Array.isArray(json.columnClientIds)
        ? json.columnClientIds.map(String).filter((id: string) => availableClientIds.has(id))
        : nextClients.map((client: Option) => String(client.id))
      setSelectedClientIds(defaultClientIds)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contractor time entries')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [month, weekMode, weekStart, userFilter])

  const leadingColumnCount = 1
  const totalColumnCount = leadingColumnCount + visibleClients.length + 4 + (isAdmin ? 1 : 0)
  const tableMinWidth = useMemo(() => 385 + visibleClients.length * 60 + (isAdmin ? 96 : 0), [isAdmin, visibleClients.length])

  const patch = async (id: string | number, data: Partial<TimeEntry>, options: { quiet?: boolean } = {}) => {
    if (!options.quiet) setSavingId(id)
    setError('')
    const previous = entries
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...data } : entry))
    try {
      const res = await fetch('/api/contractor-time-entries/grid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save entry')
      if (!options.quiet) setEntries((current) => current.map((entry) => entry.id === id ? json.entry : entry))
    } catch (err) {
      setEntries(previous)
      setError(err instanceof Error ? err.message : 'Failed to save entry')
    } finally {
      if (!options.quiet) setSavingId(null)
    }
  }

  const draftKey = (entryId: string | number, field: string) => `${entryId}:${field}`

  const setInputDraft = (key: string, value: string) => {
    setInputDrafts((current) => ({ ...current, [key]: value }))
  }

  const clearInputDraft = (key: string) => {
    setInputDrafts((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const patchAllocation = (entry: TimeEntry, clientId: string | number, value: string) => {
    const key = draftKey(entry.id, `client:${clientId}`)
    setInputDraft(key, value)
    const hours = Math.max(0, Number(value || 0))
    const map = new Map<string, Allocation>()
    for (const allocation of entry.clientAllocations || []) {
      map.set(String(allocation.client), { client: allocation.client, hours: Number(allocation.hours || 0) })
    }
    map.set(String(clientId), { client: clientId, hours })
    const clientAllocations = Array.from(map.values()).filter((allocation) => allocation.hours > 0)
    const nextAllocatedTotal = clientAllocations.reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0)
    const shouldAutoTotal = autoTotalEntryIds.has(entry.id)
    if (shouldAutoTotal) setAutoTotalEntryIds((current) => new Set(current).add(entry.id))
    void patch(entry.id, { clientAllocations, ...(shouldAutoTotal ? { hours: Math.round(nextAllocatedTotal * 100) / 100 } : {}) }, { quiet: true })
  }

  const patchTotalHours = (entry: TimeEntry, value: string) => {
    const key = draftKey(entry.id, 'total')
    setInputDraft(key, value)
    if (value === '') {
      setAutoTotalEntryIds((current) => new Set(current).add(entry.id))
      void patch(entry.id, { hours: Math.round(allocatedTotal(entry) * 100) / 100 }, { quiet: true })
      return
    }
    setAutoTotalEntryIds((current) => {
      const next = new Set(current)
      next.delete(entry.id)
      return next
    })
    void patch(entry.id, { hours: Math.max(0, Number(value || 0)) }, { quiet: true })
  }

  const saveClientColumns = async (clientIds: string[]) => {
    const res = await fetch('/api/contractor-time-entries/grid', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnClientIds: clientIds }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to save columns')
  }

  const setClientColumns = (clientIds: string[]) => {
    setSelectedClientIds(clientIds)
    void saveClientColumns(clientIds).catch((err) => setError(err instanceof Error ? err.message : 'Failed to save columns'))
  }

  const toggleClientColumn = (clientId: string | number) => {
    const id = String(clientId)
    setSelectedClientIds((current) => {
      const next = current.includes(id) ? current.filter((currentId) => currentId !== id) : [...current, id]
      void saveClientColumns(next).catch((err) => setError(err instanceof Error ? err.message : 'Failed to save columns'))
      return next
    })
  }

  const addWeek = async () => {
    const owner = isAdmin ? userFilter : String(currentUser?.id || '')
    if (!owner) {
      setError(isAdmin ? 'Select the user to add time for.' : 'Your user account could not be loaded.')
      return
    }
    setSavingId('new')
    setError('')
    try {
      let target = weekMode === 'week' ? weekStart : firstMondayInMonth(month)
      const existing = new Set(entries.filter((entry) => relId(entry.user) === owner).map((entry) => entry.weekCommencing.slice(0, 10)))
      if (weekMode === 'week' && existing.has(target)) {
        setError('This week already has a time entry. Edit the existing row or switch to All weeks to add another week.')
        return
      }
      while (existing.has(target)) {
        const d = new Date(`${target}T00:00:00`)
        d.setDate(d.getDate() + 7)
        target = mondayKey(d)
      }
      const res = await fetch('/api/contractor-time-entries/grid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: owner, weekCommencing: target, hours: 0, status: 'draft' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add week')
      if (isAdmin && !userFilter) setUserFilter(owner)
      setWeekStart(target)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add week')
    } finally {
      setSavingId(null)
    }
  }

  const deleteEntry = async (id: string | number) => {
    if (!window.confirm('Delete this contractor time entry?')) return
    setSavingId(id)
    setError('')
    try {
      const res = await fetch(`/api/contractor-time-entries/grid?id=${encodeURIComponent(String(id))}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete entry')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ padding: '24px 10px 40px', boxSizing: 'border-box' }}>
      <h1 style={{ margin: '0 0 14px', fontSize: 34 }}>Time entries</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '150px 170px minmax(220px, 1fr) auto', gap: 8, alignItems: 'end', marginBottom: 10 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--theme-elevation-500)', fontWeight: 700 }}>
          Weeks
          <select value={weekMode} onChange={(event) => setWeekMode(event.target.value as 'week' | 'all')} style={inputStyle}>
            <option value="week">This week</option>
            <option value="all">All weeks</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--theme-elevation-500)', fontWeight: 700, opacity: weekMode === 'week' ? 1 : .55 }}>
          Week
          <input
            type="date"
            value={weekStart}
            disabled={weekMode !== 'week'}
            onClick={(event) => openDatePicker(event.currentTarget)}
            onChange={(event) => setWeekStart(mondayKey(new Date(`${event.target.value}T00:00:00`)))}
            style={{ ...inputStyle, cursor: weekMode === 'week' ? 'pointer' : 'default' }}
          />
        </label>
        <div style={{ fontSize: 13, color: 'var(--theme-elevation-500)', paddingBottom: 8 }}>
          Showing <strong>{weekMode === 'all' ? 'all weeks' : weekLabel(weekStart)}</strong>. {isAdmin ? 'Use the user selector above the time boxes to show everyone or add/edit one person.' : 'Add your own weekly time and allocate hours across active client columns.'}
        </div>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', paddingBottom: 1 }}>
          <button type="button" onClick={() => setShowColumnPicker((open) => !open)} style={{ ...inputStyle, width: 'auto', minWidth: 0, padding: '5px 9px', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'transparent', color: 'var(--theme-elevation-500)' }}>
            Columns ({visibleClients.length})
          </button>
          {showColumnPicker && (
            <div style={{ position: 'absolute', zIndex: 5, top: 'calc(100% + 6px)', right: 0, width: 320, maxHeight: 360, overflow: 'auto', padding: 10, border: '1px solid var(--theme-elevation-150)', borderRadius: 12, background: 'var(--theme-bg)', boxShadow: '0 12px 30px rgba(0,0,0,.18)' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button type="button" onClick={() => setClientColumns(clients.map((client) => String(client.id)))} style={{ ...inputStyle, cursor: 'pointer', fontWeight: 800 }}>Show all</button>
                <button type="button" onClick={() => setClientColumns([])} style={{ ...inputStyle, cursor: 'pointer', fontWeight: 800 }}>Hide all</button>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {clients.map((client) => (
                  <label key={client.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedClientIdSet.has(String(client.id))} onChange={() => toggleClientColumn(client.id)} />
                    <span style={{ textTransform: 'none' }}>{client.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: '#fef2f2', color: '#991b1b' }}>{error}</div>}

      <div style={{ marginBottom: 24, border: '1px solid var(--theme-elevation-250)', borderRadius: 12, overflow: 'auto', background: 'var(--theme-bg)', boxShadow: '0 1px 0 rgba(0,0,0,.04)' }}>
        <table style={{ width: '100%', minWidth: tableMinWidth, borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 90 }} />
            {visibleClients.map((client) => <col key={client.id} style={{ width: 60 }} />)}
            <col style={{ width: 70 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 60 }} />
          </colgroup>
          <thead>
            <tr>
              <th colSpan={leadingColumnCount} style={thStyle}>Monthly allocation</th>
              {visibleClients.map((client) => <th key={client.id} style={{ ...thStyle, textAlign: 'center', textTransform: 'none', letterSpacing: 0, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.2, borderLeft: '1px solid var(--theme-elevation-100)' }}>{client.name}</th>)}
              <th colSpan={4} style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {visibleMonthlyTotals.map((row) => (
              <tr key={row.month}>
                <td colSpan={leadingColumnCount} style={{ ...tdStyle, fontWeight: 900 }}>{row.monthLabel}</td>
                {row.totals.map((total) => <td key={total.clientId} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, borderLeft: '1px solid var(--theme-elevation-100)' }}>{total.hours.toFixed(2)}</td>)}
                <td colSpan={4} style={tdStyle}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <label style={{ display: 'grid', gap: 4, maxWidth: 180, margin: '0 0 8px', fontSize: 12, color: 'var(--theme-elevation-500)', fontWeight: 700 }}>
          User
          <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} style={inputStyle}>
            <option value="">All users</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
      )}

      <div style={{ width: '100%', maxWidth: 'none', border: '1px solid var(--theme-elevation-250)', borderRadius: 12, overflow: 'auto', background: 'var(--theme-bg)', boxShadow: '0 1px 0 rgba(0,0,0,.04)' }}>
        <table style={{ width: '100%', minWidth: tableMinWidth, borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 90 }} />
            {visibleClients.map((client) => <col key={client.id} style={{ width: 60 }} />)}
            <col style={{ width: 70 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 86 }} />
            {isAdmin && <col style={{ width: 96 }} />}
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>Week</th>
              {visibleClients.map((client) => <th key={client.id} style={{ ...thStyle, textAlign: 'center', textTransform: 'none', letterSpacing: 0, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.2, borderLeft: '1px solid var(--theme-elevation-100)' }}>{client.name}</th>)}
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Diff</th>
              <th style={{ ...thStyle, paddingRight: 2 }}>Status</th>
              {isAdmin && <th style={{ ...thStyle, paddingLeft: 2, paddingRight: 2 }}>Name</th>}
              <th style={{ ...thStyle, paddingLeft: 2 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={totalColumnCount} style={{ padding: 28, textAlign: 'center', color: 'var(--theme-elevation-500)' }}>Loading entries…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={totalColumnCount} style={{ padding: 14, textAlign: 'center', color: 'var(--theme-elevation-500)' }}>No time entries for this period — add the first week below.</td></tr>
            ) : entries.map((entry) => {
              const allocated = allocatedTotal(entry)
              const autoTotal = autoTotalEntryIds.has(entry.id)
              const effectiveTotal = autoTotal ? allocated : Number(entry.hours || 0)
              const discrepancy = effectiveTotal - allocated
              const locked = entry.status === 'paid'
              const totalKey = draftKey(entry.id, 'total')
              return (
                <Fragment key={entry.id}>
                  <tr style={{ height: 58, ...(savingId === entry.id ? { opacity: .6 } : undefined) }}>
                    <td style={tdStyle}>
                      <WeekDateCell value={entry.weekCommencing} locked={locked} onChange={(date) => void patch(entry.id, { weekCommencing: date })} />
                    </td>
                    {visibleClients.map((client) => {
                      const key = draftKey(entry.id, `client:${client.id}`)
                      return (
                        <td key={client.id} style={{ ...tdStyle, borderLeft: '1px solid var(--theme-elevation-100)' }}>
                          <input type="number" min={0} max={168} step={0.25} placeholder="0" value={inputDrafts[key] ?? allocationInputValue(entry, client.id)} onChange={(event) => patchAllocation(entry, client.id, event.target.value)} onBlur={() => clearInputDraft(key)} disabled={locked} style={{ ...inputStyle, textAlign: 'right', padding: '7px 4px' }} />
                        </td>
                      )
                    })}
                    <td style={tdStyle}>
                      <input type="number" min={0} max={168} step={0.25} placeholder={allocated > 0 ? String(Math.round(allocated * 100) / 100) : 'Auto'} value={inputDrafts[totalKey] ?? (autoTotal ? '' : entry.hours ?? '')} onChange={(event) => patchTotalHours(entry, event.target.value)} onBlur={() => clearInputDraft(totalKey)} disabled={locked} style={{ ...inputStyle, textAlign: 'right', fontWeight: 800, padding: '7px 4px' }} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, color: Math.abs(discrepancy) < 0.01 ? '#15803d' : '#b45309' }}>
                      {discrepancy.toFixed(2)}
                    </td>
                    <td style={{ ...tdStyle, paddingRight: 2 }}>
                      <select value={entry.status || 'draft'} onChange={(event) => void patch(entry.id, { status: event.target.value })} disabled={locked} style={{ ...inputStyle, ...statusTone(entry.status), maxWidth: 86, padding: '7px 4px' }}>
                        {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                    {isAdmin && (
                      <td style={{ ...tdStyle, paddingLeft: 2, paddingRight: 2 }} title={relName(entry.user, users)}>
                        <select value={relId(entry.user)} onChange={(event) => void patch(entry.id, { user: event.target.value })} disabled={locked} style={{ ...inputStyle, maxWidth: 96, padding: '7px 4px' }}>
                          <option value="">Unassigned</option>
                          {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                        </select>
                      </td>
                    )}
                    <td style={{ ...tdStyle, padding: '4px 2px' }}>
                      <div style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
                        {canDelete && !locked && <button type="button" onClick={() => void deleteEntry(entry.id)} disabled={savingId === entry.id} title="Delete row" style={{ ...inputStyle, width: 32, height: 36, padding: 0, cursor: 'pointer', color: '#991b1b', fontWeight: 900 }}>×</button>}
                      </div>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
            {!loading && (
              <tr style={{ background: 'rgba(70, 141, 139, 0.08)' }}>
                <td colSpan={totalColumnCount} style={{ padding: '8px 10px 12px', borderBottom: '1px solid var(--theme-elevation-100)' }}>
                  <button type="button" onClick={() => void addWeek()} disabled={savingId === 'new'} style={{ ...inputStyle, width: 'auto', minWidth: 180, cursor: 'pointer', fontWeight: 900, background: '#7c3aed', borderColor: '#5b21b6', color: '#fff' }}>
                    {savingId === 'new' ? 'Adding week…' : '+ Add week'}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
