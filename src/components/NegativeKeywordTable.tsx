'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useMemo, useRef, useState } from 'react'

interface Keyword {
  keyword: string
  matchType: string
  flaggedForRemoval?: boolean
  negatedAt?: string
  id?: string
}

const MATCH_OPTIONS = [
  { value: 'exact', label: 'Exact' },
  { value: 'phrase', label: 'Phrase' },
  { value: 'broad', label: 'Broad' },
]

const MATCH_COLORS: Record<string, { bg: string; color: string }> = {
  exact: { bg: '#dcfce7', color: '#166534' },
  phrase: { bg: '#dbeafe', color: '#1e40af' },
  broad: { bg: '#fef3c7', color: '#92400e' },
}

export default function NegativeKeywordTable() {
  const { initialData } = useDocumentInfo()
  const data = initialData as any

  const [keywords, setKeywords] = useState<Keyword[]>(data?.keywords || [])
  const [listUpdatedAt, setListUpdatedAt] = useState(String(data?.updatedAt || ''))
  const [search, setSearch] = useState('')
  const [filterMatch, setFilterMatch] = useState<string>('all')
  const [filterFlagged, setFilterFlagged] = useState(false)
  const [saving, setSaving] = useState(false)
  const mutationInFlight = useRef(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const filtered = useMemo(() => {
    let result = keywords.map((kw, i) => ({ ...kw, _idx: i }))
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((kw) => kw.keyword.toLowerCase().includes(q))
    }
    if (filterMatch !== 'all') {
      result = result.filter((kw) => kw.matchType === filterMatch)
    }
    if (filterFlagged) {
      result = result.filter((kw) => kw.flaggedForRemoval)
    }
    // Most recently added first. Sort by negatedAt (the add date) descending;
    // fall back to insertion order (newest appended) when dates are missing or
    // identical — keywords are only ever appended, so a higher index is newer.
    result = result.sort((a, b) => {
      const ta = a.negatedAt ? Date.parse(a.negatedAt) : NaN
      const tb = b.negatedAt ? Date.parse(b.negatedAt) : NaN
      if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return tb - ta
      return b._idx - a._idx
    })
    return result
  }, [keywords, search, filterMatch, filterFlagged])

  const flaggedCount = keywords.filter((kw) => kw.flaggedForRemoval).length

  const mutateKeywords = async (mutation: Record<string, unknown>) => {
    if (!data?.id || mutationInFlight.current) return false
    mutationInFlight.current = true
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/negative-keyword-lists/${data.id}/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...mutation,
          expectedUpdatedAt: listUpdatedAt,
          expectedKeywordCount: keywords.length,
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409 && Array.isArray(result.keywords)) {
          setKeywords(result.keywords)
          setListUpdatedAt(String(result.updatedAt || ''))
        }
        setSaveError(result.error || `Save failed (${res.status})`)
        return false
      }
      setKeywords(Array.isArray(result.keywords) ? result.keywords : keywords)
      setListUpdatedAt(String(result.updatedAt || ''))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      return true
    } catch {
      setSaveError('Network error — no changes were saved')
      return false
    } finally {
      mutationInFlight.current = false
      setSaving(false)
    }
  }

  const handleToggleFlag = async (idx: number) => {
    const keyword = keywords[idx]
    if (keyword?.id === undefined) return setSaveError('Reload this list before editing')
    await mutateKeywords({
      operation: 'update',
      keywordId: keyword.id,
      patch: { flaggedForRemoval: !keyword.flaggedForRemoval },
    })
  }

  const handleChangeMatchType = async (idx: number, matchType: string) => {
    const keyword = keywords[idx]
    if (keyword?.id === undefined) return setSaveError('Reload this list before editing')
    await mutateKeywords({ operation: 'update', keywordId: keyword.id, patch: { matchType } })
  }

  const handleDelete = async (idx: number) => {
    const keyword = keywords[idx]
    if (keyword?.id === undefined) return setSaveError('Reload this list before deleting')
    await mutateKeywords({ operation: 'delete', keywordIds: [keyword.id] })
  }

  const handleBulkDelete = async () => {
    const flagged = keywords.filter((kw) => kw.flaggedForRemoval)
    if (flagged.length === 0) return
    if (flagged.some((keyword) => keyword.id === undefined)) {
      setSaveError('Reload this list before deleting flagged keywords')
      return
    }
    if (!confirm(`Remove ${flagged.length} flagged keyword${flagged.length !== 1 ? 's' : ''}?`)) return
    await mutateKeywords({ operation: 'delete', keywordIds: flagged.map((keyword) => keyword.id) })
  }

  const handleStartEdit = (idx: number) => {
    setEditingIdx(idx)
    setEditValue(keywords[idx].keyword)
  }

  const handleFinishEdit = async (idx: number) => {
    const keyword = keywords[idx]
    if (editValue.trim() && editValue.trim() !== keyword.keyword) {
      if (keyword?.id === undefined) {
        setSaveError('Reload this list before editing')
      } else {
        await mutateKeywords({ operation: 'update', keywordId: keyword.id, patch: { keyword: editValue.trim() } })
      }
    }
    setEditingIdx(null)
  }

  if (!mounted || !data?.id) return null

  return (
    <div className="negative-keyword-admin-panel" style={{
      position: 'relative',
      zIndex: 1,
      isolation: 'isolate',
      marginBottom: 16,
      color: '#1f2937',
      opacity: 1,
      filter: 'none',
      WebkitFilter: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
          Keywords ({keywords.length})
        </h3>
        <input
          type="text"
          placeholder="Search keywords..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '5px 10px',
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: 4,
            fontSize: 12,
            background: 'var(--theme-input-bg, var(--theme-elevation-0))',
            color: 'inherit',
            width: 180,
          }}
        />
        <select
          value={filterMatch}
          onChange={(e) => setFilterMatch(e.target.value)}
          style={{
            padding: '5px 8px',
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: 4,
            fontSize: 12,
            background: 'var(--theme-input-bg, var(--theme-elevation-0))',
            color: 'inherit',
          }}
        >
          <option value="all">All types</option>
          <option value="exact">Exact</option>
          <option value="phrase">Phrase</option>
          <option value="broad">Broad</option>
        </select>
        {flaggedCount > 0 && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={filterFlagged} onChange={(e) => setFilterFlagged(e.target.checked)} />
              Flagged only ({flaggedCount})
            </label>
            <button
              type="button"
              onClick={handleBulkDelete}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#dc2626',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Remove {flaggedCount} flagged
            </button>
          </>
        )}
        {saving && <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)' }}>Saving...</span>}
        {saved && <span style={{ fontSize: 12, color: '#16a34a' }}>Saved</span>}
      </div>
      {saveError && (
        <div role="alert" style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 4, background: '#fef2f2', color: '#b91c1c', fontSize: 12 }}>
          {saveError}
        </div>
      )}

      <div
        style={{
          border: '1px solid #d7dce3',
          borderRadius: 8,
          overflow: 'hidden',
          maxHeight: 500,
          overflowY: 'auto',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: '#1f2937' }}>
          <thead>
            <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #d7dce3', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={{ ...thStyle, width: '55%' }}>Keyword</th>
              <th style={{ ...thStyle, width: '20%' }}>Match Type</th>
              <th style={{ ...thStyle, width: '12%', textAlign: 'center' }}>Flagged</th>
              <th style={{ ...thStyle, width: '13%', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--theme-elevation-400)' }}>
                  {keywords.length === 0 ? 'No keywords yet. Use Bulk Add above to add keywords.' : 'No keywords match the current filter.'}
                </td>
              </tr>
            ) : filtered.map((kw) => {
              const mc = MATCH_COLORS[kw.matchType] || MATCH_COLORS.exact
              const isEditing = editingIdx === kw._idx
              return (
                <tr
                  key={kw._idx}
                  style={{
                    borderBottom: '1px solid var(--theme-elevation-100)',
                    background: kw.flaggedForRemoval ? 'var(--theme-error-50, #fef2f2)' : 'transparent',
                  }}
                >
                  <td style={tdStyle}>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleFinishEdit(kw._idx)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleFinishEdit(kw._idx); if (e.key === 'Escape') setEditingIdx(null) }}
                        autoFocus
                        style={{
                          width: '100%',
                          padding: '3px 6px',
                          border: '1px solid var(--theme-elevation-300)',
                          borderRadius: 3,
                          fontSize: 13,
                          background: 'var(--theme-input-bg, var(--theme-elevation-0))',
                          color: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <span
                        onClick={() => handleStartEdit(kw._idx)}
                        style={{
                          cursor: 'text',
                          textDecoration: kw.flaggedForRemoval ? 'line-through' : 'none',
                          color: kw.flaggedForRemoval ? 'var(--theme-elevation-400)' : 'inherit',
                        }}
                        title="Click to edit"
                      >
                        {kw.keyword}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <select
                      value={kw.matchType}
                      onChange={(e) => handleChangeMatchType(kw._idx, e.target.value)}
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: 'none',
                        fontSize: 11,
                        fontWeight: 600,
                        background: mc.bg,
                        color: mc.color,
                        cursor: 'pointer',
                      }}
                    >
                      {MATCH_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!kw.flaggedForRemoval}
                      onChange={() => handleToggleFlag(kw._idx)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleDelete(kw._idx)}
                      title="Delete keyword"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--theme-elevation-400)',
                        fontSize: 14,
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
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

      {filtered.length !== keywords.length && keywords.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 4 }}>
          Showing {filtered.length} of {keywords.length} keywords
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--theme-elevation-500)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  userSelect: 'none',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
}
