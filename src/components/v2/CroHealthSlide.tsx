/**
 * Slide 13 — CRO health score. Dynamic.
 *
 * Reads croAudit.overallScore (0-10) and the 6 named category scores plus
 * croAudit.findings (JSON array) for the Key Findings card.
 */

import type { ReactElement } from 'react'

type CroFinding = {
  status?: string | null
  message?: string | null
  category?: string | null
}

type CroAuditLike = {
  overallScore?: number | null
  firstImpressionScore?: number | null
  aboveFoldScore?: number | null
  trustScore?: number | null
  ctaScore?: number | null
  leadCaptureScore?: number | null
  contentReadabilityScore?: number | null
  contentScore?: number | null
  navigationScore?: number | null
  findings?: CroFinding[] | null
} | null

const CRO_CATEGORIES: Array<{ key: keyof NonNullable<CroAuditLike>; fallback?: keyof NonNullable<CroAuditLike>; label: string }> = [
  { key: 'navigationScore',         label: 'Navigation' },
  { key: 'ctaScore',                label: 'Call-to-Action' },
  { key: 'firstImpressionScore',    fallback: 'aboveFoldScore',          label: 'First Impression' },
  { key: 'trustScore',              label: 'Trust & Social Proof' },
  { key: 'leadCaptureScore',        label: 'Lead Capture' },
  { key: 'contentReadabilityScore', fallback: 'contentScore',            label: 'Content & Readability' },
]

function barClass(score: number): string {
  if (score >= 7) return 'g'
  if (score >= 4) return 'a'
  return 'r'
}

function gradeLabel(score: number): string {
  if (score >= 80) return 'Strong'
  if (score >= 65) return 'Good'
  if (score >= 40) return 'Fair'
  return 'Needs work'
}

function gradeColour(score: number): string {
  if (score >= 80) return '#22c55e'
  if (score >= 65) return '#84cc16'
  if (score >= 40) return '#f0b35a'
  return '#ef4444'
}

function subText(score: number): string {
  if (score >= 80) return 'Strong conversion foundation. Focus on incrementally optimising.'
  if (score >= 65) return 'Above benchmark. Targeted improvements will lift lead capture meaningfully.'
  if (score >= 40) return 'Trust and capture are the largest drag on conversion. Both are quick to fix.'
  return 'Significant conversion gaps. Fixing these will compound every other traffic investment.'
}

function statusIcon(status: string | null | undefined): string {
  if (status === 'good') return '✓'
  if (status === 'warning') return '⚠'
  return '✗'
}

function statusColour(status: string | null | undefined): string {
  if (status === 'good') return 'var(--green)'
  if (status === 'warning') return 'var(--gold)'
  return 'var(--red)'
}

function Gauge({ score, colour }: { score: number; colour: string }): ReactElement {
  const circumference = 2 * Math.PI * 85
  const dashoffset = circumference - (circumference * score) / 100
  return (
    <div className="gauge">
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="85" stroke="#e4e1d8" strokeWidth="14" fill="none" />
        <circle
          cx="100" cy="100" r="85"
          stroke={colour} strokeWidth="14" fill="none"
          strokeDasharray={String(circumference)}
          strokeDashoffset={String(dashoffset)}
          strokeLinecap="round"
        />
      </svg>
      <div className="gauge-label">
        <div className="v">{score}</div>
        <div className="max">/ 100</div>
        <div className="grade">{gradeLabel(score)}</div>
      </div>
    </div>
  )
}

export function CroHealthSlide({ croAudit }: { croAudit: CroAuditLike }): ReactElement {
  const raw = croAudit?.overallScore ?? null
  const overall = raw != null ? Math.round(raw * 10) : null
  const colour = overall != null ? gradeColour(overall) : '#e4e1d8'

  const findings = (croAudit?.findings ?? []) as CroFinding[]
  // Take up to 5 findings, preferring critical/warning first.
  const sortedFindings = [...findings].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, warning: 1, good: 2 }
    return (order[a.status ?? ''] ?? 3) - (order[b.status ?? ''] ?? 3)
  }).slice(0, 5)

  return (
    <section className="slide" data-label="15 CRO Health">
      <div className="brand-tag">
        <span className="dot"></span> 04 · Diagnosing the Ship
      </div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">04 · Diagnosing the Ship</div>
          <h1 className="h-title">CRO health score</h1>
        </div>
        <div className="h-meta">6 areas assessed · benchmark 65-80</div>
      </div>

      <div className="gauge-wrap" style={{ alignItems: 'flex-start', gap: 80 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          {overall != null ? (
            <Gauge score={overall} colour={colour} />
          ) : (
            <div className="gauge">
              <svg viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="85" stroke="#e4e1d8" strokeWidth="14" fill="none" />
              </svg>
              <div className="gauge-label">
                <div className="v" style={{ color: 'var(--ink-mute)' }}>—</div>
                <div className="max">/ 100</div>
                <div className="grade">Pending</div>
              </div>
            </div>
          )}
          <div className="small" style={{ textAlign: 'center', maxWidth: 300 }}>
            {overall != null ? subText(overall) : 'Run the CRO audit to populate this slide.'}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div className="bars" style={{ gridTemplateColumns: '1fr' }}>
            {CRO_CATEGORIES.map(({ key, fallback, label }) => {
              const c = croAudit as Record<string, unknown> | null
              const s = (c?.[key] ?? (fallback ? c?.[fallback] : null)) as number | null | undefined
              const score = s != null ? s : null
              const pct = score != null ? Math.round(score * 10) : null
              return (
                <div className="bar-row" key={String(key)}>
                  <div className="meta">
                    <span className="name">{label}</span>
                    <span className="num-cell">{score != null ? `${score}/10` : '—'}</span>
                  </div>
                  <div className={`bar${pct != null ? ' ' + barClass(score!) : ''}`}>
                    <span style={{ width: pct != null ? `${pct}%` : '0%' }} />
                  </div>
                </div>
              )
            })}
          </div>

          {sortedFindings.length > 0 && (
            <div className="card" style={{ padding: '28px 32px' }}>
              <div className="num-tag">KEY FINDINGS</div>
              <div className="b" style={{ fontSize: 26, lineHeight: 1.5 }}>
                {sortedFindings.map((f, i) => (
                  <span key={i}>
                    <strong style={{ color: statusColour(f.status) }}>
                      {statusIcon(f.status)}
                    </strong>
                    {' '}{f.message}
                    {i < sortedFindings.length - 1 && (
                      <span style={{ color: 'var(--line)', margin: '0 12px' }}>·</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="slide-foot"></div>
    </section>
  )
}
