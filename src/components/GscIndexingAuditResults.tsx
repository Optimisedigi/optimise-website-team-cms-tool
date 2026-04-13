'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'

interface InspectionResult {
  url: string
  coverageState: string
  crawledAs: string
  lastCrawlTime: string | null
  pageFetchState: string
  robotsTxtState: string
  indexingState: string
  verdict: string
  referringUrls: string[]
  sitemap: string[]
  inspectedAt: string
  error?: string
}

interface SummaryStats {
  indexed: number
  indexedProblematic?: number
  notIndexed: number
  byReason: Record<string, number>
  byFetchIssue?: Record<string, number>
}

/** Fetch states that indicate an indexed page is problematic */
const PROBLEMATIC_FETCH_STATES = new Set([
  'NOT_FOUND',
  'SOFT_404',
  'SERVER_ERROR',
  'REDIRECT_ERROR',
  'ACCESS_DENIED',
  'ACCESS_FORBIDDEN',
  'BLOCKED_4XX',
  'BLOCKED_ROBOTS_TXT',
])

/**
 * Get a smart redirect suggestion for a 404 URL by matching path segments
 * against healthy indexed URLs. Falls back to site root if no good match.
 */
function getRedirectSuggestion(notFoundUrl: string, healthyUrls: string[]): string {
  if (healthyUrls.length === 0) return '/'

  let notFoundPath: string
  try {
    notFoundPath = new URL(notFoundUrl).pathname
  } catch {
    notFoundPath = notFoundUrl
  }

  const notFoundParts = notFoundPath.split('/').filter(Boolean)
  if (notFoundParts.length === 0) return '/'

  let bestMatch = '/'
  let bestScore = 0

  for (const url of healthyUrls) {
    let candidatePath: string
    try {
      candidatePath = new URL(url).pathname
    } catch {
      candidatePath = url
    }
    const candidateParts = candidatePath.split('/').filter(Boolean)
    if (candidateParts.length === 0) continue

    // Longest common subsequence of path parts
    let score = 0
    let ci = 0
    for (const nfPart of notFoundParts) {
      for (let j = ci; j < candidateParts.length; j++) {
        if (candidateParts[j].toLowerCase() === nfPart.toLowerCase()) {
          score++
          ci = j + 1
          break
        }
        // Partial match: check if parts share significant substrings
        const nfLower = nfPart.toLowerCase()
        const cLower = candidateParts[j].toLowerCase()
        if (nfLower.length > 3 && cLower.length > 3 && (cLower.includes(nfLower) || nfLower.includes(cLower))) {
          score += 0.5
          ci = j + 1
          break
        }
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = candidatePath
    }
  }

  // Only suggest if we have at least some path segment overlap
  return bestScore >= 0.5 ? bestMatch : '/'
}

/**
 * Generate an actionable markdown report from inspection results.
 * Designed to be parseable by AI agents for automated fix implementation.
 */
function generateActionPlanMarkdown(
  results: InspectionResult[],
  siteUrl: string,
  redirectOverrides: Record<string, string>,
): string {
  const now = new Date().toISOString().split('T')[0]

  // Derive stats from results directly
  let healthyIndexed = 0
  let indexedProblematic = 0
  let notIndexed = 0
  let errors = 0
  const indexed404s: InspectionResult[] = []
  const indexedServerErrors: InspectionResult[] = []
  const indexedSoft404s: InspectionResult[] = []
  const crawledNotIndexed: InspectionResult[] = []
  const unknownToGoogle: InspectionResult[] = []
  const duplicateIssues: InspectionResult[] = []
  const otherNotIndexed: InspectionResult[] = []

  const healthyUrls = results
    .filter((r) => r.coverageState === 'Submitted and indexed' && (!r.pageFetchState || !PROBLEMATIC_FETCH_STATES.has(r.pageFetchState)))
    .map((r) => r.url)

  for (const r of results) {
    if (r.coverageState === 'inspection_failed') {
      errors++
      continue
    }
    if (r.coverageState === 'Submitted and indexed') {
      if (r.pageFetchState && PROBLEMATIC_FETCH_STATES.has(r.pageFetchState)) {
        indexedProblematic++
        if (r.pageFetchState === 'NOT_FOUND') indexed404s.push(r)
        else if (r.pageFetchState === 'SERVER_ERROR') indexedServerErrors.push(r)
        else if (r.pageFetchState === 'SOFT_404') indexedSoft404s.push(r)
      } else {
        healthyIndexed++
      }
    } else {
      notIndexed++
      if (r.coverageState === 'Crawled - currently not indexed') crawledNotIndexed.push(r)
      else if (r.coverageState === 'URL is unknown to Google') unknownToGoogle.push(r)
      else if (r.coverageState === 'Discovered - currently not indexed') unknownToGoogle.push(r)
      else if (r.coverageState.includes('Duplicate') || r.coverageState.includes('redirect') || r.coverageState.includes('Alternate')) duplicateIssues.push(r)
      else otherNotIndexed.push(r)
    }
  }

  const lines: string[] = []
  lines.push(`# Indexing Audit Action Plan`)
  lines.push(``)
  lines.push(`**Site:** ${siteUrl}`)
  lines.push(`**Date:** ${now}`)
  lines.push(`**Total Pages Inspected:** ${results.length}`)
  lines.push(``)

  // Summary
  lines.push(`## Summary`)
  lines.push(``)
  lines.push(`| Metric | Count |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Healthy Indexed | ${healthyIndexed} |`)
  lines.push(`| Indexed — Needs Fix | ${indexedProblematic} |`)
  lines.push(`| Not Indexed | ${notIndexed} |`)
  lines.push(`| Inspection Errors | ${errors} |`)
  lines.push(``)

  // Priority 1: Indexed 404s → Redirect table
  if (indexed404s.length > 0) {
    lines.push(`## 🔴 Priority 1: Indexed 404 Pages — Need Redirects`)
    lines.push(``)
    lines.push(`These ${indexed404s.length} pages are indexed by Google but return a 404 error. They need 301 redirects to relevant existing pages.`)
    lines.push(``)
    lines.push(`| From URL | Redirect To |`)
    lines.push(`|----------|-------------|`)
    for (const r of indexed404s) {
      const target = redirectOverrides[r.url] || getRedirectSuggestion(r.url, healthyUrls)
      const fromPath = stripOrigin(r.url)
      lines.push(`| \`${fromPath}\` | \`${target}\` |`)
    }
    lines.push(``)
    lines.push(`### Implementation (Next.js)`)
    lines.push(``)
    lines.push('Add these redirects to `next.config.js` or `next.config.ts`:')
    lines.push(``)
    lines.push('```js')
    lines.push(`async redirects() {`)
    lines.push(`  return [`)
    for (const r of indexed404s) {
      const target = redirectOverrides[r.url] || getRedirectSuggestion(r.url, healthyUrls)
      const fromPath = stripOrigin(r.url)
      lines.push(`    { source: '${fromPath}', destination: '${target}', permanent: true },`)
    }
    lines.push(`  ]`)
    lines.push(`}`)
    lines.push('```')
    lines.push(``)
  }

  // Priority 1b: Indexed server errors
  if (indexedServerErrors.length > 0) {
    lines.push(`## 🔴 Priority 1: Indexed Server Error Pages`)
    lines.push(``)
    lines.push(`These ${indexedServerErrors.length} pages are indexed but returning server errors. Fix the underlying server issues.`)
    lines.push(``)
    for (const r of indexedServerErrors) {
      lines.push(`- \`${stripOrigin(r.url)}\``)
    }
    lines.push(``)
  }

  // Priority 1c: Indexed soft 404s
  if (indexedSoft404s.length > 0) {
    lines.push(`## 🔴 Priority 1: Indexed Soft 404 Pages`)
    lines.push(``)
    lines.push(`These ${indexedSoft404s.length} pages are indexed but Google considers them soft 404s. Add meaningful content or return a proper 404.`)
    lines.push(``)
    for (const r of indexedSoft404s) {
      lines.push(`- \`${stripOrigin(r.url)}\``)
    }
    lines.push(``)
  }

  // Priority 2: Crawled but not indexed
  if (crawledNotIndexed.length > 0) {
    lines.push(`## 🟠 Priority 2: Crawled but Not Indexed (${crawledNotIndexed.length} pages)`)
    lines.push(``)
    lines.push(`Google crawled these pages but chose not to index them. Actions: improve content quality, add internal links, ensure unique value.`)
    lines.push(``)
    for (const r of crawledNotIndexed) {
      lines.push(`- \`${stripOrigin(r.url)}\``)
    }
    lines.push(``)
  }

  // Priority 3: Unknown to Google
  if (unknownToGoogle.length > 0) {
    lines.push(`## 🟠 Priority 3: Unknown / Not Yet Crawled (${unknownToGoogle.length} pages)`)
    lines.push(``)
    lines.push(`Google doesn't know about these pages or hasn't crawled them yet. Actions: submit sitemap, add internal links, request indexing in Search Console.`)
    lines.push(``)
    for (const r of unknownToGoogle) {
      lines.push(`- \`${stripOrigin(r.url)}\` — ${COVERAGE_LABELS[r.coverageState] || r.coverageState}`)
    }
    lines.push(``)
  }

  // Priority 4: Duplicate / redirect issues
  if (duplicateIssues.length > 0) {
    lines.push(`## 🟡 Priority 4: Duplicate / Redirect Issues (${duplicateIssues.length} pages)`)
    lines.push(``)
    lines.push(`These pages have duplicate content or redirect issues. Actions: set canonical tags, fix redirect chains, consolidate content.`)
    lines.push(``)
    for (const r of duplicateIssues) {
      lines.push(`- \`${stripOrigin(r.url)}\` — ${COVERAGE_LABELS[r.coverageState] || r.coverageState}`)
    }
    lines.push(``)
  }

  // Other not indexed issues
  if (otherNotIndexed.length > 0) {
    lines.push(`## Other Issues (${otherNotIndexed.length} pages)`)
    lines.push(``)
    for (const r of otherNotIndexed) {
      lines.push(`- \`${stripOrigin(r.url)}\` — ${COVERAGE_LABELS[r.coverageState] || r.coverageState}`)
    }
    lines.push(``)
  }

  lines.push(`---`)
  lines.push(`*Generated by Optimise Digital Indexing Audit on ${now}. Redirect suggestions are heuristic — review before implementing.*`)

  return lines.join('\n')
}

type FilterMode = 'all' | 'indexed' | 'not_indexed' | 'errors' | 'indexed_issues' | string

const PAGE_SIZE = 50

/** Human-readable short labels for Google's coverage states */
const COVERAGE_LABELS: Record<string, string> = {
  'Submitted and indexed': 'Indexed',
  'Crawled - currently not indexed': 'Crawled but not indexed',
  'Discovered - currently not indexed': 'Discovered but not indexed',
  'Page with redirect': 'Redirect',
  'URL is unknown to Google': 'Unknown to Google',
  'Excluded by noindex tag': 'Blocked by noindex',
  'Blocked by robots.txt': 'Blocked by robots.txt',
  'Blocked due to unauthorized request (401)': '401 Unauthorized',
  'Not found (404)': '404 Not Found',
  'Soft 404': 'Soft 404',
  'Blocked due to other 4xx issue': '4xx Error',
  'Server error (5xx)': '5xx Server Error',
  'Duplicate without user-selected canonical': 'Duplicate (no canonical)',
  'Duplicate, Google chose different canonical than user': 'Duplicate (Google chose different canonical)',
  'Alternate page with proper canonical tag': 'Alternate page (canonical set)',
  'Page indexed without content': 'Indexed without content',
  inspection_failed: 'Inspection Error',
}

/** Actionable fix advice for each coverage state */
const COVERAGE_ADVICE: Record<string, string> = {
  'Crawled - currently not indexed':
    'Google crawled this page but chose not to index it. Improve content quality, add internal links pointing to this page, and ensure it provides unique value.',
  'Discovered - currently not indexed':
    'Google knows about this page but hasn\'t crawled it yet. This usually resolves on its own. To speed it up, add internal links to this page or submit it via "Request Indexing" in Search Console.',
  'Page with redirect':
    'This URL redirects to another page. If intentional, no action needed. If not, fix the redirect or update internal links to point to the final URL.',
  'URL is unknown to Google':
    'Google has never seen this URL. Submit the sitemap, add internal links, or use "Request Indexing" in Search Console.',
  'Excluded by noindex tag':
    'A noindex meta tag or header is preventing indexing. Remove the noindex tag if this page should be indexed.',
  'Blocked by robots.txt':
    'robots.txt is blocking Google from crawling this page. Update robots.txt to allow access if this page should be indexed.',
  'Blocked due to unauthorized request (401)':
    'Google got a 401 response. This page requires authentication. Remove auth requirements for public pages or exclude from sitemap.',
  'Not found (404)':
    'Page returns a 404 error. Either restore the page, set up a 301 redirect, or remove the URL from your sitemap.',
  'Soft 404':
    'Google considers this a soft 404 (page exists but has little/no content). Add meaningful content or return a proper 404 status code.',
  'Blocked due to other 4xx issue':
    'Google received a 4xx client error. Check the page loads correctly and fix any access issues.',
  'Server error (5xx)':
    'Google encountered a server error. Check server logs, fix the issue, and ensure the page loads reliably.',
  'Duplicate without user-selected canonical':
    'Google found duplicate content. Set a canonical tag to tell Google which version to index.',
  'Duplicate, Google chose different canonical than user':
    'Google is ignoring your canonical tag and using a different URL. Review the content for duplication and ensure the canonical points to the right page.',
  'Alternate page with proper canonical tag':
    'This is an alternate version (e.g. mobile, AMP) with a canonical pointing to the primary. No action needed unless the primary page has issues.',
  'Page indexed without content':
    'Google indexed this page but found no meaningful content. Add content to the page or block indexing if it\'s not needed.',
  inspection_failed:
    'The URL Inspection API failed for this URL. Try running the audit again or inspect manually in Search Console.',
}

/** Severity for sorting: lower = more urgent */
function getSeverity(coverageState: string): number {
  const severityMap: Record<string, number> = {
    'Not found (404)': 1,
    'Server error (5xx)': 1,
    'Soft 404': 2,
    'Blocked due to unauthorized request (401)': 2,
    'Blocked due to other 4xx issue': 2,
    'URL is unknown to Google': 3,
    'Crawled - currently not indexed': 3,
    'Discovered - currently not indexed': 4,
    'Excluded by noindex tag': 5,
    'Blocked by robots.txt': 5,
    'Page with redirect': 6,
    'Duplicate without user-selected canonical': 6,
    'Duplicate, Google chose different canonical than user': 6,
    'Alternate page with proper canonical tag': 7,
    'Page indexed without content': 4,
    inspection_failed: 8,
    'Submitted and indexed': 9,
  }
  return severityMap[coverageState] ?? 5
}

export default function GscIndexingAuditResults() {
  const { initialData } = useDocumentInfo()
  const data = initialData as any
  const auditId = data?.id
  const siteUrl: string = data?.siteUrl || ''

  // Live state that gets updated by polling
  const [liveResults, setLiveResults] = useState<InspectionResult[] | null>(null)
  const [liveTotalUrls, setLiveTotalUrls] = useState<number | null>(null)
  const [liveInspectedCount, setLiveInspectedCount] = useState<number | null>(null)
  const [liveStatus, setLiveStatus] = useState<string | null>(null)
  const [liveSummaryStats, setLiveSummaryStats] = useState<SummaryStats | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const results: InspectionResult[] = liveResults ?? data?.inspectionResults ?? []
  const totalUrls: number = liveTotalUrls ?? data?.totalUrls ?? 0
  const inspectedCount: number = liveInspectedCount ?? data?.inspectedCount ?? 0
  const status: string = liveStatus ?? data?.status ?? 'discovering'
  const summaryStats: SummaryStats = liveSummaryStats ?? data?.summaryStats ?? { indexed: 0, notIndexed: 0, byReason: {} }

  // Redirect override state for the Actionable Insights panel
  const [redirectOverrides, setRedirectOverrides] = useState<Record<string, string>>({})
  // Collapsible sections in Actionable Insights
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ indexed404s: true })

  // Auto-poll every 8s while audit is active — just reads state (inspection is driven by Overview tab)
  useEffect(() => {
    if (!auditId) return
    const isActive = status === 'discovering' || status === 'inspecting'
    if (!isActive) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/gsc/indexing-audit/${auditId}`)
        if (!res.ok) return
        const audit = await res.json()
        setLiveStatus(audit.status)
        setLiveInspectedCount(audit.inspectedCount || 0)
        setLiveTotalUrls(audit.totalUrls || 0)
        setLiveSummaryStats(audit.summaryStats || { indexed: 0, notIndexed: 0, byReason: {} })
        if (audit.inspectionResults) {
          setLiveResults(audit.inspectionResults)
        }
      } catch {
        // ignore poll errors
      }
    }

    // Poll immediately once, then every 8s
    poll()
    pollRef.current = setInterval(poll, 8000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [auditId, status])

  // Default to "not_indexed" so you immediately see problems
  const [filter, setFilter] = useState<FilterMode>('not_indexed')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null)

  // Derive counts at render time from inspectionResults so old audits work
  const derivedCounts = useMemo(() => {
    let healthyIndexed = 0
    let indexedProblematic = 0
    let notIndexed = 0
    let errors = 0
    const indexed404s: InspectionResult[] = []
    const crawledNotIndexed: InspectionResult[] = []
    const unknownToGoogle: InspectionResult[] = []
    const duplicateRedirectIssues: InspectionResult[] = []

    const healthyUrls: string[] = []

    for (const r of results) {
      if (r.coverageState === 'inspection_failed') {
        errors++
        continue
      }
      if (r.coverageState === 'Submitted and indexed') {
        if (r.pageFetchState && PROBLEMATIC_FETCH_STATES.has(r.pageFetchState)) {
          indexedProblematic++
          if (r.pageFetchState === 'NOT_FOUND') indexed404s.push(r)
        } else {
          healthyIndexed++
          healthyUrls.push(r.url)
        }
      } else {
        notIndexed++
        if (r.coverageState === 'Crawled - currently not indexed') crawledNotIndexed.push(r)
        else if (r.coverageState === 'URL is unknown to Google' || r.coverageState === 'Discovered - currently not indexed') unknownToGoogle.push(r)
        else if (r.coverageState.includes('Duplicate') || r.coverageState.includes('redirect') || r.coverageState.includes('Alternate')) duplicateRedirectIssues.push(r)
      }
    }

    return { healthyIndexed, indexedProblematic, notIndexed, errors, indexed404s, crawledNotIndexed, unknownToGoogle, duplicateRedirectIssues, healthyUrls }
  }, [results])

  const filteredResults = useMemo(() => {
    let filtered = results

    if (filter === 'indexed') {
      filtered = filtered.filter((r) => r.coverageState === 'Submitted and indexed' && (!r.pageFetchState || !PROBLEMATIC_FETCH_STATES.has(r.pageFetchState)))
    } else if (filter === 'indexed_issues') {
      filtered = filtered.filter((r) => r.coverageState === 'Submitted and indexed' && r.pageFetchState && PROBLEMATIC_FETCH_STATES.has(r.pageFetchState))
    } else if (filter === 'not_indexed') {
      filtered = filtered.filter(
        (r) => r.coverageState !== 'Submitted and indexed' && r.coverageState !== 'inspection_failed'
      )
    } else if (filter === 'errors') {
      filtered = filtered.filter((r) => r.coverageState === 'inspection_failed')
    } else if (filter !== 'all') {
      // Filter by specific reason
      filtered = filtered.filter((r) => r.coverageState === filter)
    }

    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter((r) => r.url.toLowerCase().includes(q))
    }

    // Sort by severity (most urgent first), then alphabetically
    filtered = [...filtered].sort((a, b) => {
      const sa = getSeverity(a.coverageState)
      const sb = getSeverity(b.coverageState)
      if (sa !== sb) return sa - sb
      return a.url.localeCompare(b.url)
    })

    return filtered
  }, [results, filter, search])

  const totalPages = Math.ceil(filteredResults.length / PAGE_SIZE)
  const pageResults = filteredResults.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Export action plan handler
  const handleExportActionPlan = useCallback(() => {
    const md = generateActionPlanMarkdown(results, siteUrl, redirectOverrides)
    let domain = 'site'
    try {
      domain = new URL(siteUrl).hostname.replace(/\./g, '-')
    } catch { /* use default */ }
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${domain}-indexing-action-plan.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [results, siteUrl, redirectOverrides])

  if (results.length === 0 && status !== 'completed') {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: '#6b7280', margin: 0 }}>
          {status === 'discovering'
            ? 'Discovering URLs from sitemaps and search analytics...'
            : status === 'inspecting'
            ? 'Inspecting URLs with the URL Inspection API. Results will appear here as batches complete. Refresh the page to see progress.'
            : status === 'failed'
            ? 'Audit failed. Check the error on the Overview tab.'
            : 'No results yet.'}
        </p>
      </div>
    )
  }

  if (results.length === 0 && status === 'completed') {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: '#6b7280', margin: 0 }}>
          No URLs were found to inspect. Check that the site has a sitemap and pages in Search Console.
        </p>
      </div>
    )
  }

  const progressPct = totalUrls > 0 ? Math.round((inspectedCount / totalUrls) * 100) : 0
  const indexRate = inspectedCount > 0 ? Math.round((derivedCounts.healthyIndexed / inspectedCount) * 100) : 0

  // Build reason breakdown sorted by count
  const reasonEntries = Object.entries(summaryStats.byReason || {}).sort((a, b) => b[1] - a[1])

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const hasActionableIssues = derivedCounts.indexed404s.length > 0 || derivedCounts.crawledNotIndexed.length > 0 || derivedCounts.unknownToGoogle.length > 0 || derivedCounts.duplicateRedirectIssues.length > 0

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Progress bar */}
      {status === 'inspecting' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span>Inspection Progress</span>
            <span>
              {inspectedCount.toLocaleString()} / {totalUrls.toLocaleString()} URLs ({progressPct}%)
            </span>
          </div>
          <div
            style={{
              height: 8,
              background: '#e5e7eb',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPct}%`,
                background: '#3b82f6',
                borderRadius: 4,
                transition: 'width 0.3s',
              }}
            />
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 0 0' }}>
            Remaining URLs are processed in batches via cron. Refresh the page to see updates.
          </p>
        </div>
      )}

      {/* Summary cards — 5 cards with derived counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <SummaryCard label="Healthy Indexed" value={derivedCounts.healthyIndexed} color="#22c55e" subtitle={`${indexRate}% index rate`} />
        <SummaryCard label="Indexed — Needs Fix" value={derivedCounts.indexedProblematic} color={derivedCounts.indexedProblematic > 0 ? '#ef4444' : '#6b7280'} subtitle={derivedCounts.indexedProblematic > 0 ? 'Indexed but broken' : 'None found'} />
        <SummaryCard label="Not Indexed" value={derivedCounts.notIndexed} color={derivedCounts.notIndexed > 0 ? '#f59e0b' : '#6b7280'} subtitle="Need attention" />
        <SummaryCard label="Errors" value={derivedCounts.errors} color={derivedCounts.errors > 0 ? '#f59e0b' : '#6b7280'} subtitle="Inspection failures" />
        <SummaryCard label="Total Inspected" value={inspectedCount} color="#6b7280" subtitle={`of ${totalUrls.toLocaleString()} discovered`} />
      </div>

      {/* Actionable Insights Panel */}
      {hasActionableIssues && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>⚡ Actionable Insights</h4>
            <button
              onClick={handleExportActionPlan}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid #3b82f6',
                background: '#3b82f6',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              📄 Export Action Plan
            </button>
          </div>

          {/* Section: Indexed 404s */}
          {derivedCounts.indexed404s.length > 0 && (
            <div style={{ borderBottom: '1px solid #e5e7eb' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', cursor: 'pointer', background: expandedSections.indexed404s ? '#fef2f2' : '#fff' }}
                onClick={() => toggleSection('indexed404s')}
              >
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{expandedSections.indexed404s ? '▼' : '▶'}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>🔴 Indexed 404s — Need Redirects</span>
                <span style={{ padding: '2px 8px', borderRadius: 10, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 600 }}>
                  {derivedCounts.indexed404s.length}
                </span>
                <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>
                  Google indexed these pages but they return 404
                </span>
              </div>
              {expandedSections.indexed404s && (
                <div style={{ padding: '8px 16px 12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>404 Page</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Suggested Redirect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {derivedCounts.indexed404s.map((r) => {
                        const suggestion = redirectOverrides[r.url] ?? getRedirectSuggestion(r.url, derivedCounts.healthyUrls)
                        return (
                          <tr key={r.url} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '6px 8px' }}>
                              <span style={{ color: '#991b1b', fontFamily: 'monospace', fontSize: 12 }}>{stripOrigin(r.url)}</span>
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="text"
                                value={suggestion}
                                onChange={(e) => setRedirectOverrides((prev) => ({ ...prev, [r.url]: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  width: '100%',
                                  padding: '3px 8px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  fontFamily: 'monospace',
                                  color: redirectOverrides[r.url] ? '#166534' : '#6b7280',
                                }}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Section: Crawled but Not Indexed */}
          {derivedCounts.crawledNotIndexed.length > 0 && (
            <div style={{ borderBottom: '1px solid #e5e7eb' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', cursor: 'pointer' }}
                onClick={() => toggleSection('crawledNotIndexed')}
              >
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{expandedSections.crawledNotIndexed ? '▼' : '▶'}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>🟠 Crawled but Not Indexed</span>
                <span style={{ padding: '2px 8px', borderRadius: 10, background: '#fff7ed', color: '#92400e', fontSize: 12, fontWeight: 600 }}>
                  {derivedCounts.crawledNotIndexed.length}
                </span>
                <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>
                  Improve content quality and internal linking
                </span>
              </div>
              {expandedSections.crawledNotIndexed && (
                <div style={{ padding: '4px 16px 12px', fontSize: 12 }}>
                  <p style={{ margin: '0 0 8px', color: '#6b7280' }}>
                    Google crawled these pages but chose not to index them. To fix: improve content quality, add internal links pointing to these pages, and ensure each provides unique value.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {derivedCounts.crawledNotIndexed.map((r) => (
                      <div key={r.url} style={{ fontFamily: 'monospace', color: '#374151' }}>{stripOrigin(r.url)}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section: Unknown to Google */}
          {derivedCounts.unknownToGoogle.length > 0 && (
            <div style={{ borderBottom: '1px solid #e5e7eb' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', cursor: 'pointer' }}
                onClick={() => toggleSection('unknownToGoogle')}
              >
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{expandedSections.unknownToGoogle ? '▼' : '▶'}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>🟠 Unknown to Google</span>
                <span style={{ padding: '2px 8px', borderRadius: 10, background: '#fff7ed', color: '#92400e', fontSize: 12, fontWeight: 600 }}>
                  {derivedCounts.unknownToGoogle.length}
                </span>
                <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>
                  Submit sitemap or request indexing
                </span>
              </div>
              {expandedSections.unknownToGoogle && (
                <div style={{ padding: '4px 16px 12px', fontSize: 12 }}>
                  <p style={{ margin: '0 0 8px', color: '#6b7280' }}>
                    Google doesn&apos;t know about these pages or hasn&apos;t crawled them yet. To fix: submit your sitemap in Search Console, add internal links to these pages, or use &quot;Request Indexing&quot; in Search Console.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {derivedCounts.unknownToGoogle.map((r) => (
                      <div key={r.url} style={{ fontFamily: 'monospace', color: '#374151' }}>{stripOrigin(r.url)}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section: Duplicate / Redirect Issues */}
          {derivedCounts.duplicateRedirectIssues.length > 0 && (
            <div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', cursor: 'pointer' }}
                onClick={() => toggleSection('duplicateRedirect')}
              >
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{expandedSections.duplicateRedirect ? '▼' : '▶'}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>🟡 Duplicate / Redirect Issues</span>
                <span style={{ padding: '2px 8px', borderRadius: 10, background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 600 }}>
                  {derivedCounts.duplicateRedirectIssues.length}
                </span>
                <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>
                  Set canonical tags, fix redirect chains
                </span>
              </div>
              {expandedSections.duplicateRedirect && (
                <div style={{ padding: '4px 16px 12px', fontSize: 12 }}>
                  <p style={{ margin: '0 0 8px', color: '#6b7280' }}>
                    These pages have duplicate content or redirect issues. To fix: set canonical tags to tell Google which version to index, fix redirect chains, and consolidate duplicate content.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {derivedCounts.duplicateRedirectIssues.map((r) => (
                      <div key={r.url} style={{ fontFamily: 'monospace', color: '#374151' }}>
                        {stripOrigin(r.url)} — <span style={{ color: '#6b7280' }}>{COVERAGE_LABELS[r.coverageState] || r.coverageState}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reason breakdown with explanations */}
      {reasonEntries.length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Why Pages Are Not Indexed</h4>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b7280' }}>
            Click a reason to filter the URL list below
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Issue</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>What It Means</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, width: 70 }}>Pages</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, width: 60 }}>%</th>
              </tr>
            </thead>
            <tbody>
              {reasonEntries.map(([reason, count]) => (
                <tr
                  key={reason}
                  style={{
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    background: filter === reason ? '#f0f9ff' : 'transparent',
                  }}
                  onClick={() => { setFilter(filter === reason ? 'not_indexed' : reason); setPage(0) }}
                >
                  <td style={{ padding: '6px 8px', fontWeight: 500 }}>
                    <StatusBadge coverageState={reason} />
                  </td>
                  <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: 12 }}>
                    {getShortAdvice(reason)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>{count}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280' }}>
                    {inspectedCount > 0 ? ((count / inspectedCount) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filter bar + search */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {(['not_indexed', 'all', 'indexed', 'indexed_issues', 'errors'] as FilterMode[]).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(0) }}
            style={{
              padding: '4px 12px',
              borderRadius: 4,
              border: '1px solid #d1d5db',
              background: filter === f ? '#1e293b' : '#fff',
              color: filter === f ? '#fff' : '#374151',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: filter === f ? 600 : 400,
            }}
          >
            {f === 'all'
              ? `All (${results.length})`
              : f === 'indexed'
              ? `Healthy Indexed (${derivedCounts.healthyIndexed})`
              : f === 'indexed_issues'
              ? `Indexed Issues (${derivedCounts.indexedProblematic})`
              : f === 'not_indexed'
              ? `Not Indexed (${derivedCounts.notIndexed})`
              : `Errors (${derivedCounts.errors})`}
          </button>
        ))}
        {typeof filter === 'string' && !['all', 'indexed', 'not_indexed', 'errors', 'indexed_issues'].includes(filter) && (
          <button
            onClick={() => { setFilter('not_indexed'); setPage(0) }}
            style={{
              padding: '4px 12px',
              borderRadius: 4,
              border: '1px solid #3b82f6',
              background: '#eff6ff',
              color: '#1d4ed8',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Filtering: {COVERAGE_LABELS[filter] || filter} &times;
          </button>
        )}
        <input
          type="text"
          placeholder="Search URLs..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          style={{
            marginLeft: 'auto',
            padding: '4px 10px',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            fontSize: 13,
            width: 220,
          }}
        />
      </div>

      {/* Results count */}
      <div style={{ fontSize: 12, color: '#6b7280' }}>
        Showing {filteredResults.length} page{filteredResults.length !== 1 ? 's' : ''}
        {filter !== 'all' ? ` (filtered from ${results.length} total)` : ''}
      </div>

      {/* URL table */}
      {pageResults.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>Page</th>
                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, width: 180 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, width: 110 }}>Last Crawl</th>
                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, width: 90 }}>Crawled As</th>
              </tr>
            </thead>
            <tbody>
              {pageResults.map((r, i) => {
                const isExpanded = expandedUrl === r.url + i
                return (
                  <UrlRow
                    key={r.url + i}
                    result={r}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedUrl(isExpanded ? null : r.url + i)}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageResults.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
          {filter === 'not_indexed' && derivedCounts.notIndexed === 0
            ? 'All inspected pages are indexed. No issues found.'
            : 'No pages match the current filter.'}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 4, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}
          >
            Prev
          </button>
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
            style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 4, cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.5 : 1 }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

/** Expandable URL row with details panel */
function UrlRow({ result: r, isExpanded, onToggle }: { result: InspectionResult; isExpanded: boolean; onToggle: () => void }) {
  const advice = COVERAGE_ADVICE[r.coverageState]
  const isIndexedProblematic = r.coverageState === 'Submitted and indexed' && r.pageFetchState && PROBLEMATIC_FETCH_STATES.has(r.pageFetchState)

  return (
    <>
      <tr
        style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
        onClick={onToggle}
        title="Click to see details and recommended action"
      >
        <td style={{ padding: '6px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>{isExpanded ? '\u25BC' : '\u25B6'}</span>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                color: '#2563eb',
                textDecoration: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 400,
                display: 'block',
              }}
              title={r.url}
            >
              {stripOrigin(r.url)}
            </a>
          </div>
        </td>
        <td style={{ padding: '6px 8px' }}>
          <StatusBadge coverageState={r.coverageState} pageFetchState={r.pageFetchState} />
        </td>
        <td style={{ padding: '6px 8px', color: '#6b7280' }}>
          {r.lastCrawlTime ? formatDate(r.lastCrawlTime) : 'Never'}
        </td>
        <td style={{ padding: '6px 8px', color: '#6b7280' }}>{r.crawledAs || '-'}</td>
      </tr>
      {isExpanded && (
        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
          <td colSpan={4} style={{ padding: '0' }}>
            <div style={{ padding: '12px 16px 12px 28px', background: '#f9fafb', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Advice box */}
              {(advice || isIndexedProblematic) && (
                <div style={{
                  padding: '10px 12px',
                  background: isIndexedProblematic ? '#fef2f2' : r.coverageState === 'Submitted and indexed' ? '#f0fdf4' : '#fff7ed',
                  border: `1px solid ${isIndexedProblematic ? '#fecaca' : r.coverageState === 'Submitted and indexed' ? '#bbf7d0' : '#fed7aa'}`,
                  borderRadius: 6,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}>
                  <strong style={{ fontSize: 12, textTransform: 'uppercase', color: isIndexedProblematic ? '#991b1b' : '#92400e', letterSpacing: '0.5px' }}>
                    {isIndexedProblematic ? '⚠️ Urgent — Indexed but Broken' : 'Recommended Action'}
                  </strong>
                  <div style={{ marginTop: 4 }}>
                    {isIndexedProblematic
                      ? `This page is indexed by Google but returns a ${formatFetchState(r.pageFetchState)} error. Google is sending visitors to a broken page. Set up a 301 redirect to a relevant page or fix the underlying issue.`
                      : advice}
                  </div>
                </div>
              )}

              {/* Details grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: 12 }}>
                <DetailRow label="Full URL" value={r.url} isLink />
                <DetailRow label="Google Status" value={r.coverageState} />
                <DetailRow label="Page Fetch" value={formatFetchState(r.pageFetchState)} />
                <DetailRow label="Robots.txt" value={formatRobotsTxt(r.robotsTxtState)} />
                <DetailRow label="Indexing" value={formatIndexingState(r.indexingState)} />
                <DetailRow label="Crawled As" value={r.crawledAs || 'N/A'} />
                <DetailRow label="Last Crawl" value={r.lastCrawlTime ? new Date(r.lastCrawlTime).toLocaleString() : 'Never crawled'} />
                <DetailRow label="Inspected" value={r.inspectedAt ? new Date(r.inspectedAt).toLocaleString() : 'N/A'} />
              </div>

              {/* In sitemap? */}
              {r.sitemap && r.sitemap.length > 0 && (
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: '#6b7280', fontWeight: 500 }}>Found in sitemap: </span>
                  <span style={{ color: '#374151' }}>{r.sitemap.join(', ')}</span>
                </div>
              )}

              {/* Referring URLs */}
              {r.referringUrls && r.referringUrls.length > 0 && (
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: '#6b7280', fontWeight: 500 }}>Referring URLs: </span>
                  <span style={{ color: '#374151' }}>{r.referringUrls.join(', ')}</span>
                </div>
              )}

              {/* Error message */}
              {r.error && (
                <div style={{ fontSize: 12, color: '#dc2626' }}>
                  <strong>Error: </strong>{r.error}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function DetailRow({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '2px 0' }}>
      <span style={{ color: '#6b7280', fontWeight: 500, minWidth: 90, flexShrink: 0 }}>{label}:</span>
      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#2563eb', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {value}
        </a>
      ) : (
        <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color, subtitle }: { label: string; value: number; color: string; subtitle?: string }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
      {subtitle && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{subtitle}</div>}
    </div>
  )
}

/** Labels for problematic fetch states when page is indexed */
const FETCH_STATE_LABELS: Record<string, string> = {
  NOT_FOUND: 'Indexed (404)',
  SOFT_404: 'Indexed (Soft 404)',
  SERVER_ERROR: 'Indexed (Server Error)',
  REDIRECT_ERROR: 'Indexed (Redirect Error)',
  ACCESS_DENIED: 'Indexed (Access Denied)',
  ACCESS_FORBIDDEN: 'Indexed (Forbidden)',
  BLOCKED_4XX: 'Indexed (4xx Error)',
  BLOCKED_ROBOTS_TXT: 'Indexed (Robots Blocked)',
}

function StatusBadge({ coverageState, pageFetchState }: { coverageState: string; pageFetchState?: string }) {
  let bg = '#fef3c7'
  let color = '#92400e'
  let label = COVERAGE_LABELS[coverageState] || coverageState

  // Check for indexed-but-problematic pages
  if (coverageState === 'Submitted and indexed' && pageFetchState && PROBLEMATIC_FETCH_STATES.has(pageFetchState)) {
    label = FETCH_STATE_LABELS[pageFetchState] || `Indexed (${pageFetchState})`
    bg = '#fee2e2'
    color = '#991b1b'
  } else if (coverageState === 'Submitted and indexed') {
    bg = '#dcfce7'
    color = '#166534'
  } else if (coverageState === 'inspection_failed') {
    bg = '#fee2e2'
    color = '#991b1b'
  } else if (
    coverageState.includes('404') ||
    coverageState.includes('5xx') ||
    coverageState.includes('401') ||
    coverageState.includes('4xx')
  ) {
    bg = '#fee2e2'
    color = '#991b1b'
  } else if (
    coverageState.includes('noindex') ||
    coverageState.includes('robots.txt')
  ) {
    bg = '#e0e7ff'
    color = '#3730a3'
  } else if (coverageState.includes('Duplicate') || coverageState.includes('Alternate')) {
    bg = '#f3e8ff'
    color = '#6b21a8'
  } else if (coverageState.includes('redirect')) {
    bg = '#fef3c7'
    color = '#92400e'
  }

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        background: bg,
        color,
        whiteSpace: 'nowrap',
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  )
}

/** Short one-liner for the breakdown table */
function getShortAdvice(reason: string): string {
  const short: Record<string, string> = {
    'Crawled - currently not indexed': 'Improve content quality and internal linking',
    'Discovered - currently not indexed': 'Google hasn\'t crawled it yet, add internal links',
    'Page with redirect': 'Redirects to another URL, update links if unintended',
    'URL is unknown to Google': 'Submit sitemap or request indexing',
    'Excluded by noindex tag': 'Remove noindex tag to allow indexing',
    'Blocked by robots.txt': 'Update robots.txt to allow crawling',
    'Blocked due to unauthorized request (401)': 'Page requires auth, remove for public pages',
    'Not found (404)': 'Fix broken page or set up redirect',
    'Soft 404': 'Add meaningful content or return proper 404',
    'Blocked due to other 4xx issue': 'Fix client error preventing access',
    'Server error (5xx)': 'Fix server error, check logs',
    'Duplicate without user-selected canonical': 'Add canonical tag to preferred version',
    'Duplicate, Google chose different canonical than user': 'Review canonical tag setup',
    'Alternate page with proper canonical tag': 'No action needed, canonical is set',
    'Page indexed without content': 'Add content to the page',
  }
  return short[reason] || 'Review in Search Console'
}

function formatFetchState(state: string): string {
  if (!state) return 'N/A'
  const map: Record<string, string> = {
    SUCCESSFUL: 'Successful',
    SOFT_404: 'Soft 404',
    NOT_FOUND: 'Not Found (404)',
    BLOCKED_ROBOTS_TXT: 'Blocked by robots.txt',
    SERVER_ERROR: 'Server Error',
    REDIRECT_ERROR: 'Redirect Error',
    ACCESS_DENIED: 'Access Denied',
    ACCESS_FORBIDDEN: 'Forbidden',
    BLOCKED_4XX: 'Blocked (4xx)',
  }
  return map[state] || state
}

function formatRobotsTxt(state: string): string {
  if (!state) return 'N/A'
  const map: Record<string, string> = {
    ALLOWED: 'Allowed',
    DISALLOWED: 'Disallowed',
  }
  return map[state] || state
}

function formatIndexingState(state: string): string {
  if (!state) return 'N/A'
  const map: Record<string, string> = {
    INDEXING_ALLOWED: 'Allowed',
    BLOCKED_BY_META_TAG: 'Blocked by meta tag',
    BLOCKED_BY_HTTP_HEADER: 'Blocked by HTTP header',
    BLOCKED_BY_ROBOTS_TXT: 'Blocked by robots.txt',
  }
  return map[state] || state
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  return d.toLocaleDateString()
}

function stripOrigin(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return url
  }
}
