/**
 * Slide 12 — SEO health score. Dynamic.
 *
 * Reads seoAudit.overallScore (0-10) and seoAudit.categoryScores (JSON map
 * of category keys → score 0-10). Falls back to a placeholder when data is
 * missing so the slide is never blank.
 */

import type { ReactElement } from 'react'

type CategoryScores = Record<string, number>

type SeoAuditLike = {
  overallScore?: number | null
  categoryScores?: CategoryScores | null
} | null

// Display order matches the static slide. Keys map to audit JSON property names.
const SEO_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'siteHealth',           label: 'Site Health' },
  { key: 'indexability',         label: 'Indexability' },
  { key: 'coreWebVitals',        label: 'Core Web Vitals' },
  { key: 'securityPerformance',  label: 'Security & Performance' },
  { key: 'structuredData',       label: 'Structured Data' },
  { key: 'sitemapRobots',        label: 'Sitemap / Robots' },
  { key: 'navigationUx',         label: 'Navigation & UX' },
  { key: 'headingStructure',     label: 'Heading Structure' },
  { key: 'imageOptimization',    label: 'Image Optimisation' },
  { key: 'contentStructure',     label: 'Content Structure' },
  { key: 'eeat',                 label: 'E-E-A-T' },
  { key: 'faqImplementation',    label: 'FAQ Implementation' },
  { key: 'urlStructure',         label: 'URL Structure' },
  { key: 'metaData',             label: 'Meta Data' },
  { key: 'internalLinking',      label: 'Internal Linking' },
  { key: 'serviceCoverage',      label: 'Service Coverage' },
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
  if (score >= 80) return 'Strong foundation. Ready to fuel growth with paid and organic.'
  if (score >= 65) return 'Above benchmark. A few targeted fixes will push this into the 80s.'
  if (score >= 40) return 'Below the benchmark, but with a clear path to 80+ inside the first build.'
  return 'Significant gaps. Fixing these is the highest-ROI action before any ad spend.'
}

/** SVG circle gauge — matches the existing .gauge CSS class geometry. */
function Gauge({ score, colour }: { score: number; colour: string }): ReactElement {
  const circumference = 2 * Math.PI * 85 // r=85, matches static SVG
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

export function SeoHealthSlide({ seoAudit }: { seoAudit: SeoAuditLike }): ReactElement {
  // Convert 0-10 overall score to 0-100 for the gauge.
  const raw = seoAudit?.overallScore ?? null
  const overall = raw != null ? Math.round(raw * 10) : null
  const colour = overall != null ? gradeColour(overall) : '#e4e1d8'
  const scores = (seoAudit?.categoryScores ?? {}) as CategoryScores

  return (
    <section className="slide" data-label="14 SEO Health">
      <div className="brand-tag">
        <span className="dot"></span> 04 · Diagnosing the Ship
      </div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">04 · Diagnosing the Ship</div>
          <h1 className="h-title">SEO health score</h1>
        </div>
        <div className="h-meta">16 areas assessed · benchmark 65-80</div>
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
            {overall != null ? subText(overall) : 'Run the SEO audit to populate this slide.'}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div className="bars">
            {SEO_CATEGORIES.map(({ key, label }) => {
              const s = scores[key] ?? null
              const pct = s != null ? Math.round(s * 10) : null
              return (
                <div className="bar-row" key={key}>
                  <div className="meta">
                    <span className="name">{label}</span>
                    <span className="num-cell">{s != null ? `${s}/10` : '—'}</span>
                  </div>
                  <div className={`bar${pct != null ? ' ' + barClass(s!) : ''}`}>
                    <span style={{ width: pct != null ? `${pct}%` : '0%' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="slide-foot"></div>
    </section>
  )
}
