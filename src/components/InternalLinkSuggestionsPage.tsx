'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────

interface Suggestion {
  id: string
  sourceUrl: string
  targetUrl: string
  anchorText: string
  contextSnippet?: string
  confidenceScore: number
  estimatedPageRankLift?: number | null
  clusterRelation?: string
  clusterName?: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt?: string
}

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected'

// ─── Helpers ──────────────────────────────────────────────

function stripDomain(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

function confidenceColor(score: number): { bg: string; text: string } {
  if (score >= 80) return { bg: '#dcfce7', text: '#166534' }
  if (score >= 60) return { bg: '#fef9c3', text: '#854d0e' }
  return { bg: '#fee2e2', text: '#991b1b' }
}

function relationLabel(rel?: string): string {
  if (!rel) return ''
  return rel.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Component ────────────────────────────────────────────

export default function InternalLinkSuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('pending')
  const [clusterFilter, setClusterFilter] = useState<string>('all')
  const [sortDesc, setSortDesc] = useState(true)
  const [acting, setActing] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  // ─── Fetch ────────────────────────────────────────────

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch(
        '/api/internal-link-suggestions?limit=500&sort=-confidenceScore'
      )
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setSuggestions(data.docs || [])
    } catch (err) {
      console.error('[InternalLinkSuggestions] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSuggestions()
  }, [fetchSuggestions])

  // ─── Actions ──────────────────────────────────────────

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleAction = async (ids: string[], action: 'approve' | 'reject') => {
    setActing(prev => new Set([...prev, ...ids]))

    // Optimistic update
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    setSuggestions(prev =>
      prev.map(s => (ids.includes(s.id) ? { ...s, status: newStatus as Suggestion['status'] } : s))
    )

    try {
      const res = await fetch('/api/internal-links/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionIds: ids, action }),
      })

      if (!res.ok) {
        // Revert on failure
        await fetchSuggestions()
        showToast(`Failed to ${action}`)
      } else {
        const data = await res.json()
        showToast(
          `${data.successCount} suggestion${data.successCount !== 1 ? 's' : ''} ${newStatus}`
        )
      }
    } catch {
      await fetchSuggestions()
      showToast(`Failed to ${action}`)
    } finally {
      setActing(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
    }
  }

  const handleBulkApprove = () => {
    const eligible = filtered.filter(
      s => s.status === 'pending' && s.confidenceScore >= 80
    )
    if (eligible.length === 0) return
    handleAction(
      eligible.map(s => s.id),
      'approve'
    )
  }

  // ─── Derived data ─────────────────────────────────────

  // Filter out self-links
  const selfLinks = suggestions.filter(s => s.sourceUrl === s.targetUrl)
  const validSuggestions = suggestions.filter(s => s.sourceUrl !== s.targetUrl)

  // Detect quality issues on each suggestion
  const getWarnings = (s: Suggestion): string[] => {
    const warnings: string[] = []
    const sourcePath = stripDomain(s.sourceUrl)
    const targetPath = stripDomain(s.targetUrl)

    // Homepage as source: avoid unless very high confidence
    if (sourcePath === '/') {
      warnings.push('Homepage source: avoid adding links from the homepage unless highly relevant')
    }

    // Anchor text looks like a heading (H1/H2) — typically a full page title
    // Heuristic: if anchor matches the target page slug closely, it's likely a heading
    const anchorLower = s.anchorText.toLowerCase().trim()
    const targetSlug = targetPath.split('/').filter(Boolean).pop() || ''
    const targetWords = targetSlug.replace(/-/g, ' ').toLowerCase()
    if (targetWords && anchorLower === targetWords) {
      warnings.push('Anchor matches page title exactly: likely an H1/H2 heading, not body copy')
    }
    // Also flag if anchor is very long (>60 chars) and title-case — likely a heading
    if (s.anchorText.length > 60 && /^[A-Z]/.test(s.anchorText) && !s.anchorText.includes('.')) {
      warnings.push('Anchor text is very long and title-case: may be a heading rather than body copy')
    }

    // Anchor text is the homepage tagline or generic
    const genericAnchors = [
      'click here', 'read more', 'learn more', 'find out more',
      'home', 'homepage',
    ]
    if (genericAnchors.includes(anchorLower)) {
      warnings.push('Generic anchor text: not useful for SEO')
    }

    // Source already likely links to target (same anchor as target page title from homepage)
    if (sourcePath === '/' && targetWords && anchorLower.includes(targetWords)) {
      warnings.push('Homepage likely already links to this page via its title')
    }

    // Duplicate: another suggestion with same source→target pair
    const dupes = validSuggestions.filter(
      o => o.id !== s.id && stripDomain(o.sourceUrl) === sourcePath && stripDomain(o.targetUrl) === targetPath
    )
    if (dupes.length > 0) {
      warnings.push('Duplicate: another suggestion links the same source to the same target')
    }

    return warnings
  }

  const counts = {
    pending: validSuggestions.filter(s => s.status === 'pending').length,
    approved: validSuggestions.filter(s => s.status === 'approved').length,
    rejected: validSuggestions.filter(s => s.status === 'rejected').length,
    total: validSuggestions.length,
  }

  const flaggedCount = validSuggestions.filter(s => s.status === 'pending' && getWarnings(s).length > 0).length

  const clusters = [...new Set(validSuggestions.map(s => s.clusterName).filter(Boolean))] as string[]

  let filtered = validSuggestions
  if (activeTab !== 'all') {
    filtered = filtered.filter(s => s.status === activeTab)
  }
  if (clusterFilter !== 'all') {
    filtered = filtered.filter(s => s.clusterName === clusterFilter)
  }
  filtered.sort((a, b) => {
    // Sort flagged items to the bottom within pending
    if (a.status === 'pending' && b.status === 'pending') {
      const aFlags = getWarnings(a).length
      const bFlags = getWarnings(b).length
      if (aFlags !== bFlags) return aFlags - bFlags // clean first
    }
    return sortDesc ? b.confidenceScore - a.confidenceScore : a.confidenceScore - b.confidenceScore
  })

  const bulkEligibleCount = filtered.filter(
    s => s.status === 'pending' && s.confidenceScore >= 80 && getWarnings(s).length === 0
  ).length

  // ─── Styles ───────────────────────────────────────────

  const card: React.CSSProperties = {
    background: 'var(--theme-elevation-50)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  }

  const badge = (bg: string, color: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    background: bg,
    color,
  })

  const btn = (variant: 'primary' | 'danger' | 'ghost'): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 6,
    border: variant === 'ghost' ? '1px solid var(--theme-elevation-250)' : 'none',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: 13,
    background:
      variant === 'primary'
        ? 'var(--theme-success-500, #22c55e)'
        : variant === 'danger'
          ? 'var(--theme-error-500, #ef4444)'
          : 'transparent',
    color: variant === 'ghost' ? 'var(--theme-text)' : '#fff',
  })

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    fontSize: 13,
    background: active ? 'var(--theme-elevation-150)' : 'transparent',
    color: 'var(--theme-text)',
  })

  // ─── Render ───────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--theme-text)' }}>
        Loading suggestions...
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 0', color: 'var(--theme-text)' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Internal Link Suggestions</h1>
        {bulkEligibleCount > 0 && (
          <button
            style={btn('primary')}
            onClick={handleBulkApprove}
          >
            Bulk Approve ≥80 ({bulkEligibleCount})
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <span style={badge('#dbeafe', '#1e40af')}>{counts.pending} pending</span>
        <span style={badge('#dcfce7', '#166534')}>{counts.approved} approved</span>
        <span style={badge('#fee2e2', '#991b1b')}>{counts.rejected} rejected</span>
        {flaggedCount > 0 && (
          <span style={badge('#fef3c7', '#92400e')}>{flaggedCount} flagged</span>
        )}
        <span style={badge('var(--theme-elevation-150)', 'var(--theme-text)')}>
          {counts.total} total
        </span>
      </div>

      {/* Self-link notice */}
      {selfLinks.length > 0 && (
        <div
          style={{
            background: '#fef9c3',
            color: '#854d0e',
            padding: '8px 14px',
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {selfLinks.length} self-link suggestion{selfLinks.length !== 1 ? 's' : ''} filtered out
          (source = target). This bug has been fixed for future crawls.
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        {(['all', 'pending', 'approved', 'rejected'] as FilterTab[]).map(tab => (
          <button
            key={tab}
            style={tabStyle(activeTab === tab)}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab !== 'all' ? ` (${counts[tab]})` : ''}
          </button>
        ))}

        <select
          value={clusterFilter}
          onChange={e => setClusterFilter(e.target.value)}
          style={{
            marginLeft: 'auto',
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--theme-elevation-250)',
            background: 'var(--theme-elevation-50)',
            color: 'var(--theme-text)',
            fontSize: 13,
          }}
        >
          <option value="all">All Clusters</option>
          {clusters.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <button
          style={{
            ...tabStyle(false),
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          onClick={() => setSortDesc(d => !d)}
          title="Toggle confidence sort"
        >
          Confidence {sortDesc ? '↓' : '↑'}
        </button>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--theme-elevation-450)',
          }}
        >
          No suggestions match this filter.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
            gap: 12,
          }}
        >
          {filtered.map(s => {
            const cc = confidenceColor(s.confidenceScore)
            const isActing = acting.has(s.id)
            const warnings = getWarnings(s)

            return (
              <div key={s.id} style={{ ...card, opacity: isActing ? 0.6 : 1, borderColor: warnings.length > 0 && s.status === 'pending' ? '#fbbf24' : 'var(--theme-elevation-150)' }}>
                {/* From / To with labels */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 12, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ color: 'var(--theme-elevation-400)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 55, flexShrink: 0 }}>Add to</span>
                    <a
                      href={s.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-elevation-600)', wordBreak: 'break-all', textDecoration: 'none' }}
                      title={s.sourceUrl}
                    >
                      {stripDomain(s.sourceUrl)}
                    </a>
                  </div>
                  <div style={{ fontSize: 12, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ color: '#2563eb', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 55, flexShrink: 0 }}>Links to</span>
                    <a
                      href={s.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', wordBreak: 'break-all', textDecoration: 'none' }}
                      title={s.targetUrl}
                    >
                      {stripDomain(s.targetUrl)}
                    </a>
                  </div>
                </div>

                {/* Meta row */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={badge(cc.bg, cc.text)}>{s.confidenceScore}</span>

                  {s.anchorText && (
                    <span
                      style={{
                        fontSize: 13,
                        color: 'var(--theme-elevation-500)',
                      }}
                    >
                      anchor: &ldquo;{s.anchorText}&rdquo;
                    </span>
                  )}

                  {s.clusterRelation && (
                    <span style={badge('var(--theme-elevation-100)', 'var(--theme-text)')}>
                      {relationLabel(s.clusterRelation)}
                    </span>
                  )}

                  {s.clusterName && (
                    <span style={badge('#e0e7ff', '#3730a3')}>{s.clusterName}</span>
                  )}

                  {s.status !== 'pending' && (
                    <span
                      style={badge(
                        s.status === 'approved' ? '#dcfce7' : '#fee2e2',
                        s.status === 'approved' ? '#166534' : '#991b1b'
                      )}
                    >
                      {s.status}
                    </span>
                  )}
                </div>

                {/* Context */}
                {s.contextSnippet && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--theme-elevation-500)',
                      lineHeight: 1.4,
                    }}
                  >
                    {s.contextSnippet}
                  </div>
                )}

                {/* Warnings */}
                {warnings.length > 0 && s.status === 'pending' && (
                  <div style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 12,
                    color: '#92400e',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}>
                    {warnings.map((w, i) => (
                      <div key={i}>&#9888; {w}</div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                {s.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <button
                      style={btn('primary')}
                      disabled={isActing}
                      onClick={() => handleAction([s.id], 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      style={btn('danger')}
                      disabled={isActing}
                      onClick={() => handleAction([s.id], 'reject')}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: 'var(--theme-elevation-800, #1e293b)',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,.25)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
