'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'

// ─── Types ──────────────────────────────────────────────

interface Issue {
  severity: 'critical' | 'warning' | 'notice'
  category: string
  type: string
  message: string
  url?: string
  details?: Record<string, unknown>
}

interface PageSummary {
  url: string
  statusCode: number
  title: string
  titleLength: number
  metaDescription: string
  metaDescriptionLength: number
  hasOgTitle: boolean
  hasOgDescription: boolean
  hasOgImage: boolean
  hasCanonical: boolean
  canonicalUrl: string | null
  h1Count: number
  h1Text: string | null
  imagesTotal: number
  imagesWithoutAlt: number
  internalLinks?: number
  externalLinks?: number
  internalLinksCount?: number
  externalLinksCount?: number
  wordCount: number
  isNoIndex?: boolean
  inSitemap?: boolean
  schemaTypes: string[]
  linkDepth: number
  googleIndexStatus?: 'indexed' | 'not_indexed' | 'error' | 'unknown' | 'not_checked'
  googleIndexDetails?: string
  lastCrawledByGoogle?: string | null
}

interface CategoryCounts {
  critical: number
  warning: number
  notice: number
}

// ─── Helpers ────────────────────────────────────────────

const severityColor = (s: string) => {
  if (s === 'critical') return { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' }
  if (s === 'warning') return { bg: '#fffbeb', border: '#fcd34d', text: '#d97706' }
  return { bg: '#f0fdf4', border: '#86efac', text: '#16a34a' }
}

const scoreColor = (score: number) => {
  if (score >= 80) return '#16a34a'
  if (score >= 60) return '#d97706'
  return '#dc2626'
}

const fmt = (n: number | null | undefined) =>
  n != null ? n.toLocaleString() : '—'

const pct = (n: number | null | undefined) =>
  n != null ? `${(n * 100).toFixed(1)}%` : '—'

const shortUrl = (url: string) => {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return url
  }
}

// ─── Sub-components ─────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const color = scoreColor(score)
  return (
    <div style={{
      width: 100, height: 100, borderRadius: '50%',
      border: `6px solid ${color}`, display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{score}</span>
      <span style={{ fontSize: 11, color: '#6b7280' }}>/ 100</span>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: '14px 18px', background: '#f9fafb', borderRadius: 8,
      border: '1px solid #e5e7eb', minWidth: 130, flex: 1,
    }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'inherit' }}>{value}</div>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const c = severityColor(severity)
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>
      {severity}
    </span>
  )
}

function CheckIcon({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 18, height: 18, borderRadius: '50%',
      background: ok ? '#dcfce7' : '#fee2e2', color: ok ? '#16a34a' : '#dc2626',
      fontSize: 12, fontWeight: 700, textAlign: 'center', lineHeight: '18px',
    }}>
      {ok ? '\u2713' : '\u2717'}
    </span>
  )
}

function GoogleIndexBadge({ status, details }: { status?: PageSummary['googleIndexStatus']; details?: string }) {
  const label = status === 'indexed'
    ? 'Indexed'
    : status === 'not_indexed'
      ? 'Not indexed'
      : status === 'error'
        ? 'Error'
        : status === 'unknown'
          ? 'Unknown'
          : 'Not checked'
  const color = status === 'indexed'
    ? { bg: '#dcfce7', text: '#16a34a', border: '#86efac' }
    : status === 'not_indexed' || status === 'error'
      ? { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' }
      : { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' }

  return (
    <span
      title={details || label}
      style={{
        display: 'inline-block', padding: '2px 7px', borderRadius: 999,
        background: color.bg, color: color.text, border: `1px solid ${color.border}`,
        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

// ─── Main Component ─────────────────────────────────────

const SiteHealthReportView = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()

  if (!id) return null

  const auditStatus = fields?.auditStatus?.value as string | undefined
  const healthScore = fields?.healthScore?.value as number | undefined

  if (auditStatus !== 'completed' || healthScore == null) {
    return null
  }

  const siteUrl = fields?.siteUrl?.value as string || ''
  const reportDate = fields?.reportDate?.value as string || ''

  const crawlStats = {
    totalPagesCrawled: fields?.['crawlStats.totalPagesCrawled']?.value as number | undefined,
    totalPagesInSitemap: fields?.['crawlStats.totalPagesInSitemap']?.value as number | undefined,
    crawlDurationMs: fields?.['crawlStats.crawlDurationMs']?.value as number | undefined,
  }

  const issuesSummary = {
    critical: (fields?.['issuesSummary.critical']?.value as number) ?? 0,
    warning: (fields?.['issuesSummary.warning']?.value as number) ?? 0,
    notice: (fields?.['issuesSummary.notice']?.value as number) ?? 0,
    total: (fields?.['issuesSummary.total']?.value as number) ?? 0,
  }

  const comparison = {
    previousScore: fields?.['comparison.previousScore']?.value as number | undefined,
    scoreChange: fields?.['comparison.scoreChange']?.value as number | undefined,
    newIssues: fields?.['comparison.newIssues']?.value as number | undefined,
    fixedIssues: fields?.['comparison.fixedIssues']?.value as number | undefined,
  }

  const issuesByCategory = parseJson(fields?.issuesByCategory?.value) as Record<string, CategoryCounts> | null
  const issues = parseJson(fields?.issues?.value) as Issue[] | null
  const pages = parseJson(fields?.pages?.value) as PageSummary[] | null

  const gscData = {
    indexedPages: fields?.['gscData.indexedPages']?.value as number | undefined,
    notIndexedPages: fields?.['gscData.notIndexedPages']?.value as number | undefined,
    totalClicks: fields?.['gscData.totalClicks']?.value as number | undefined,
    totalImpressions: fields?.['gscData.totalImpressions']?.value as number | undefined,
    averageCtr: fields?.['gscData.averageCtr']?.value as number | undefined,
    averagePosition: fields?.['gscData.averagePosition']?.value as number | undefined,
  }
  const hasGsc = gscData.indexedPages != null || gscData.totalClicks != null

  const dateStr = reportDate ? new Date(reportDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const crawlSecs = crawlStats.crawlDurationMs ? (crawlStats.crawlDurationMs / 1000).toFixed(1) : null

  // Group issues by category for display
  const issuesByGroup: Record<string, Issue[]> = {}
  if (issues) {
    for (const issue of issues) {
      const cat = issue.category || 'Other'
      if (!issuesByGroup[cat]) issuesByGroup[cat] = []
      issuesByGroup[cat].push(issue)
    }
  }

  // Sort categories: most critical first
  const sortedCategories = Object.entries(issuesByGroup).sort((a, b) => {
    const critA = a[1].filter(i => i.severity === 'critical').length
    const critB = b[1].filter(i => i.severity === 'critical').length
    return critB - critA
  })

  return (
    // `position: relative; z-index: 1` gives this view its own stacking context so
    // the app-header's and floating save bar's `backdrop-filter: blur()` layers don't
    // sample and blur it (Chromium backdrop-filter artifact).
    <div style={{ marginBottom: 24, position: 'relative', zIndex: 1 }}>
      {/* ── Header ── */}
      <div style={{
        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 24, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <ScoreCircle score={healthScore} />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Site Health Report</h2>
            <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
              {siteUrl} {dateStr && <span style={{ marginLeft: 8 }}>{dateStr}</span>}
            </div>
            {comparison.previousScore != null && (
              <div style={{ fontSize: 13, marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>Previous: <strong>{comparison.previousScore}</strong></span>
                <span style={{ color: (comparison.scoreChange ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                  Change: <strong>{(comparison.scoreChange ?? 0) > 0 ? '+' : ''}{comparison.scoreChange}</strong>
                </span>
                {comparison.fixedIssues != null && <span style={{ color: '#16a34a' }}>Fixed: <strong>{comparison.fixedIssues}</strong></span>}
                {comparison.newIssues != null && <span style={{ color: '#dc2626' }}>New: <strong>{comparison.newIssues}</strong></span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <MetricCard label="Pages Crawled" value={fmt(crawlStats.totalPagesCrawled)} />
        <MetricCard label="In Sitemap" value={fmt(crawlStats.totalPagesInSitemap)} />
        {crawlSecs && <MetricCard label="Crawl Time" value={`${crawlSecs}s`} />}
        <MetricCard label="Critical" value={fmt(issuesSummary.critical)} color="#dc2626" />
        <MetricCard label="Warnings" value={fmt(issuesSummary.warning)} color="#d97706" />
        <MetricCard label="Notices" value={fmt(issuesSummary.notice)} color="#16a34a" />
      </div>

      {/* ── Issues by Category ── */}
      {issuesByCategory && Object.keys(issuesByCategory).length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Issues by Category</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {Object.entries(issuesByCategory)
              .sort(([, a], [, b]) => b.critical - a.critical || b.warning - a.warning)
              .map(([cat, counts]) => (
                <div key={cat} style={{
                  padding: '12px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                  background: counts.critical > 0 ? '#fef2f2' : counts.warning > 0 ? '#fffbeb' : '#f0fdf4',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{cat}</div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                    {counts.critical > 0 && <span style={{ color: '#dc2626' }}>{counts.critical} critical</span>}
                    {counts.warning > 0 && <span style={{ color: '#d97706' }}>{counts.warning} warning</span>}
                    {counts.notice > 0 && <span style={{ color: '#16a34a' }}>{counts.notice} notice</span>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Issues List ── */}
      {sortedCategories.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>All Issues ({issuesSummary.total})</h3>
          {sortedCategories.map(([cat, catIssues]) => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px', color: '#374151' }}>
                {cat} ({catIssues.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {catIssues
                  .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
                  .map((issue, i) => {
                    const c = severityColor(issue.severity)
                    return (
                      <div key={i} style={{
                        padding: '10px 14px', borderRadius: 6,
                        background: c.bg, borderLeft: `4px solid ${c.border}`,
                        fontSize: 13,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: issue.url ? 4 : 0 }}>
                          <SeverityBadge severity={issue.severity} />
                          <span style={{ flex: 1 }}>{issue.message}</span>
                        </div>
                        {issue.url && (
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, wordBreak: 'break-all' }}>
                            {shortUrl(issue.url)}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pages Table ── */}
      {pages && pages.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Pages ({pages.length})</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  <th style={thStyle}>URL</th>
                  <th style={{ ...thStyle, width: 50 }}>Status</th>
                  <th style={{ ...thStyle, width: 50 }}>Words</th>
                  <th style={{ ...thStyle, width: 40 }}>H1</th>
                  <th style={{ ...thStyle, width: 60 }}>Title</th>
                  <th style={{ ...thStyle, width: 60 }}>Meta Desc</th>
                  <th style={{ ...thStyle, width: 40 }}>OG</th>
                  <th style={{ ...thStyle, width: 50 }}>Images</th>
                  <th style={{ ...thStyle, width: 50 }}>Links</th>
                  <th style={{ ...thStyle, width: 70 }}>Link Issues</th>
                  <th style={{ ...thStyle, width: 70 }}>Indexable</th>
                  <th style={{ ...thStyle, width: 100 }}>Google Index</th>
                  <th style={{ ...thStyle, width: 50 }}>Depth</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page, i) => {
                  const titleOk = page.titleLength > 0 && page.titleLength <= 60
                  const metaOk = page.metaDescriptionLength > 0 && page.metaDescriptionLength <= 160
                  const hasAllOg = page.hasOgTitle && page.hasOgDescription && page.hasOgImage
                  const internalLinks = page.internalLinksCount ?? page.internalLinks ?? 0
                  const externalLinks = page.externalLinksCount ?? page.externalLinks ?? 0
                  const linkIssueCount = issues?.filter((issue) => (
                    issue.url === page.url &&
                    (issue.category === 'Links' || issue.category === 'External Links' || issue.category === 'Redirects')
                  )).length ?? 0
                  const technicallyIndexable = page.statusCode >= 200 && page.statusCode < 300 && page.isNoIndex !== true
                  const indexableTitle = technicallyIndexable
                    ? 'Technically indexable: successful status and no noindex directive found'
                    : page.isNoIndex
                      ? 'Not technically indexable: page has a noindex directive'
                      : `Not technically indexable: status ${page.statusCode}`
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ ...tdStyle, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={page.url}>
                        {shortUrl(page.url)}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: page.statusCode === 200 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {page.statusCode}
                        </span>
                      </td>
                      <td style={tdStyle}>{fmt(page.wordCount)}</td>
                      <td style={tdStyle}><CheckIcon ok={page.h1Count === 1} /></td>
                      <td style={tdStyle}>
                        <span style={{ color: titleOk ? '#16a34a' : '#d97706' }}>{page.titleLength}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: metaOk ? '#16a34a' : '#d97706' }}>{page.metaDescriptionLength}</span>
                      </td>
                      <td style={tdStyle}><CheckIcon ok={hasAllOg} /></td>
                      <td style={tdStyle}>
                        {page.imagesTotal}
                        {page.imagesWithoutAlt > 0 && (
                          <span style={{ color: '#dc2626', marginLeft: 2 }}>({page.imagesWithoutAlt})</span>
                        )}
                      </td>
                      <td style={tdStyle}>{internalLinks}/{externalLinks}</td>
                      <td style={tdStyle} title="Broken internal links, redirect-chain links, and other link issues reported for this source page">
                        <span style={{ color: linkIssueCount > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{linkIssueCount}</span>
                      </td>
                      <td style={tdStyle} title={indexableTitle}><CheckIcon ok={technicallyIndexable} /></td>
                      <td style={tdStyle}><GoogleIndexBadge status={page.googleIndexStatus} details={page.googleIndexDetails} /></td>
                      <td style={tdStyle}>{page.linkDepth}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
            Title/Meta Desc = character count (green if within limits). Images = total (missing alt). Links = internal/external. Link Issues = broken internal links, redirects, and other source-page link issues. Indexable = technically crawlable/indexable (no noindex). Google Index = Search Console status. Depth = clicks from homepage.
          </div>
        </div>
      )}

      {/* ── GSC Data ── */}
      {hasGsc && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Google Search Console</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <MetricCard label="Indexed Pages" value={fmt(gscData.indexedPages)} color="#16a34a" />
            <MetricCard label="Not Indexed" value={fmt(gscData.notIndexedPages)} color="#dc2626" />
            <MetricCard label="Total Clicks" value={fmt(gscData.totalClicks)} />
            <MetricCard label="Impressions" value={fmt(gscData.totalImpressions)} />
            <MetricCard label="Avg CTR" value={pct(gscData.averageCtr)} />
            <MetricCard label="Avg Position" value={gscData.averagePosition?.toFixed(1) ?? '—'} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Utility ────────────────────────────────────────────

function severityRank(s: string) {
  if (s === 'critical') return 0
  if (s === 'warning') return 1
  return 2
}

function parseJson(val: unknown): unknown {
  if (val == null) return null
  if (typeof val === 'object') return val
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return null }
  }
  return null
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 11, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280',
  borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 10px', verticalAlign: 'middle',
}

export default SiteHealthReportView
