import type { CSSProperties } from 'react'
import config from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { createLocalReq, getPayload } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import AdminStepNavSetter from '@/components/AdminStepNavSetter'
import { convertUsdToAud } from '@/lib/realtime/voice-costs'
import { getCustomViewActions, getVisibleEntities } from '@/lib/visible-entities'

function formatDuration(seconds: unknown): string {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0))
  const minutes = Math.round(totalSeconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins === 0 ? `${hours} hr` : `${hours} hr ${mins} min`
}

function formatAudFromUsd(value: unknown): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(convertUsdToAud(Number(value) || 0))
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const agentLabels: Record<string, string> = {
  'google-ads': 'Google Ads',
  email: 'Email',
  invoice: 'InvoiceMate',
}

const modelLabels: Record<string, string> = {
  'gpt-realtime-mini': 'Realtime Mini',
  'gpt-realtime-2': 'Realtime 2',
}

export default async function RealtimeVoiceUsagePage() {
  const payload = await getPayload({ config })
  const headers = await getHeaders()
  const { permissions, user } = await payload.auth({ headers })
  const req = await createLocalReq({ user: user ?? undefined }, payload)
  const visibleEntities = getVisibleEntities(payload, user)
  const viewActions = getCustomViewActions(payload)

  const rows = user
    ? await payload
        .find({
          collection: 'realtime-voice-usage' as never,
          limit: 20,
          sort: '-startedAt',
          depth: 1,
          overrideAccess: true,
        })
        .then((result) => result.docs as Array<Record<string, unknown>>)
        .catch(() => [])
    : []

  return (
    <DefaultTemplate
      i18n={req.i18n}
      payload={payload}
      permissions={permissions}
      req={req}
      user={user ?? undefined}
      viewActions={viewActions}
      visibleEntities={visibleEntities}
    >
      <AdminStepNavSetter items={[{ label: 'Realtime Voice Usage' }]} />
      <div className="gutter--left gutter--right" style={{ maxWidth: 1100 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: '0 0 6px' }}>Realtime Voice Usage</h1>
          <p style={{ margin: 0, color: 'var(--theme-elevation-500)' }}>
            Last 20 voice calls. Logs are created automatically when calls end.
          </p>
        </div>

        <div
          style={{
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 10,
            overflow: 'hidden',
            background: 'var(--theme-bg)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--theme-elevation-50)' }}>
                <th style={thStyle}>Started</th>
                <th style={thStyle}>Agent</th>
                <th style={thStyle}>Model</th>
                <th style={thStyle}>Call time</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Cost (AUD)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 18, color: 'var(--theme-elevation-500)' }}>
                    No voice calls recorded yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={String(row.id)} style={{ borderTop: '1px solid var(--theme-elevation-100)' }}>
                    <td style={tdStyle}>{formatDate(row.startedAt)}</td>
                    <td style={tdStyle}>{agentLabels[String(row.agent)] ?? String(row.agent ?? '—')}</td>
                    <td style={tdStyle}>{modelLabels[String(row.model)] ?? String(row.model ?? '—')}</td>
                    <td style={tdStyle}>{formatDuration(row.durationSeconds)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                      {formatAudFromUsd(row.estimatedCostUsd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DefaultTemplate>
  )
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  color: 'var(--theme-elevation-600)',
  fontWeight: 600,
  borderBottom: '1px solid var(--theme-elevation-150)',
}

const tdStyle: CSSProperties = {
  padding: '11px 12px',
  verticalAlign: 'middle',
}
