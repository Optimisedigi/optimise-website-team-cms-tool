'use client'

import { type CSSProperties, useEffect, useState } from 'react'

interface UsageSummaryRow {
  model: 'gpt-realtime-mini' | 'gpt-realtime-2'
  calls: number
  durationSeconds: number
  estimatedCostAud: number
  rateAudPerHour: number
}

interface UsageSummary {
  periodStart: string
  calls: number
  durationSeconds: number
  estimatedCostAud: number
  exchangeRate?: { from: 'USD'; to: 'AUD'; rate: number }
  byModel: UsageSummaryRow[]
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins === 0 ? `${hours} hr` : `${hours} hr ${mins} min`
}

function formatAud(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)
}

const MODEL_LABELS: Record<UsageSummaryRow['model'], string> = {
  'gpt-realtime-mini': 'GPT Realtime Mini',
  'gpt-realtime-2': 'GPT Realtime 2',
}

const panelShellStyle: CSSProperties = {
  position: 'relative',
  zIndex: 0,
  isolation: 'isolate',
  contain: 'layout paint',
  boxSizing: 'border-box',
  width: '100%',
  clear: 'both',
  overflow: 'hidden',
  filter: 'none',
  backdropFilter: 'none',
}

export default function RealtimeVoiceUsagePanel() {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/optimate/realtime-usage', { credentials: 'include' })
        const data = (await res.json()) as UsageSummary & { error?: string }
        if (cancelled) return
        if (!res.ok) {
          setError(data.error || `Failed to load (${res.status})`)
          setSummary(null)
        } else {
          setSummary(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load voice usage')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section
      role="region"
      aria-label="Realtime voice cost tracker"
      style={{
        ...panelShellStyle,
        border: '1px solid var(--theme-elevation-150, #d1d5db)',
        borderRadius: 8,
        padding: 14,
        background: 'var(--theme-elevation-50, #f9fafb)',
        marginTop: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Realtime voice cost tracker</div>
          <div style={{ color: '#6b7280', fontSize: 12 }}>
            Month-to-date estimate from recorded call duration × model hourly rate, shown in AUD.
          </div>
        </div>
        {summary && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{formatAud(summary.estimatedCostAud)}</div>
            <div style={{ color: '#6b7280', fontSize: 11 }}>
              {summary.calls} calls · {formatDuration(summary.durationSeconds)}
            </div>
          </div>
        )}
      </div>

      {loading && <div style={{ fontSize: 12, color: '#6b7280' }}>Loading voice usage…</div>}
      {error && <div style={{ fontSize: 12, color: '#b91c1c' }}>{error}</div>}
      {summary && !loading && !error && (
        <div style={{ display: 'grid', gap: 8 }}>
          {summary.byModel.map((row) => (
            <div
              key={row.model}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
                borderTop: '1px solid var(--theme-elevation-150, #e5e7eb)',
                paddingTop: 8,
                fontSize: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{MODEL_LABELS[row.model]}</div>
                <div style={{ color: '#6b7280' }}>
                  {formatAud(row.rateAudPerHour)}/hr · {row.calls} calls · {formatDuration(row.durationSeconds)}
                </div>
              </div>
              <div style={{ fontWeight: 700 }}>{formatAud(row.estimatedCostAud)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
