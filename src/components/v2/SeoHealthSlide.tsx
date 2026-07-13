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

// Display order matches the static slide. Keys map to audit JSON property
// names. The `definition` field powers the definitions slide that follows
// the score slide — each row gets a short, plain-English explanation of
// what we're actually measuring.
const SEO_CATEGORIES: Array<{
  key: string
  label: string
  definition: string
}> = [
  {
    key: 'siteHealth',
    label: 'Site Health',
    definition:
      'Overall technical condition: broken links, server errors, redirect chains, and anything blocking crawlers from cleanly indexing the site.',
  },
  {
    key: 'indexability',
    label: 'Indexability',
    definition:
      'Whether Google can actually see and index your pages. Covers noindex tags, canonicals, robots directives, and accidental blocks.',
  },
  {
    key: 'coreWebVitals',
    label: 'Core Web Vitals',
    definition:
      'Google’s page-experience metrics: load speed (LCP), responsiveness (INP) and visual stability (CLS). A direct ranking factor.',
  },
  {
    key: 'securityPerformance',
    label: 'Security & Performance',
    definition:
      'HTTPS configuration, mixed-content issues, security headers, server response times and caching. The basics search engines and users expect.',
  },
  {
    key: 'structuredData',
    label: 'Structured Data',
    definition:
      'Schema.org markup that helps Google understand the page (business info, services, reviews, FAQs) and unlocks rich results in the SERP.',
  },
  {
    key: 'sitemapRobots',
    label: 'Sitemap / Robots',
    definition:
      'XML sitemap completeness and robots.txt accuracy. These tell Google what to crawl and what to ignore. Errors here cost coverage.',
  },
  {
    key: 'navigationUx',
    label: 'Navigation & UX',
    definition:
      'How easily a user (and Googlebot) gets from the homepage to any important page. Menu structure, depth, and the logical paths through the site.',
  },
  {
    key: 'headingStructure',
    label: 'Heading Structure',
    definition:
      'Proper use of H1 through H6 tags so each page has a clear hierarchy. Helps both accessibility and topical relevance.',
  },
  {
    key: 'imageOptimization',
    label: 'Image Optimisation',
    definition:
      'Compressed, modern-format images with descriptive alt text. Drives page speed, accessibility and image-search visibility.',
  },
  {
    key: 'contentStructure',
    label: 'Content Structure',
    definition:
      'How content is organised on each page: paragraph length, scannability, formatting, and whether the page actually answers the search intent.',
  },
  {
    key: 'eeat',
    label: 'E-E-A-T',
    definition:
      'Experience, Expertise, Authoritativeness, Trustworthiness. Author bios, credentials, real-world experience signals and third-party trust markers.',
  },
  {
    key: 'faqImplementation',
    label: 'FAQ Implementation',
    definition:
      'Answering the questions users actually ask, marked up with FAQ schema where appropriate. Captures long-tail and voice-search traffic.',
  },
  {
    key: 'urlStructure',
    label: 'URL Structure',
    definition:
      'Short, descriptive, lowercase URLs without parameters or session IDs. A small but consistent ranking signal.',
  },
  {
    key: 'metaData',
    label: 'Meta Data',
    definition:
      'Title tags and meta descriptions on every page. Unique, the right length, written to win the click from the search results.',
  },
  {
    key: 'internalLinking',
    label: 'Internal Linking',
    definition:
      'How pages link to one another. Distributes authority across the site and helps Google understand which pages matter most.',
  },
  {
    key: 'serviceCoverage',
    label: 'Service Coverage',
    definition:
      'Whether every service you offer has its own dedicated, optimised page, not just a single “services” list. Each one is a potential search entry point.',
  },
]

function barClass(score: number): string {
  if (score >= 7) return 'g'
  if (score >= 4) return 'a'
  return 'r'
}

export function gradeLabel(score: number): string {
  if (score >= 86) return 'Strong'
  if (score >= 74) return 'Good'
  if (score >= 50) return 'Fair'
  return 'Needs work'
}

export function gradeColour(score: number): string {
  if (score >= 86) return '#22c55e'
  if (score >= 74) return '#84cc16'
  if (score >= 50) return '#f0b35a'
  return '#ef4444'
}

function subText(score: number): string {
  if (score >= 86) return 'Strong foundation. Ready to fuel growth with paid and organic.'
  if (score >= 74) return 'Above benchmark. A few targeted fixes will push this into the 80s.'
  if (score >= 50) return 'Below the benchmark, but with a clear path to 80+ inside the first build.'
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
                <div className="v" style={{ color: 'var(--ink-mute)' }}>n/a</div>
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
            {SEO_CATEGORIES.map(({ key, label, definition }) => {
              const s = scores[key] ?? null
              const pct = s != null ? Math.round(s * 10) : null
              return (
                <div className="bar-row" key={key}>
                  <div className="meta">
                    {/* Hover/focus the name to surface the category
                        definition as a tooltip. Keyboard-accessible via
                        tabIndex + :focus-visible in the CSS. */}
                    <span
                      className="name seo-cat-name"
                      tabIndex={0}
                      data-tip={definition}
                      role="button"
                      aria-label={`${label}: ${definition}`}
                    >
                      {label}
                    </span>
                    <span className="num-cell">{s != null ? `${s}/10` : ''}</span>
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
