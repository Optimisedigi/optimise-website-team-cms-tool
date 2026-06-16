'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState, useMemo } from 'react'

interface Keyword {
  keyword: string
  matchType: string
  flaggedForRemoval?: boolean
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
  const [search, setSearch] = useState('')
  const [filterMatch, setFilterMatch] = useState<string>('all')
  const [filterFlagged, setFilterFlagged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

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
    return result
  }, [keywords, search, filterMatch, filterFlagged])

  const flaggedCount = keywords.filter((kw) => kw.flaggedForRemoval).length

  const saveKeywords = async (updated: Keyword[]) => {
    if (!data?.id) return
    setSaving(true)
    try {
      const res = await fetch(`/api/negative-keyword-lists/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: updated.map((kw) => ({
            keyword: kw.keyword,
            matchType: kw.matchType,
            flaggedForRemoval: kw.flaggedForRemoval || false,
          })),
        }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const handleToggleFlag = (idx: number) => {
    const updated = [...keywords]
    updated[idx] = { ...updated[idx], flaggedForRemoval: !updated[idx].flaggedForRemoval }
    setKeywords(updated)
    saveKeywords(updated)
  }

  const handleChangeMatchType = (idx: number, matchType: string) => {
    const updated = [...keywords]
    updated[idx] = { ...updated[idx], matchType }
    setKeywords(updated)
    saveKeywords(updated)
  }

  const handleDelete = (idx: number) => {
    const updated = keywords.filter((_, i) => i !== idx)
    setKeywords(updated)
    saveKeywords(updated)
  }

  const handleBulkDelete = () => {
    const flaggedIdxs = new Set(keywords.map((kw, i) => kw.flaggedForRemoval ? i : -1).filter((i) => i >= 0))
    if (flaggedIdxs.size === 0) return
    if (!confirm(`Remove ${flaggedIdxs.size} flagged keyword${flaggedIdxs.size !== 1 ? 's' : ''}?`)) return
    const updated = keywords.filter((_, i) => !flaggedIdxs.has(i))
    setKeywords(updated)
    saveKeywords(updated)
  }

  const handleStartEdit = (idx: number) => {
    setEditingIdx(idx)
    setEditValue(keywords[idx].keyword)
  }

  const handleFinishEdit = (idx: number) => {
    if (editValue.trim() && editValue.trim() !== keywords[idx].keyword) {
      const updated = [...keywords]
      updated[idx] = { ...updated[idx], keyword: editValue.trim() }
      setKeywords(updated)
      saveKeywords(updated)
    }
    setEditingIdx(null)
  }

  if (!data?.id) return null

  return (
    <div style={{ marginBottom: 16 }}>
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

      <div
        style={{
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 8,
          overflow: 'hidden',
          maxHeight: 500,
          overflowY: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--theme-elevation-50)', borderBottom: '2px solid var(--theme-elevation-150)', position: 'sticky', top: 0, zIndex: 1 }}>
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
