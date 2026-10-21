'use client'

import { useEffect, useState, useRef } from 'react'
import { InfoNote } from './InfoNote'
import { useShiftSelect } from '@/lib/useShiftSelect'
import { COSTS_IMPORTED_EVENT } from '@/lib/finance/events'
import { SalesVsCostsPanel } from '@/components/SalesVsCostsPanel'
import { YearEndEstimatePanel } from '@/components/YearEndEstimatePanel'
import {
  addMonths,
  monthKeyOf,
  periodContaining,
  periodLabel,
  periodOptions,
  periodRange,
  type PeriodMode,
} from '@/lib/finance/periods'

// ─── Types ────────────────────────────────────────────────

interface Category {
  id: string | number
  name: string
  color: string
  budget?: number
}

interface CostEntry {
  id: string | number
  date: string
  amount: number
  description: string
  category?: Category | string | number | null
  notes?: string
  source?: string
  month?: string
  client?: any
  importBatch?: string
}

interface CategoryBreakdown {
  category: Category
  total: number
  count: number
  items: CostEntry[]
}

interface HistoryEntry {
  label: string
  month: string
  categories: Array<{ id: string | number; name: string; color: string; total: number }>
  uncategorised: number
  total: number
}

interface CostAlert {
  type: string
  severity: string
  message: string
  categoryId?: string
  categoryName?: string
}

interface CostData {
  costsByCategory: CategoryBreakdown[]
  costHistory: HistoryEntry[]
  costAlerts: CostAlert[]
  uncategorised: CostEntry[]
  totalThisMonth: number
  totalLastMonth: number
  currentMonth: string
  categories: Category[]
  /** 'xero' = from Xero (bills + reconciled bank transactions); 'bank' = imported statements / manual. */
  source?: 'xero' | 'bank'
  xeroUnavailable?: 'not_configured' | 'not_deployed' | 'not_connected' | 'scope_missing' | 'error'
}

type ViewSource = 'auto' | 'bank'

// ─── Helpers ──────────────────────────────────────────────

function monthLabel(key: string): string {
  const [y = 0, m = 1] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' })
}

const COLOR_PRESETS = [
  { label: 'Navy', value: '#213843' },
  { label: 'Teal', value: '#468D8B' },
  { label: 'Mint', value: '#74B3A8' },
  { label: 'Blue', value: '#4A90D9' },
  { label: 'Purple', value: '#8B5CF6' },
  { label: 'Pink', value: '#EC4899' },
  { label: 'Red', value: '#EF4444' },
  { label: 'Orange', value: '#F59E0B' },
  { label: 'Green', value: '#22C55E' },
  { label: 'Grey', value: '#9CA3AF' },
]

// ─── Category Select with inline create ──────────────────

function CategorySelect({
  categories,
  value,
  onChange,
  onCategoryCreated,
  placeholder,
  style,
}: {
  categories: Category[]
  value: string
  onChange: (val: string) => void
  onCategoryCreated: (cat: Category) => void
  placeholder?: string
  style?: React.CSSProperties
}) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#4A90D9')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!newName.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/costs/create-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      const result = await res.json()
      if (result.id) {
        const newCat: Category = { id: result.id, name: newName.trim(), color: newColor }
        onCategoryCreated(newCat)
        onChange(String(result.id))
        setNewName('')
        setNewColor('#4A90D9')
        setCreating(false)
      }
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  if (creating) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Category name"
          style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '5px 8px' }}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
        />
        <select
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          style={{ ...selectStyle, fontSize: 12, padding: '5px 8px', minWidth: 90 }}
        >
          {COLOR_PRESETS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <span style={{ width: 18, height: 18, borderRadius: '50%', background: newColor, flexShrink: 0, border: '1px solid var(--theme-elevation-200)' }} />
        <button type="button" onClick={handleCreate} disabled={saving || !newName.trim()} style={{ ...btnStyle, fontSize: 11, padding: '4px 8px' }}>
          {saving ? '...' : 'Add'}
        </button>
        <button type="button" onClick={() => setCreating(false)} style={{ ...btnStyle, fontSize: 11, padding: '4px 8px' }}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === '__new__') { setCreating(true) }
        else { onChange(e.target.value) }
      }}
      style={style || selectStyle}
    >
      <option value="">{placeholder || 'No category'}</option>
      {categories.map((cat) => (
        <option key={String(cat.id)} value={String(cat.id)}>{(cat as any).name}</option>
      ))}
      <option value="__new__">+ New Category</option>
    </select>
  )
}

// ─── Main ─────────────────────────────────────────────────

const BusinessCostsPage = () => {
  const [data, setData] = useState<CostData | null>(null)
  const [loading, setLoading] = useState(true)
  // "Now" is fixed for the life of the page so the period list doesn't shift.
  const [currentMonth] = useState(() => monthKeyOf(new Date()))
  // Reporting period for the whole page: Australian financial year (Jul–Jun) or calendar year.
  const [periodMode, setPeriodMode] = useState<PeriodMode>('fy')
  const [periodStartYear, setPeriodStartYear] = useState(() => periodContaining('fy', currentMonth).startYear)
  // Month shown in the category breakdown; always inside the selected period.
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ date: '', amount: '', description: '', categoryId: '', notes: '', clientId: '' })
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [sortField, setSortField] = useState<'date' | 'amount' | 'description'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const period = { mode: periodMode, startYear: periodStartYear }
  const range = periodRange(period, currentMonth)
  // Xero cost categories switched off for a what-if view; shared by the
  // Sales vs Costs panel and the year-end estimate.
  const [excludedAccounts, setExcludedAccounts] = useState<ReadonlySet<string>>(() => new Set())
  // 'auto' shows Xero when available; 'bank' shows imported statements.
  const [viewSource, setViewSource] = useState<ViewSource>('auto')
  // Once Xero has answered, keep offering the Xero / Imported CSV switch.
  const [xeroSeen, setXeroSeen] = useState(false)

  const fetchData = (month?: string, source: ViewSource = viewSource) => {
    const params = new URLSearchParams()
    if (month) params.set('month', month)
    if (source === 'bank') params.set('source', 'bank')
    const qs = params.toString()
    fetch(`/api/costs${qs ? `?${qs}` : ''}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d && !d.error) {
          setData(d)
          if (d.source === 'xero') setXeroSeen(true)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchData(selectedMonth) }, [])

  // Refresh when a CSV is dropped anywhere in the admin (CostCsvDropImport).
  useEffect(() => {
    const onImported = () => fetchData(selectedMonth)
    window.addEventListener(COSTS_IMPORTED_EVENT, onImported)
    return () => window.removeEventListener(COSTS_IMPORTED_EVENT, onImported)
  }, [selectedMonth, viewSource])

  const handleMonthChange = (val: string) => {
    setSelectedMonth(val)
    setLoading(true)
    fetchData(val)
  }

  const handlePeriodModeChange = (mode: PeriodMode) => {
    if (mode === periodMode) return
    // Keep the selected month: switch to the period of the new kind containing it.
    setPeriodMode(mode)
    setPeriodStartYear(periodContaining(mode, selectedMonth).startYear)
  }

  const handlePeriodYearChange = (startYear: number) => {
    setPeriodStartYear(startYear)
    // Show the latest month of the newly chosen period.
    const latest = periodRange({ mode: periodMode, startYear }, currentMonth).to
    if (latest !== selectedMonth) handleMonthChange(latest)
  }

  const handleSourceChange = (source: ViewSource) => {
    if (source === viewSource) return
    setViewSource(source)
    setLoading(true)
    fetchData(selectedMonth, source)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/costs/upload', { method: 'POST', body: fd })
      const result = await res.json()
      setUploadResult(result)
      fetchData(selectedMonth)
    } catch {
      setUploadResult({ error: 'Upload failed' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCategorise = async (transactionId: string | number, categoryId: string | number, saveRule: boolean) => {
    try {
      const res = await fetch('/api/costs/categorise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: Number(transactionId), categoryId: Number(categoryId), saveRule }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Failed to save category: ${err.error || res.statusText}`)
        return
      }
    } catch {
      alert('Failed to save category. Check your connection.')
      return
    }
    fetchData(selectedMonth)
  }

  const handleCategoryCreated = (cat: Category) => {
    if (data) {
      setData({ ...data, categories: [...data.categories, cat] })
    }
  }

  const handleAddCost = async () => {
    if (!addForm.date || !addForm.amount || !addForm.description) return
    await fetch('/api/costs/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    setAddForm({ date: '', amount: '', description: '', categoryId: '', notes: '', clientId: '' })
    setShowAddForm(false)
    fetchData(selectedMonth)
  }

  const handleDelete = async (ids: (string | number)[]) => {
    if (ids.length === 0) return
    const label = ids.length === 1 ? 'this transaction' : `${ids.length} transactions`
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await fetch('/api/costs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      setSelectedIds(new Set())
      fetchData(selectedMonth)
    } catch { /* ignore */ }
    finally { setDeleting(false) }
  }

  const toggleSelect = (id: string | number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Compute the filtered/sorted transaction list BEFORE any early return,
  // so the useShiftSelect hook below is reached on every render. React
  // requires hooks to run in the same order each render (#310) — returning
  // early on the loading/error states while a hook lives further down
  // breaks that invariant.
  const allTransactions: CostEntry[] = data
    ? data.costsByCategory.flatMap((cb) => cb.items)
    : []

  const filtered = filterCategory === 'all'
    ? allTransactions
    : filterCategory === 'uncategorised'
      ? allTransactions.filter((t) => !t.category)
      : allTransactions.filter((t) => {
          const catId = typeof t.category === 'object' && t.category ? String((t.category as Category).id) : t.category ? String(t.category) : null
          return catId === filterCategory
        })

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortField === 'date') cmp = new Date(a.date).getTime() - new Date(b.date).getTime()
    else if (sortField === 'amount') cmp = a.amount - b.amount
    else cmp = (a.description || '').localeCompare(b.description || '')
    return sortDir === 'desc' ? -cmp : cmp
  })

  const sortedIds = sorted.map((t) => t.id)
  const { onCheckboxChange: shiftSelect } = useShiftSelect(sortedIds, selectedIds, setSelectedIds)

  if (loading && !data) {
    return <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--theme-elevation-400)' }}>Loading...</div>
  }

  if (!data) {
    return <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--theme-elevation-400)' }}>Failed to load cost data.</div>
  }

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sorted.map((t) => t.id)))
    }
  }

  const isXero = data.source === 'xero'

  // Only show categories that have costs for the selected month
  const categoriesWithCosts = data.costsByCategory.filter((cb) => cb.total > 0 || cb.count > 0)

  return (
    <div style={{ padding: '20px 0' }}>
      {/* Header: reporting period for the whole page */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Business Costs</h1>
        <div className="od-costs-period" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div role="group" aria-label="Year type" className="od-costs-period__toggle" style={{ display: 'flex', gap: 4 }}>
            {([['fy', 'Financial year'], ['cy', 'Calendar year']] as const).map(([value, label]) => {
              const active = periodMode === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handlePeriodModeChange(value)}
                  style={{ ...btnStyle, fontSize: 12, padding: '6px 12px', ...(active ? activeBtn : {}) }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <select
            aria-label={periodMode === 'fy' ? 'Financial year' : 'Calendar year'}
            value={periodStartYear}
            onChange={(e) => handlePeriodYearChange(Number(e.target.value))}
            style={selectStyle}
          >
            {periodOptions(periodMode, currentMonth).map((p) => (
              <option key={p.startYear} value={p.startYear}>
                {periodLabel(p)}{p.mode === 'fy' ? ` (Jul ${p.startYear} \u2013 Jun ${p.startYear + 1})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="od-costs-sales">
        <SalesVsCostsPanel
          from={range.from}
          to={range.to}
          label={range.label}
          toDate={range.toDate}
          excluded={excludedAccounts}
          onExcludedChange={setExcludedAccounts}
        />
      </div>

      {range.toDate && (
        <div className="od-costs-estimate">
          <YearEndEstimatePanel
            from={range.from}
            to={addMonths(range.from, 11)}
            label={range.label}
            excluded={excludedAccounts}
            onExcludedChange={setExcludedAccounts}
          />
        </div>
      )}

      {/* Monthly breakdown: one month of the selected period */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Monthly breakdown</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {xeroSeen && (
            <div role="group" aria-label="Cost data source" style={{ display: 'flex', gap: 4 }}>
              {([['auto', 'Xero'], ['bank', 'Imported CSV']] as const).map(([value, label]) => {
                const active = viewSource === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSourceChange(value)}
                    style={{ ...btnStyle, fontSize: 12, padding: '6px 12px', ...(active ? activeBtn : {}) }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
          <select
            aria-label="Month"
            value={selectedMonth}
            onChange={(e) => handleMonthChange(e.target.value)}
            style={selectStyle}
          >
            {[...range.months].reverse().map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </div>
      </div>

      {isXero ? (
        <InfoNote role="note" label="About these costs" style={{ fontSize: 12, padding: '8px 12px', borderRadius: 6, background: 'var(--theme-elevation-50)', border: '1px solid var(--theme-elevation-150)', color: 'var(--theme-elevation-600)', marginBottom: 16, lineHeight: 1.5 }}>
          Costs below come from Xero: bills and reconciled bank transactions, ex-GST, grouped by your Xero accounts. Bank feed lines appear once they&rsquo;re reconciled in Xero.
          To set a budget, give a Cost Category the same name as the Xero account. Switch to <strong>Imported CSV</strong> to see uploaded statements.
        </InfoNote>
      ) : data.xeroUnavailable && data.xeroUnavailable !== 'not_configured' ? (
        <InfoNote role="status" label="About the cost source" style={{ fontSize: 12, padding: '8px 12px', borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', marginBottom: 16 }}>
          Xero isn&rsquo;t available right now, so the costs below come from imported bank statements and manual entries.
        </InfoNote>
      ) : null}

      {/* Alerts */}
      {data.costAlerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {data.costAlerts.map((alert, i) => (
            <div key={i} style={{
              padding: '10px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              background: alert.severity === 'red' ? '#fef2f2' : alert.severity === 'orange' ? '#fffbeb' : '#eff6ff',
              color: alert.severity === 'red' ? '#991b1b' : alert.severity === 'orange' ? '#92400e' : '#1e40af',
              border: `1px solid ${alert.severity === 'red' ? '#fecaca' : alert.severity === 'orange' ? '#fde68a' : '#bfdbfe'}`,
            }}>
              {alert.type === 'over_budget' ? 'Over Budget' : alert.type === 'spike' ? 'Spike' : 'Review'}: {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {data.costHistory.length > 0 && <StackedBarChart history={data.costHistory} />}

      {/* Category Breakdown Cards */}
      {categoriesWithCosts.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
          {categoriesWithCosts.map((cb) => {
            const cat = cb.category
            const budget = cat.budget
            const pct = budget ? Math.min((cb.total / budget) * 100, 100) : 0
            return (
              <div key={String(cat.id)} style={{ background: 'var(--theme-elevation-50)', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{cat.name}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>${cb.total.toFixed(2)}</div>
                {!isXero && (
                  <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)' }}>{cb.count} transaction{cb.count !== 1 ? 's' : ''}</div>
                )}
                {budget != null && budget > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: 4, background: 'var(--theme-elevation-150)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: cb.total > budget ? '#ef4444' : cat.color, borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--theme-elevation-400)', marginTop: 2 }}>${cb.total.toFixed(0)} / ${budget.toFixed(0)} budget</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ padding: '16px 0', marginBottom: 24, textAlign: 'center', color: 'var(--theme-elevation-400)', fontSize: 13 }}>
          No costs recorded for {monthLabel(selectedMonth)}. Try another month in the Monthly breakdown menu above.
        </div>
      )}

      {/* Month totals */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
        <div style={{ background: 'var(--theme-elevation-50)', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 14, flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginBottom: 4 }}>This Month</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>${data.totalThisMonth.toFixed(2)}</div>
        </div>
        <div style={{ background: 'var(--theme-elevation-50)', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 14, flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginBottom: 4 }}>Last Month</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>${data.totalLastMonth.toFixed(2)}</div>
        </div>
      </div>

      {!isXero && (
        <>
      {/* Actions: CSV Upload + Manual Add */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <label style={btnStyle}>
          {uploading ? 'Uploading...' : 'Import CSV'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleUpload}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>
        <button type="button" onClick={() => setShowAddForm(!showAddForm)} style={btnStyle}>
          {showAddForm ? 'Cancel' : 'Add Cost'}
        </button>
      </div>

      {/* Upload result */}
      {uploadResult && (
        <div style={{ padding: '10px 14px', borderRadius: 6, fontSize: 13, background: uploadResult.error ? '#fef2f2' : '#f0fdf4', border: `1px solid ${uploadResult.error ? '#fecaca' : '#bbf7d0'}`, marginBottom: 16 }}>
          {uploadResult.error
            ? `Error: ${uploadResult.error}`
            : `Imported ${uploadResult.total} costs (${uploadResult.categorised} categorised, ${uploadResult.uncategorised} uncategorised) and ${uploadResult.receipts ?? 0} payments received. ${uploadResult.duplicatesSkipped} already-imported rows skipped.`}
        </div>
      )}

      {/* Bulk Setup Uploaders */}
      <BulkSetupUploader onComplete={() => fetchData(selectedMonth)} />

      {/* Manual add form */}
      {showAddForm && (
        <div style={{ background: 'var(--theme-elevation-50)', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10, marginBottom: 10 }}>
            <input type="date" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} placeholder="Date" style={inputStyle} />
            <input type="number" value={addForm.amount} onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })} placeholder="Amount (AUD)" step="0.01" style={inputStyle} />
            <input type="text" value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} placeholder="Description" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 10 }}>
            <CategorySelect
              categories={data.categories}
              value={addForm.categoryId}
              onChange={(val) => setAddForm({ ...addForm, categoryId: val })}
              onCategoryCreated={handleCategoryCreated}
              style={selectStyle}
            />
            <input type="text" value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} placeholder="Notes (optional)" style={inputStyle} />
          </div>
          <button type="button" onClick={handleAddCost} style={{ ...btnStyle, background: '#213843', color: '#fff' }}>Save</button>
        </div>
      )}

      {/* Uncategorised Queue */}
      {data.uncategorised.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Uncategorised Transactions ({data.uncategorised.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.uncategorised.map((tx) => (
              <UncategorisedRow key={String(tx.id)} tx={tx} categories={data.categories} onCategorise={handleCategorise} onCategoryCreated={handleCategoryCreated} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {/* Transaction Table */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Transactions</h3>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ ...selectStyle, fontSize: 12 }}>
            <option value="all">All categories</option>
            <option value="uncategorised">Uncategorised</option>
            {data.categories.map((cat) => (
              <option key={String(cat.id)} value={String(cat.id)}>{(cat as any).name}</option>
            ))}
          </select>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => handleDelete(Array.from(selectedIds))}
              disabled={deleting}
              style={{ ...btnStyle, fontSize: 12, padding: '5px 12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
            >
              {deleting ? 'Deleting...' : `Delete ${selectedIds.size} selected`}
            </button>
          )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--theme-elevation-150)' }}>
              <th style={{ ...thStyle, width: 36, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={sorted.length > 0 && selectedIds.size === sorted.length}
                  onChange={toggleSelectAll}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={thStyle} onClick={() => toggleSort('date')}>Date {sortField === 'date' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}</th>
              <th style={thStyle} onClick={() => toggleSort('description')}>Description {sortField === 'description' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}</th>
              <th style={thStyle}>Category</th>
              <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => toggleSort('amount')}>Amount {sortField === 'amount' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}</th>
              <th style={thStyle}>Source</th>
              <th style={{ ...thStyle, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '20px 0', textAlign: 'center', color: 'var(--theme-elevation-400)' }}>No transactions</td></tr>
            ) : sorted.map((tx) => {
              const cat = typeof tx.category === 'object' && tx.category ? tx.category as Category : null
              const isSelected = selectedIds.has(tx.id)
              return (
                <tr key={String(tx.id)} style={{ borderBottom: '1px solid var(--theme-elevation-100)', background: isSelected ? 'var(--theme-elevation-50)' : 'transparent' }}>
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => shiftSelect(tx.id, e)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={tdStyle}>{new Date(tx.date).toLocaleDateString('en-AU')}</td>
                  <td style={tdStyle}>{tx.description}</td>
                  <td style={tdStyle}>
                    {cat ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
                        {cat.name}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--theme-elevation-400)' }}>-</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>${tx.amount.toFixed(2)}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: tx.source === 'csv_import' ? '#e0f2fe' : '#f3e8ff', color: tx.source === 'csv_import' ? '#0369a1' : '#7c3aed' }}>
                      {tx.source === 'csv_import' ? 'CSV' : 'Manual'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => handleDelete([tx.id])}
                      disabled={deleting}
                      title="Delete transaction"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--theme-elevation-400)', fontSize: 14, padding: '2px 6px', borderRadius: 4 }}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#dc2626'; (e.target as HTMLElement).style.background = '#fef2f2' }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--theme-elevation-400)'; (e.target as HTMLElement).style.background = 'none' }}
                    >
                      {'\u2715'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  )
}

// ─── Uncategorised Row ────────────────────────────────────

function UncategorisedRow({
  tx,
  categories,
  onCategorise,
  onCategoryCreated,
  onDelete,
}: {
  tx: CostEntry
  categories: Category[]
  onCategorise: (txId: string | number, catId: string | number, saveRule: boolean) => void
  onCategoryCreated: (cat: Category) => void
  onDelete: (ids: (string | number)[]) => void
}) {
  const [selectedCat, setSelectedCat] = useState('')
  const [saveRule, setSaveRule] = useState(true)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--theme-elevation-50)', border: '1px solid var(--theme-elevation-150)', borderRadius: 6, fontSize: 13 }}>
      <span style={{ flex: '0 0 90px', color: 'var(--theme-elevation-400)' }}>{new Date(tx.date).toLocaleDateString('en-AU')}</span>
      <span style={{ flex: 1, fontWeight: 500 }}>{tx.description}</span>
      <span style={{ flex: '0 0 80px', textAlign: 'right', fontWeight: 600 }}>${tx.amount.toFixed(2)}</span>
      <div style={{ flex: '0 0 200px' }}>
        <CategorySelect
          categories={categories}
          value={selectedCat}
          onChange={setSelectedCat}
          onCategoryCreated={onCategoryCreated}
          placeholder="Select category..."
          style={{ ...selectStyle, width: '100%', fontSize: 12 }}
        />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer' }}>
        <input type="checkbox" checked={saveRule} onChange={(e) => setSaveRule(e.target.checked)} />
        Remember
      </label>
      <button
        type="button"
        disabled={!selectedCat}
        onClick={() => { if (selectedCat) onCategorise(tx.id, selectedCat, saveRule) }}
        style={{ ...btnStyle, fontSize: 11, padding: '4px 10px', opacity: selectedCat ? 1 : 0.4 }}
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => onDelete([tx.id])}
        title="Delete transaction"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--theme-elevation-400)', fontSize: 14, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#dc2626'; (e.target as HTMLElement).style.background = '#fef2f2' }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--theme-elevation-400)'; (e.target as HTMLElement).style.background = 'none' }}
      >
        {'\u2715'}
      </button>
    </div>
  )
}

// ─── Bulk Setup Uploader ──────────────────────────────────

function BulkSetupUploader({ onComplete }: { onComplete: () => void }) {
  const [open, setOpen] = useState(false)
  const [ruleUploading, setRuleUploading] = useState(false)
  const [ruleResult, setRuleResult] = useState<any>(null)
  const ruleRef = useRef<HTMLInputElement>(null)

  const handleRuleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setRuleUploading(true)
    setRuleResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/costs/upload-rules', { method: 'POST', body: fd })
      setRuleResult(await res.json())
      onComplete()
    } catch { setRuleResult({ error: 'Upload failed' }) }
    finally { setRuleUploading(false); if (ruleRef.current) ruleRef.current.value = '' }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button type="button" onClick={() => setOpen(!open)} style={{ ...btnStyle, fontSize: 12, padding: '6px 12px', color: 'var(--theme-elevation-500)' }}>
        {open ? 'Hide Bulk Import Rules' : 'Bulk Import Rules'}
        <span style={{ marginLeft: 6, fontSize: 10 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && (
        <div style={{ background: 'var(--theme-elevation-50)', border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 20, marginTop: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--theme-elevation-500)', marginBottom: 12, lineHeight: 1.5 }}>
            Upload a CSV to auto-categorise bank transactions. Each row maps a keyword to a category.
          </div>
          <div style={{
            display: 'block', background: 'var(--theme-elevation-100)', padding: '10px 12px',
            borderRadius: 4, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.8,
            whiteSpace: 'pre', overflowX: 'auto', marginBottom: 10,
          }}>
{`Pattern,Category
VERCEL,Infrastructure
RAILWAY,Infrastructure
OPENAI,AI/LLM
ANTHROPIC,AI/LLM
NAMECHEAP,Domains`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginBottom: 10, lineHeight: 1.5 }}>
            Category must match an existing category name exactly. Duplicates are skipped.
          </div>
          <label style={btnStyle}>
            {ruleUploading ? 'Uploading...' : 'Upload Rules CSV'}
            <input ref={ruleRef} type="file" accept=".csv" onChange={handleRuleUpload} disabled={ruleUploading} style={{ display: 'none' }} />
          </label>
          {ruleResult && (
            <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, marginTop: 8, background: ruleResult.error ? '#fef2f2' : '#f0fdf4', border: `1px solid ${ruleResult.error ? '#fecaca' : '#bbf7d0'}` }}>
              {ruleResult.error
                ? `Error: ${ruleResult.error}`
                : `${ruleResult.created} rules created, ${ruleResult.skipped} skipped${ruleResult.errors?.length ? `. Errors: ${ruleResult.errors.join('; ')}` : ''}`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Stacked Bar Chart ────────────────────────────────────

function StackedBarChart({ history }: { history: HistoryEntry[] }) {
  const maxTotal = Math.max(...history.map((h) => h.total), 1)
  const chartHeight = 180
  const barWidth = 100 / history.length

  // Collect all categories that have costs in ANY month for the legend
  const activeCatIds = new Set<string>()
  let hasUncategorised = false
  for (const entry of history) {
    for (const cat of entry.categories) {
      if (cat.total > 0) activeCatIds.add(String(cat.id))
    }
    if (entry.uncategorised > 0) hasUncategorised = true
  }
  const legendCategories = (history[0]?.categories || []).filter((c) => activeCatIds.has(String(c.id)))

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, marginTop: 0 }}>Spend by Month</h3>
      <div style={{ position: 'relative', height: chartHeight, display: 'flex', alignItems: 'flex-end' }}>
        {history.map((entry) => {
          const segments = [...entry.categories.filter((c) => c.total > 0)]
          if (entry.uncategorised > 0) segments.push({ id: 'uncat', name: 'Uncategorised', color: '#9CA3AF', total: entry.uncategorised })

          return (
            <div key={entry.month} style={{ width: `${barWidth}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
              {entry.total > 0 && (
                <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, color: 'var(--theme-elevation-500)' }}>
                  ${entry.total.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
                </div>
              )}
              <div style={{ width: '60%', display: 'flex', flexDirection: 'column' }}>
                {segments.map((seg) => {
                  const h = (seg.total / maxTotal) * (chartHeight - 40)
                  return (
                    <div
                      key={String(seg.id)}
                      title={`${seg.name}: $${seg.total.toFixed(2)}`}
                      style={{
                        height: Math.max(h, 2),
                        background: seg.color,
                        borderRadius: 0,
                        transition: 'height 0.3s',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex' }}>
        {history.map((entry) => (
          <div key={entry.month} style={{ width: `${barWidth}%`, textAlign: 'center', fontSize: 10, color: 'var(--theme-elevation-400)', marginTop: 4 }}>
            {entry.label}
          </div>
        ))}
      </div>
      {/* Legend — only categories with costs */}
      {(legendCategories.length > 0 || hasUncategorised) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10, fontSize: 11 }}>
          {legendCategories.map((cat) => (
            <span key={String(cat.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
              {cat.name}
            </span>
          ))}
          {hasUncategorised && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#9CA3AF' }} />
              Uncategorised
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────

const activeBtn: React.CSSProperties = { background: '#213843', color: '#fff', border: '1px solid #213843' }

const btnStyle: React.CSSProperties = {
  background: 'var(--theme-elevation-100)',
  border: '1px solid var(--theme-elevation-200)',
  padding: '8px 16px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  color: 'inherit',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--theme-input-bg, var(--theme-elevation-0))',
  border: '1px solid var(--theme-elevation-200)',
  padding: '8px 10px',
  borderRadius: 4,
  fontSize: 13,
  color: 'inherit',
}

const selectStyle: React.CSSProperties = {
  background: 'var(--theme-input-bg, var(--theme-elevation-0))',
  border: '1px solid var(--theme-elevation-200)',
  padding: '8px 10px',
  borderRadius: 4,
  fontSize: 13,
  color: 'inherit',
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--theme-elevation-400)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  cursor: 'pointer',
  userSelect: 'none',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
}

export default BusinessCostsPage
