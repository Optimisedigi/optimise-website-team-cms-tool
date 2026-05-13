/**
 * Slide 13 — CRO health score. Dynamic.
 *
 * Reads croAudit.overallScore (0-10) and the 6 named category scores plus
 * croAudit.findings (JSON array) for the Key Findings card.
 *
 * Key Findings rendering rules (clean bullet list):
 *   - If the proposal has a non-empty `croKeyFindings` override array, render
 *     those bullets verbatim. This is the team's hand-written copy and wins.
 *   - Otherwise fall back to the auto-generated `croAudit.findings`, sorted
 *     critical → warning → good, truncated to 5. Either way the markup is
 *     a plain <ul> with no icons, no colour, and no separator dots.
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

/**
 * Normalise auto-generated CRO findings before they hit the slide:
 *   1. Strip em / en dashes (and the spaces around them). Auto-generated
 *      messages frequently use " — " as a clause separator; we replace it
 *      with ". " so the sentence still parses.
 *   2. Strip the trailing "(no action verb)" parenthetical that the audit
 *      engine appends to CTA findings. It reads as internal QA noise on the
 *      slide and the surrounding sentence already conveys the point.
 *   3. Collapse stray double spaces / leading punctuation introduced by 1–2.
 */
function sanitiseFinding(message: string): string {
  let s = message
  // Drop the QA parenthetical — with or without leading space.
  s = s.replace(/\s*\(no action verb\)/gi, '')
  // Replace " — " / " – " (or any variant with surrounding spaces) with ". ".
  s = s.replace(/\s*[—–]\s*/g, '. ')
  // Any remaining bare em/en dash becomes a hyphen so we never render one.
  s = s.replace(/[—–]/g, '-')
  // Tidy whitespace.
  s = s.replace(/\s{2,}/g, ' ').trim()
  // Avoid "foo.. bar" if the original already ended a clause with a period.
  s = s.replace(/\.\s*\.\s*/g, '. ')
  return s
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

export type CroKeyFindingOverride = { bullet?: string | null } | null

export function CroHealthSlide({
  croAudit,
  keyFindingsOverride,
}: {
  croAudit: CroAuditLike
  keyFindingsOverride?: CroKeyFindingOverride[] | null
}): ReactElement {
  const raw = croAudit?.overallScore ?? null
  const overall = raw != null ? Math.round(raw * 10) : null
  const colour = overall != null ? gradeColour(overall) : '#e4e1d8'

  // Override wins when at least one non-empty bullet is present. Sanitise
  // hand-written bullets too so the no-dashes rule applies deck-wide.
  const overrideBullets: string[] = (keyFindingsOverride ?? [])
    .map((f) => f?.bullet?.trim())
    .filter((b): b is string => Boolean(b && b.length > 0))
    .map((b) => sanitiseFinding(b))
    .filter((b) => b.length > 0)

  const autoBullets: string[] = overrideBullets.length > 0
    ? []
    : (
        [...((croAudit?.findings ?? []) as CroFinding[])]
          .sort((a, b) => {
            const order: Record<string, number> = {
              critical: 0,
              warning: 1,
              good: 2,
            }
            return (order[a.status ?? ''] ?? 3) - (order[b.status ?? ''] ?? 3)
          })
          .map((f) => f.message?.trim())
          .filter((m): m is string => Boolean(m && m.length > 0))
          .map((m) => sanitiseFinding(m))
          .filter((m) => m.length > 0)
          .slice(0, 5)
      )

  const bullets =
    overrideBullets.length > 0 ? overrideBullets : autoBullets

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
                <div className="v" style={{ color: 'var(--ink-mute)' }}>n/a</div>
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
                    <span className="num-cell">{score != null ? `${score}/10` : ''}</span>
                  </div>
                  <div className={`bar${pct != null ? ' ' + barClass(score!) : ''}`}>
                    <span style={{ width: pct != null ? `${pct}%` : '0%' }} />
                  </div>
                </div>
              )
            })}
          </div>

          {bullets.length > 0 && (
            <div className="card" style={{ padding: '28px 32px' }}>
              <div className="num-tag">KEY FINDINGS</div>
              <ul className="cro-findings-list">
                {bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="slide-foot"></div>
    </section>
  )
}
