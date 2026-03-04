'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState, useMemo } from 'react'

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
  notIndexed: number
  byReason: Record<string, number>
}

type FilterMode = 'all' | 'indexed' | 'not_indexed' | 'errors'

const PAGE_SIZE = 50

export default function GscIndexingAuditResults() {
  const { initialData } = useDocumentInfo()
  const data = initialData as any

  const [filter, setFilter] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const results: InspectionResult[] = data?.inspectionResults || []
  const totalUrls: number = data?.totalUrls || 0
  const inspectedCount: number = data?.inspectedCount || 0
  const status: string = data?.status || 'discovering'
  const summaryStats: SummaryStats = data?.summaryStats || { indexed: 0, notIndexed: 0, byReason: {} }

  const filteredResults = useMemo(() => {
    let filtered = results

    if (filter === 'indexed') {
      filtered = filtered.filter((r) => r.coverageState === 'Submitted and indexed')
    } else if (filter === 'not_indexed') {
      filtered = filtered.filter(
        (r) => r.coverageState !== 'Submitted and indexed' && r.coverageState !== 'inspection_failed'
      )
    } else if (filter === 'errors') {
      filtered = filtered.filter((r) => r.coverageState === 'inspection_failed')
    }

    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter((r) => r.url.toLowerCase().includes(q))
    }

    return filtered
  }, [results, filter, search])

  const totalPages = Math.ceil(filteredResults.length / PAGE_SIZE)
  const pageResults = filteredResults.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (results.length === 0 && status !== 'completed') {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: '#6b7280', margin: 0 }}>
          {status === 'discovering'
            ? 'Discovering URLs...'
            : status === 'inspecting'
            ? 'Inspection in progress. Results will appear here as batches complete.'
            : status === 'failed'
            ? 'Audit failed. Check the error on the Overview tab.'
            : 'No results yet.'}
        </p>
      </div>
    )
  }

  const progressPct = totalUrls > 0 ? Math.round((inspectedCount / totalUrls) * 100) : 0
  const errorCount = results.filter((r) => r.coverageState === 'inspection_failed').length

  // Build reason breakdown sorted by count
  const reasonEntries = Object.entries(summaryStats.byReason || {}).sort((a, b) => b[1] - a[1])

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Progress bar */}
      {status === 'inspecting' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span>Progress</span>
            <span>
              {inspectedCount.toLocaleString()} / {totalUrls.toLocaleString()} ({progressPct}%)
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
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <SummaryCard label="Indexed" value={summaryStats.indexed} color="#22c55e" />
        <SummaryCard label="Not Indexed" value={summaryStats.notIndexed} color="#ef4444" />
        <SummaryCard label="Errors" value={errorCount} color="#f59e0b" />
      </div>

      {/* Reason breakdown */}
      {reasonEntries.length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Coverage Breakdown</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Reason</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, width: 80 }}>Count</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, width: 80 }}>%</th>
              </tr>
            </thead>
            <tbody>
              {reasonEntries.map(([reason, count]) => (
                <tr key={reason} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '6px 8px' }}>{reason}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>{count}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>
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
        {(['all', 'indexed', 'not_indexed', 'errors'] as FilterMode[]).map((f) => (
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
            }}
          >
            {f === 'all' ? 'All' : f === 'indexed' ? 'Indexed' : f === 'not_indexed' ? 'Not Indexed' : 'Errors'}
          </button>
        ))}
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
        Showing {filteredResults.length} of {results.length} results
      </div>

      {/* URL table */}
      {pageResults.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>URL Path</th>
                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, width: 200 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, width: 130 }}>Last Crawl</th>
                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, width: 100 }}>Crawled As</th>
              </tr>
            </thead>
            <tbody>
              {pageResults.map((r, i) => (
                <tr key={r.url + i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td
                    style={{
                      padding: '6px 8px',
                      maxWidth: 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={r.url}
                  >
                    {stripOrigin(r.url)}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <StatusBadge coverageState={r.coverageState} />
                  </td>
                  <td style={{ padding: '6px 8px', color: '#6b7280' }}>
                    {r.lastCrawlTime ? new Date(r.lastCrawlTime).toLocaleDateString() : '-'}
                  </td>
                  <td style={{ padding: '6px 8px', color: '#6b7280' }}>{r.crawledAs || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
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
    </div>
  )
}

function StatusBadge({ coverageState }: { coverageState: string }) {
  let bg = '#fef3c7'
  let color = '#92400e'

  if (coverageState === 'Submitted and indexed') {
    bg = '#dcfce7'
    color = '#166534'
  } else if (coverageState === 'inspection_failed') {
    bg = '#fee2e2'
    color = '#991b1b'
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
      }}
    >
      {coverageState === 'Submitted and indexed'
        ? 'Indexed'
        : coverageState === 'inspection_failed'
        ? 'Error'
        : coverageState}
    </span>
  )
}

function stripOrigin(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return url
  }
}
