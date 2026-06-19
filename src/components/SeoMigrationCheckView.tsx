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
    impressionsChangePct?: number | null
    positionDelta?: number
    windowDays?: number
  } | null
  trackingSnapshots?: Array<{ date: string; daysSinceCutover: number; clicks: number; impressions: number; ctr: number; position: number; brandClicks?: number | null; brandImpressions?: number | null; genericClicks?: number | null; genericImpressions?: number | null; dataComplete?: boolean }>
  trackingFlags?: Array<{ severity: 'critical' | 'warning' | 'advisory' | 'healthy'; phase: string; metric: string; title: string; description: string; recommendation?: string }>
  trackingIssueReport?: Record<string, string[]>
  trackingStatus?: string
  lastTrackingRunAt?: string
  lastEmailSentAt?: string
  lastEmailMilestoneDay?: number
  nextEmailMilestoneDay?: number
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

const fmt = (value: number | null | undefined) => value == null ? '-' : Math.round(value).toLocaleString()

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ordinal(day: number): string {
  const rem100 = day % 100
  if (rem100 >= 11 && rem100 <= 13) return `${day}th`
  switch (day % 10) {
    case 1: return `${day}st`
    case 2: return `${day}nd`
    case 3: return `${day}rd`
    default: return `${day}th`
  }
}

// "2026-05-11" -> "11th May"
function formatDayLabel(iso: string): string {
  const day = Number(iso.slice(8, 10))
  const month = Number(iso.slice(5, 7))
  if (!day || !month) return iso
  return `${ordinal(day)} ${MONTHS_SHORT[month - 1]}`
}

function TrackingReport({ result }: { result: MigrationResult }) {
  const points = result.trackingSnapshots ?? []
  const latest = points[points.length - 1]
  const maxClicks = Math.max(1, ...points.map((p) => p.clicks))
  const maxImpressions = Math.max(1, ...points.map((p) => p.impressions))
  const w = 760
  const h = 250
  const pad = 34
  const axisBottom = 56 // extra room for vertical date labels
  const plotH = h - pad - axisBottom
  const x = (i: number) => pad + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (w - pad * 2))
  const yClicks = (v: number) => pad + plotH - (v / maxClicks) * plotH
  const yImpressions = (v: number) => pad + plotH - (v / maxImpressions) * plotH
  // Render at most ~14 x-axis labels so they don't overlap.
  const labelStep = Math.max(1, Math.ceil(points.length / 14))
  const clicksLine = points.map((p, i) => `${x(i)},${yClicks(p.clicks)}`).join(' ')
  const impressionsLine = points.map((p, i) => `${x(i)},${yImpressions(p.impressions)}`).join(' ')
  const migrationIndex = Math.max(0, points.findIndex((p) => p.daysSinceCutover === 1))
  const migrationX = x(migrationIndex)
  const totalBrand = points.filter((p) => p.daysSinceCutover >= 1).reduce((s, p) => s + (p.brandClicks ?? 0), 0)
  const totalGeneric = points.filter((p) => p.daysSinceCutover >= 1).reduce((s, p) => s + (p.genericClicks ?? 0), 0)
  const splitTotal = Math.max(1, totalBrand + totalGeneric)
  const maxSplitClicks = Math.max(1, ...points.flatMap((p) => [p.brandClicks ?? 0, p.genericClicks ?? 0]))
  const maxSplitImpressions = Math.max(1, ...points.flatMap((p) => [p.brandImpressions ?? 0, p.genericImpressions ?? 0]))
  const issueReport = result.trackingIssueReport ?? {}
  return (
    <div className="od-box" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: '#0f172a' }}>Post-migration GSC tracking</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>Status: {result.trackingStatus || 'active'} · next email day {result.nextEmailMilestoneDay ?? '—'}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
        {[
          ['Latest date', latest?.date ? formatDayLabel(latest.date) : 'Pending'],
          ['Clicks', fmt(latest?.clicks)],
          ['Impressions', fmt(latest?.impressions)],
          ['CTR', latest?.ctr != null ? `${latest.ctr}%` : '-'],
          ['Avg position', latest?.position ?? '-'],
        ].map(([label, value]) => <div key={label} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#f8fafc' }}><div style={{ fontSize: 11, color: '#64748b' }}>{label}</div><div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{value}</div></div>)}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 300, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }} role="img" aria-label="Post-migration clicks and impressions chart">
        {[0, .25, .5, .75, 1].map((t) => <line key={t} x1={pad} x2={w - pad} y1={pad + t * plotH} y2={pad + t * plotH} stroke="#e2e8f0" />)}
        <rect x={migrationX} y={18} width={w - pad - migrationX} height={pad + plotH - 18} fill="#fee2e2" opacity="0.16" />
        <line x1={migrationX} x2={migrationX} y1={18} y2={pad + plotH} stroke="#991b1b" strokeDasharray="6 5" strokeWidth={3} />
        <text x={migrationX + 8} y={24} fontSize={12} fill="#991b1b" fontWeight={700}>Migration date</text>
        <polyline points={clicksLine} fill="none" stroke="#2563eb" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={impressionsLine} fill="none" stroke="#8b5cf6" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (i % labelStep === 0 || i === points.length - 1)
          ? <text key={p.date} x={x(i)} y={pad + plotH + 8} fontSize={9} fill="#94a3b8" textAnchor="end" transform={`rotate(-90 ${x(i)} ${pad + plotH + 8})`}>{formatDayLabel(p.date)}</text>
          : null)}
      </svg>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: '#475569' }}>
        <span><span style={{ ...dot, background: '#2563eb' }} /> Clicks</span>
        <span><span style={{ ...dot, background: '#8b5cf6' }} /> Impressions</span>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>Brand vs generic clicks</div>
        <div style={{ height: 18, display: 'flex', borderRadius: 999, overflow: 'hidden', background: '#e2e8f0' }}>
          <div style={{ width: `${(totalBrand / splitTotal) * 100}%`, background: '#0ea5e9' }} />
          <div style={{ width: `${(totalGeneric / splitTotal) * 100}%`, background: '#22c55e' }} />
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Post-migration total: Brand {fmt(totalBrand)} · Generic {fmt(totalGeneric)}</div>
        <div style={{ marginTop: 10, overflowX: 'auto', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, color: '#475569' }}>
            <thead>
              <tr><th align="left">Date</th><th align="left">Brand clicks</th><th align="left">Brand impressions</th><th align="left">Generic clicks</th><th align="left">Generic impressions</th><th align="right">Impr. share</th></tr>
            </thead>
            <tbody>
              {points.map((p) => {
                const brandClicks = p.brandClicks ?? 0
                const genericClicks = p.genericClicks ?? 0
                const brandImpressions = p.brandImpressions ?? 0
                const genericImpressions = p.genericImpressions ?? 0
                const totalImpressions = Math.max(1, brandImpressions + genericImpressions)
                const metricBar = (value: number, max: number, color: string) => <div style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}><span style={{ minWidth: 30, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span><span style={{ display: 'inline-block', height: 7, width: `${Math.max(4, Math.min(100, (value / max) * 100))}%`, maxWidth: 70, background: color, borderRadius: 999 }} /></div>
                return <tr key={p.date}>
                  <td style={{ padding: '4px 6px 4px 0', whiteSpace: 'nowrap' }}>{formatDayLabel(p.date)}{p.daysSinceCutover === 1 ? ' · migration' : p.daysSinceCutover < 1 ? ` · ${p.daysSinceCutover}d` : ` · +${p.daysSinceCutover - 1}d`}</td>
                  <td style={{ padding: '4px 6px' }}>{metricBar(brandClicks, maxSplitClicks, '#0ea5e9')}</td>
                  <td style={{ padding: '4px 6px' }}>{metricBar(brandImpressions, maxSplitImpressions, '#38bdf8')}</td>
                  <td style={{ padding: '4px 6px' }}>{metricBar(genericClicks, maxSplitClicks, '#22c55e')}</td>
                  <td style={{ padding: '4px 6px' }}>{metricBar(genericImpressions, maxSplitImpressions, '#86efac')}</td>
                  <td style={{ padding: '4px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>{Math.round((brandImpressions / totalImpressions) * 100)}% / {Math.round((genericImpressions / totalImpressions) * 100)}%</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div>
      {result.trackingFlags && result.trackingFlags.length > 0 && <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Flags</div>
        {result.trackingFlags.map((flag, i) => <div key={i} style={{ marginBottom: 6, fontSize: 12, color: '#475569' }}><strong>{flag.severity.toUpperCase()}:</strong> {flag.title} — {flag.description}</div>)}
      </div>}
      {Object.keys(issueReport).length > 0 && <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Bullet-point issue report</div>
        {Object.entries(PHASE_LABELS).map(([phase, label]) => {
          const bullets = issueReport[phase] || []
          if (!bullets.length) return null
          return <div key={phase} style={{ marginBottom: 8 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div><ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: '#475569' }}>{bullets.slice(0, 6).map((b, i) => <li key={i}>{b}</li>)}</ul></div>
        })}
      </div>}
    </div>
  )
}

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

      {result.trackingSnapshots && result.trackingSnapshots.length > 0 && (
        <TrackingReport result={result} />
      )}

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

const dot: CSSProperties = {
  display: 'inline-block',
  width: 10,
  height: 10,
  borderRadius: '50%',
  marginRight: 4,
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
