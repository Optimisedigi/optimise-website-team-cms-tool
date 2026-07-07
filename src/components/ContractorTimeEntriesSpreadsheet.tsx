'use client'

import { useEffect, useMemo, useState } from 'react'

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
  return `${start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
}

function allocationHours(entry: TimeEntry, clientId: string | number): number {
  return Number(entry.clientAllocations?.find((allocation) => String(allocation.client) === String(clientId))?.hours || 0)
}

function allocatedTotal(entry: TimeEntry): number {
  return (entry.clientAllocations || []).reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0)
}

function statusTone(status: string): React.CSSProperties {
  if (status === 'paid') return { background: '#e0e7ff', color: '#3730a3' }
  if (status === 'approved') return { background: '#dcfce7', color: '#166534' }
  if (status === 'submitted') return { background: '#dbeafe', color: '#1e40af' }
  return { background: '#fef3c7', color: '#92400e' }
}

export default function ContractorTimeEntriesSpreadsheet() {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [clients, setClients] = useState<Option[]>([])
  const [users, setUsers] = useState<Option[]>([])
  const [currentUser, setCurrentUser] = useState<Option | null>(null)
  const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotal[]>([])
  const [month, setMonth] = useState(() => monthKey())
  const [userFilter, setUserFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | number | null>(null)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [canDelete, setCanDelete] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ month })
      if (userFilter) params.set('user', userFilter)
      const res = await fetch(`/api/contractor-time-entries/grid?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load contractor time entries')
      setEntries(json.entries || [])
      setClients(json.clients || [])
      setUsers(json.users || [])
      setCurrentUser(json.currentUser || null)
      setMonthlyTotals(json.monthlyTotals || [])
      setIsAdmin(Boolean(json.isAdmin))
      setCanDelete(Boolean(json.canDelete))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contractor time entries')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [month, userFilter])

  const tableMinWidth = useMemo(() => 650 + clients.length * 120, [clients.length])

  const patch = async (id: string | number, data: Partial<TimeEntry>) => {
    setSavingId(id)
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
      setEntries((current) => current.map((entry) => entry.id === id ? json.entry : entry))
      if (data.clientAllocations || data.hours != null) void load()
    } catch (err) {
      setEntries(previous)
      setError(err instanceof Error ? err.message : 'Failed to save entry')
    } finally {
      setSavingId(null)
    }
  }

  const patchAllocation = (entry: TimeEntry, clientId: string | number, value: string) => {
    const hours = Math.max(0, Number(value || 0))
    const map = new Map<string, Allocation>()
    for (const allocation of entry.clientAllocations || []) {
      map.set(String(allocation.client), { client: allocation.client, hours: Number(allocation.hours || 0) })
    }
    map.set(String(clientId), { client: clientId, hours })
    const clientAllocations = Array.from(map.values()).filter((allocation) => allocation.hours > 0)
    void patch(entry.id, { clientAllocations })
  }

  const addWeek = async () => {
    const owner = isAdmin ? userFilter : String(currentUser?.id || '')
    if (!owner) {
      setError(isAdmin ? 'Select a user before adding a week.' : 'Your user account could not be loaded.')
      return
    }
    setSavingId('new')
    setError('')
    try {
      let target = firstMondayInMonth(month)
      const existing = new Set(entries.filter((entry) => relId(entry.user) === owner).map((entry) => entry.weekCommencing.slice(0, 10)))
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
      <h1 style={{ margin: '0 0 14px', fontSize: 34 }}>Contractor Time Entries</h1>
      <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '180px 260px 1fr' : '180px 1fr', gap: 8, alignItems: 'end', marginBottom: 10 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--theme-elevation-500)', fontWeight: 700 }}>
          Month
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} style={inputStyle} />
        </label>
        {isAdmin && (
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--theme-elevation-500)', fontWeight: 700 }}>
            User
            <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} style={inputStyle}>
              <option value="">All users with time</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
        )}
        <div style={{ fontSize: 13, color: 'var(--theme-elevation-500)', paddingBottom: 8 }}>
          {isAdmin ? 'View everyone, filter to users who have added time, and allocate hours across active client columns.' : 'Add your own weekly time only, then allocate hours across active client columns.'}
        </div>
      </div>

      {error && <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: '#fef2f2', color: '#991b1b' }}>{error}</div>}

      <div style={{ marginBottom: 14, border: '1px solid var(--theme-elevation-150)', borderRadius: 12, overflow: 'auto', background: 'var(--theme-bg)' }}>
        <table style={{ width: '100%', minWidth: 520, borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={thStyle}>Monthly allocation</th>
              {monthlyTotals.map((total) => <th key={total.clientId} style={{ ...thStyle, textAlign: 'right' }}>{total.clientName}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 900 }}>Hours</td>
              {monthlyTotals.map((total) => <td key={total.clientId} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{total.hours.toFixed(2)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ width: '100%', maxWidth: 'none', border: '1px solid var(--theme-elevation-150)', borderRadius: 12, overflow: 'auto', background: 'var(--theme-bg)' }}>
        <table style={{ width: '100%', minWidth: tableMinWidth, borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 180 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 100 }} />
            {clients.map((client) => <col key={client.id} style={{ width: 120 }} />)}
            <col style={{ width: 120 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 70 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>User</th>
              <th style={thStyle}>Week</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              {clients.map((client) => <th key={client.id} style={{ ...thStyle, textAlign: 'right' }}>{client.name}</th>)}
              <th style={{ ...thStyle, textAlign: 'right' }}>Discrepancy</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={clients.length + 6} style={{ padding: 28, textAlign: 'center', color: 'var(--theme-elevation-500)' }}>Loading entries…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={clients.length + 6} style={{ padding: 14, textAlign: 'center', color: 'var(--theme-elevation-500)' }}>No time entries for this month — add the first week below.</td></tr>
            ) : entries.map((entry) => {
              const discrepancy = Number(entry.hours || 0) - allocatedTotal(entry)
              const locked = entry.status === 'paid'
              return (
                <tr key={entry.id} style={{ height: 58, ...(savingId === entry.id ? { opacity: .6 } : undefined) }}>
                  <td style={tdStyle} title={relName(entry.user, users)}>
                    {isAdmin ? (
                      <select value={relId(entry.user)} onChange={(event) => void patch(entry.id, { user: event.target.value })} disabled={locked} style={inputStyle}>
                        <option value="">Unassigned / contractor</option>
                        {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                      </select>
                    ) : (
                      <div style={{ ...inputStyle, background: 'rgba(255,255,255,.35)' }}>{relName(entry.user, users) || currentUser?.name || 'You'}</div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <input type="date" value={entry.weekCommencing.slice(0, 10)} onChange={(event) => void patch(entry.id, { weekCommencing: mondayKey(new Date(`${event.target.value}T00:00:00`)) })} disabled={locked} style={inputStyle} title={weekLabel(entry.weekCommencing)} />
                  </td>
                  <td style={tdStyle}>
                    <input type="number" min={0} max={168} step={0.25} value={entry.hours ?? 0} onChange={(event) => void patch(entry.id, { hours: Number(event.target.value || 0) })} disabled={locked} style={{ ...inputStyle, textAlign: 'right', fontWeight: 800 }} />
                  </td>
                  {clients.map((client) => (
                    <td key={client.id} style={tdStyle}>
                      <input type="number" min={0} max={168} step={0.25} value={allocationHours(entry, client.id)} onChange={(event) => patchAllocation(entry, client.id, event.target.value)} disabled={locked} style={{ ...inputStyle, textAlign: 'right' }} />
                    </td>
                  ))}
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, color: Math.abs(discrepancy) < 0.01 ? '#15803d' : '#b45309' }}>
                    {discrepancy.toFixed(2)}
                  </td>
                  <td style={tdStyle}>
                    <select value={entry.status || 'draft'} onChange={(event) => void patch(entry.id, { status: event.target.value })} disabled={locked} style={{ ...inputStyle, ...statusTone(entry.status) }}>
                      {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </td>
                  <td style={{ ...tdStyle, padding: 4 }}>
                    <div style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
                      <a href={`/admin/collections/contractor-time-entries/${entry.id}`} title="Open entry" style={{ ...inputStyle, display: 'grid', placeItems: 'center', width: 36, height: 36, padding: 0, color: '#1d4ed8', fontWeight: 900, textDecoration: 'none' }}>↗</a>
                      {canDelete && !locked && <button type="button" onClick={() => void deleteEntry(entry.id)} disabled={savingId === entry.id} title="Delete row" style={{ ...inputStyle, width: 36, height: 36, padding: 0, cursor: 'pointer', color: '#991b1b', fontWeight: 900 }}>×</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!loading && (
              <tr style={{ background: 'rgba(70, 141, 139, 0.08)' }}>
                <td colSpan={clients.length + 6} style={{ padding: '8px 10px 12px', borderBottom: '1px solid var(--theme-elevation-100)' }}>
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
