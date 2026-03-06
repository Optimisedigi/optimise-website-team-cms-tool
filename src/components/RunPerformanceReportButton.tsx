'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useState } from 'react'

interface ReportMetrics {
  totalSpend?: number
  conversions?: number
  cpa?: number
  impressions?: number
  clicks?: number
}

interface ReportResult {
  report: ReportMetrics & Record<string, any>
  emailHtml?: string
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const RunPerformanceReportButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReportResult | null>(null)

  // Default to previous month
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [year, setYear] = useState(prevMonth.getFullYear())
  const [month, setMonth] = useState(prevMonth.getMonth() + 1)

  if (!id) return null

  const performanceReportEnabled = fields?.['gadsAuto.performanceReportEnabled']?.value as boolean | undefined
  if (!performanceReportEnabled) return null

  const googleAdsCustomerId = fields?.googleAdsCustomerId?.value as string | undefined
  const hasCid = !!googleAdsCustomerId?.trim()

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(`/api/clients/${id}/performance-report`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Request failed (${res.status})`)
      }

      const data = await res.json()
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handlePreviewEmail = () => {
    if (!result?.emailHtml) return
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(result.emailHtml)
      win.document.close()
    }
  }

  const report = result?.report

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          style={selectStyle}
        >
          {MONTHS.map((name, i) => (
            <option key={i} value={i + 1}>{name}</option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={selectStyle}
        >
          {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleClick}
          disabled={loading || !hasCid}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: loading ? '#6b7280' : !hasCid ? '#9ca3af' : '#059669',
            color: '#fff',
            borderRadius: 8,
            border: 'none',
            fontWeight: 600,
            fontSize: 14,
            cursor: loading || !hasCid ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Generating Report...' : 'Generate Report'}
        </button>
      </div>

      {!hasCid && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Enter a Google Ads Customer ID first (Business tab).
        </p>
      )}

      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}

      {report && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <MetricCard label="Total Spend" value={report.totalSpend != null ? `$${report.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'} />
            <MetricCard label="Conversions" value={report.conversions?.toLocaleString() ?? '—'} />
            <MetricCard label="CPA" value={report.cpa != null ? `$${report.cpa.toFixed(2)}` : '—'} />
            <MetricCard label="Impressions" value={report.impressions?.toLocaleString() ?? '—'} />
            <MetricCard label="Clicks" value={report.clicks?.toLocaleString() ?? '—'} />
          </div>

          {result?.emailHtml && (
            <button
              type="button"
              onClick={handlePreviewEmail}
              style={{
                padding: '8px 16px',
                background: '#2563eb',
                color: '#fff',
                borderRadius: 6,
                border: 'none',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Preview Email
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <div style={{
    padding: '12px 16px',
    background: '#f9fafb',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    minWidth: 120,
  }}>
    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
  </div>
)

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 14,
  background: '#fff',
}

export default RunPerformanceReportButton
