'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * In-chat "?" pill that opens a popover listing every tool the agent has
 * access to, grouped by category. Data source: GET /api/agent-tool-catalog
 * which derives the list from the live tool registry — descriptions and
 * names never drift from what the LLM actually sees.
 *
 * Styling matches the surrounding header bar in OptiMateChatCore (small
 * rounded pills, grey outline, no framework dependency).
 */

interface CatalogTool {
  name: string
  label: string
  description: string
  isPropose: boolean
}

interface CatalogCategory {
  key: string
  label: string
  blurb: string
  color: string
  order: number
  tools: CatalogTool[]
}

interface GoalCatalogItem {
  key: string
  label: string
  status: 'available' | 'paused' | 'limited'
  description: string
  caveat: string
}

interface CatalogResponse {
  agent: string
  toolCount: number
  goalCount?: number
  categories: CatalogCategory[]
  goals?: GoalCatalogItem[]
}

interface OptiMateToolsHelpProps {
  /** Defaults to 'optimate-google-ads'. */
  agent?: string
  /** Compact = used when the chat is in the docked side panel. */
  compact?: boolean
}

function plainSentence(text: string): string {
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0]?.trim()
  return firstSentence || text.trim()
}

const OptiMateToolsHelp = ({ agent = 'optimate-google-ads', compact = false }: OptiMateToolsHelpProps) => {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<CatalogResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Fetch lazily on first open. The catalog is static for the session
  // (tools don't reload between renders) so we cache the response.
  const load = useCallback(async () => {
    if (data || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/agent-tool-catalog?agent=${encodeURIComponent(agent)}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Catalog load failed (${res.status})`)
      const json = (await res.json()) as CatalogResponse
      setData(json)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [agent, data, loading])

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!open) load()
          setOpen((v) => !v)
        }}
        title="What goals and tools can OptiMate use?"
        aria-label="Goal and tool capabilities"
        style={{
          height: 22,
          padding: compact ? '0 7px' : '0 9px',
          fontSize: 11,
          lineHeight: 1,
          background: open ? '#e0e7ff' : '#f3f4f6',
          border: '1px solid #e5e7eb',
          borderRadius: 999,
          cursor: 'pointer',
          color: '#374151',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
        }}
      >
        <span aria-hidden="true">⚑</span>
        <span>{compact ? 'Goals' : 'Goals & tools'}</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: compact ? 320 : 420,
            maxHeight: 480,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.14)',
            zIndex: 60,
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
              OptiMate capabilities
            </div>
            {data && (
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                {data.toolCount} tool{data.toolCount === 1 ? '' : 's'} · {data.goalCount ?? data.goals?.length ?? 0} goal{(data.goalCount ?? data.goals?.length ?? 0) === 1 ? '' : 's'}
              </div>
            )}
          </div>

          {loading && (
            <div style={{ padding: 8, fontSize: 12, color: '#6b7280' }}>Loading…</div>
          )}
          {error && (
            <div style={{ padding: 8, fontSize: 12, color: '#b91c1c' }}>{error}</div>
          )}

          {data && data.goals && data.goals.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#4f46e5',
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937' }}>Registered goal agents</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>· {data.goals.length}</div>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {data.goals.map((goal) => {
                  const tone = goal.status === 'available'
                    ? { bg: '#dcfce7', color: '#166534', label: 'AVAILABLE' }
                    : goal.status === 'limited'
                      ? { bg: '#fef3c7', color: '#92400e', label: 'LIMITED' }
                      : { bg: '#fee2e2', color: '#991b1b', label: 'PAUSED' }
                  return (
                    <li
                      key={goal.key}
                      style={{
                        padding: '7px 8px',
                        borderRadius: 6,
                        background: '#f8fafc',
                        marginBottom: 4,
                        border: '1px solid #eef2ff',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{goal.label}</span>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: tone.color,
                            background: tone.bg,
                            padding: '1px 5px',
                            borderRadius: 4,
                            letterSpacing: 0.3,
                          }}
                        >
                          {tone.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.45 }}>
                        {plainSentence(goal.description)}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {data && data.categories.map((cat) => (
            <div key={cat.key + cat.label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: cat.color,
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937' }}>{cat.label}</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>·  {cat.tools.length}</div>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {cat.tools.map((t) => (
                  <li
                    key={t.name}
                    style={{
                      display: 'flex',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: t.isPropose ? '#fef3c7' : '#f9fafb',
                      marginBottom: 4,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{t.label}</span>
                        {t.isPropose && (
                          <span
                            title="Queues a human-approval row, not applied directly"
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: '#92400e',
                              background: '#fde68a',
                              padding: '1px 5px',
                              borderRadius: 4,
                              letterSpacing: 0.3,
                            }}
                          >
                            PROPOSE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.45 }}>
                        {plainSentence(t.description)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 8, marginTop: 4, fontSize: 10, color: '#9ca3af', lineHeight: 1.5 }}>
            Approval-gated capabilities queue a review item before anything changes live.
          </div>
        </div>
      )}
    </div>
  )
}

export default OptiMateToolsHelp
