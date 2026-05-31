'use client'

import type { CSSProperties } from 'react'

/**
 * Presentational renderer for a Post-Migration SEO Review result. Shared by the
 * SEO hub panel (live run) and the collection's Results field (stored doc), so
 * the typing here is intentionally permissive about field origin.
 */

export interface ChecklistItem {
  id: string
  phase: 'redirects' | 'indexing' | 'performance' | 'technical' | 'process'
  title: string
  status: 'pass' | 'warn' | 'fail' | 'advisory' | 'not-applicable'
  evidence: string
  recommendation: string
  details?: string[]
}

export interface MigrationAction {
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  detail: string
}

export interface MigrationResult {
  siteUrl?: string
  cutoverDate?: string
  isDomainMove?: boolean
  overallScore?: number
  scoresByPhase?: Record<string, number>
  checklist?: ChecklistItem[]
  actions?: MigrationAction[]
  performance?: {
    before?: { clicks: number; impressions: number; position: number }
    after?: { clicks: number; impressions: number; position: number }
    clicksChangePct?: number | null
    positionDelta?: number
    windowDays?: number
  } | null
  runAt?: string
}

const STATUS_STYLE: Record<ChecklistItem['status'], { bg: string; fg: string; label: string }> = {
  pass: { bg: '#dcfce7', fg: '#166534', label: 'Pass' },
  warn: { bg: '#fef3c7', fg: '#92400e', label: 'Warn' },
  fail: { bg: '#fee2e2', fg: '#991b1b', label: 'Fail' },
  advisory: { bg: '#e0f2fe', fg: '#075985', label: 'Advisory' },
  'not-applicable': { bg: '#f3f4f6', fg: '#6b7280', label: 'N/A' },
}

const PRIORITY_STYLE: Record<MigrationAction['priority'], { bg: string; fg: string }> = {
  critical: { bg: '#fee2e2', fg: '#991b1b' },
  high: { bg: '#ffedd5', fg: '#9a3412' },
  medium: { bg: '#fef3c7', fg: '#92400e' },
  low: { bg: '#f3f4f6', fg: '#6b7280' },
}

const PHASE_LABELS: Record<string, string> = {
  redirects: 'Redirects',
  indexing: 'Indexing & Crawl',
  performance: 'Performance',
  technical: 'Technical & Content',
  process: 'Process',
}

const scoreColor = (s: number) =>
  s >= 80 ? { bg: '#dcfce7', fg: '#166534' } : s >= 60 ? { bg: '#fef3c7', fg: '#92400e' } : { bg: '#fee2e2', fg: '#991b1b' }

const SeoMigrationCheckView = ({ result }: { result: MigrationResult | null }) => {
  if (!result || (!result.checklist && result.overallScore == null)) {
    return <div style={{ color: '#6b7280', padding: 16 }}>No review data yet.</div>
  }

  const checklist = result.checklist ?? []
  const phases = ['redirects', 'indexing', 'performance', 'technical', 'process']
  const score = result.overallScore ?? 0
  const sc = scoreColor(score)
  const perf = result.performance

  return (
    <div>
      {/* Header score + summary */}
      <div className="od-box" style={{ marginBottom: 16, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              background: sc.bg,
              color: sc.fg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            {score}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Migration health</div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 600 }}>
            {result.siteUrl} {result.cutoverDate ? `· cutover ${result.cutoverDate}` : ''}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            {result.isDomainMove ? 'Domain move' : 'Same-domain migration'}
            {perf?.clicksChangePct != null && (
              <>
                {' · '}clicks {perf.clicksChangePct >= 0 ? 'up' : 'down'}{' '}
                <strong style={{ color: perf.clicksChangePct >= 0 ? '#15803d' : '#b91c1c' }}>
                  {Math.abs(perf.clicksChangePct)}%
                </strong>{' '}
                vs pre-cutover{perf.windowDays ? ` (${perf.windowDays}d windows)` : ''}
              </>
            )}
          </div>
        </div>
        {/* Phase scores */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {phases.map((p) => {
            const v = result.scoresByPhase?.[p] ?? 0
            const c = scoreColor(v)
            return (
              <div key={p} style={{ textAlign: 'center', minWidth: 76 }}>
                <div style={{ padding: '4px 8px', borderRadius: 6, background: c.bg, color: c.fg, fontWeight: 700, fontSize: 14 }}>
                  {v}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{PHASE_LABELS[p]}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Prioritised actions */}
      {result.actions && result.actions.length > 0 && (
        <div className="od-box" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>Prioritised actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.actions.map((a, i) => {
              const ps = PRIORITY_STYLE[a.priority]
              return (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ ...badge, background: ps.bg, color: ps.fg, textTransform: 'uppercase' }}>{a.priority}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{a.title}</div>
                    {a.detail && <div style={{ fontSize: 12, color: '#64748b', wordBreak: 'break-word' }}>{a.detail}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Checklist grouped by phase */}
      {phases.map((phase) => {
        const items = checklist.filter((i) => i.phase === phase)
        if (items.length === 0) return null
        return (
          <div className="od-box" style={{ marginBottom: 12 }} key={phase}>
            <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>{PHASE_LABELS[phase]}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((item) => {
                const ss = STATUS_STYLE[item.status]
                return (
                  <div key={item.id} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ ...badge, background: ss.bg, color: ss.fg }}>{ss.label}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{item.evidence}</div>
                        {item.recommendation && (
                          <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>→ {item.recommendation}</div>
                        )}
                        {item.details && item.details.length > 0 && (
                          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11, color: '#64748b' }}>
                            {item.details.slice(0, 12).map((d, di) => (
                              <li key={di} style={{ wordBreak: 'break-word' }}>{d}</li>
                            ))}
                            {item.details.length > 12 && <li>…and {item.details.length - 12} more</li>}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const badge: CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 4,
  fontWeight: 600,
  fontSize: 11,
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

export default SeoMigrationCheckView
