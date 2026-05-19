'use client'

/**
 * Per-client "Tools" tab — consolidated integration status for:
 *   • Google Analytics 4
 *   • Google Search Console
 *   • Google Ads
 *   • Meta Ads
 *
 * Auth model
 * ----------
 * All four integrations use ONE shared agency-level Google/Meta account that
 * has been granted access to each client's GA4 property, GSC site, Google Ads
 * customer (via MCC), and Meta Business Manager. The OAuth grant itself lives
 * elsewhere (admin-only Integrations page). This tab only:
 *   1. shows the client-scoped account/property ID (read-only, sourced from
 *      the canonical fields on the Clients collection),
 *   2. renders a connection-status badge,
 *   3. provides a "Test connection" button that calls a per-integration
 *      status route to verify the agency credentials can actually read this
 *      client's data.
 *
 * Gmail is intentionally excluded — it remains per-user OAuth and is managed
 * elsewhere.
 */

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useCallback, useState } from 'react'

type Status = 'idle' | 'checking' | 'ok' | 'missing' | 'error'

type IntegrationResult = {
  status: Status
  message?: string
}

type IntegrationKey = 'ga4' | 'gsc' | 'googleAds' | 'metaAds'

const INTEGRATIONS: Array<{
  key: IntegrationKey
  name: string
  idLabel: string
  idFieldPath: string
  emptyHint: string
}> = [
  {
    key: 'ga4',
    name: 'Google Analytics 4',
    idLabel: 'GA4 Property ID',
    idFieldPath: 'ga4PropertyId',
    emptyHint:
      'Set the numeric GA4 property ID on the Google Analytics tab to enable.',
  },
  {
    key: 'gsc',
    name: 'Google Search Console',
    idLabel: 'GSC Property',
    idFieldPath: 'gscSiteUrl',
    emptyHint:
      'Set the GSC property URL on the Search Console tab to enable.',
  },
  {
    key: 'googleAds',
    name: 'Google Ads',
    idLabel: 'Customer ID',
    idFieldPath: 'googleAdsCustomerId',
    emptyHint:
      'Set the Google Ads customer ID on the Business tab to enable.',
  },
  {
    key: 'metaAds',
    name: 'Meta Ads',
    idLabel: 'Ad Account ID',
    idFieldPath: 'metaAdAccountId',
    emptyHint:
      'Set the Meta Ads account ID below (act_XXXXXXXXX) to enable.',
  },
]

function useFieldValue(path: string): string {
  return useFormFields(([fields]) => {
    const v = fields?.[path]?.value
    return typeof v === 'string' ? v : ''
  })
}

function StatusBadge({ status }: { status: Status }) {
  const colors: Record<Status, { bg: string; fg: string; label: string }> = {
    idle: { bg: '#e5e7eb', fg: '#374151', label: 'Not tested' },
    checking: { bg: '#dbeafe', fg: '#1e40af', label: 'Checking…' },
    ok: { bg: '#d1fae5', fg: '#065f46', label: 'Connected ✓' },
    missing: { bg: '#fef3c7', fg: '#92400e', label: 'Not configured' },
    error: { bg: '#fee2e2', fg: '#991b1b', label: 'Auth required' },
  }
  const c = colors[status]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        background: c.bg,
        color: c.fg,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {c.label}
    </span>
  )
}

function IntegrationRow({
  name,
  idLabel,
  idValue,
  emptyHint,
  result,
  onTest,
}: {
  name: string
  idLabel: string
  idValue: string
  emptyHint: string
  result: IntegrationResult
  onTest: () => void
}) {
  const hasId = idValue.trim().length > 0
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 12,
        padding: '16px 18px',
        border: '1px solid var(--theme-elevation-100, #e5e7eb)',
        borderRadius: 8,
        background: 'var(--theme-elevation-0, #fff)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 6,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>
          <StatusBadge status={result.status} />
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--theme-elevation-500, #6b7280)',
            fontFamily:
              hasId
                ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
                : 'inherit',
            fontStyle: hasId ? 'normal' : 'italic',
            wordBreak: 'break-all',
          }}
        >
          {hasId ? `${idLabel}: ${idValue}` : emptyHint}
        </div>
        {result.message ? (
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color:
                result.status === 'ok'
                  ? 'var(--theme-success-500, #059669)'
                  : 'var(--theme-error-500, #dc2626)',
            }}
          >
            {result.message}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          onClick={onTest}
          disabled={!hasId || result.status === 'checking'}
          style={{
            padding: '6px 14px',
            background: hasId ? '#2563eb' : '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: hasId && result.status !== 'checking' ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
          }}
        >
          {result.status === 'checking' ? 'Testing…' : 'Test connection'}
        </button>
      </div>
    </div>
  )
}

function ClientToolsTab() {
  const { id: clientId } = useDocumentInfo()
  // Hooks must run unconditionally and in stable order — call useFieldValue
  // once per integration at the top level, not inside a map callback.
  const ga4Id = useFieldValue('ga4PropertyId')
  const gscId = useFieldValue('gscSiteUrl')
  const googleAdsId = useFieldValue('googleAdsCustomerId')
  const metaAdsId = useFieldValue('metaAdAccountId')
  const idValues: Record<IntegrationKey, string> = {
    ga4: ga4Id,
    gsc: gscId,
    googleAds: googleAdsId,
    metaAds: metaAdsId,
  }

  const [results, setResults] = useState<Record<IntegrationKey, IntegrationResult>>({
    ga4: { status: 'idle' },
    gsc: { status: 'idle' },
    googleAds: { status: 'idle' },
    metaAds: { status: 'idle' },
  })

  const testIntegration = useCallback(
    async (key: IntegrationKey) => {
      if (!clientId) return
      setResults((prev) => ({ ...prev, [key]: { status: 'checking' } }))
      try {
        const res = await fetch(
          `/api/integrations/status/${key}?clientId=${encodeURIComponent(
            String(clientId),
          )}`,
        )
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          status?: Status
          message?: string
        }
        const status: Status = data.status ?? (data.ok ? 'ok' : 'error')
        setResults((prev) => ({
          ...prev,
          [key]: { status, message: data.message },
        }))
      } catch (err) {
        setResults((prev) => ({
          ...prev,
          [key]: {
            status: 'error',
            message: err instanceof Error ? err.message : 'Network error',
          },
        }))
      }
    },
    [clientId],
  )

  if (!clientId) {
    return (
      <div
        style={{
          padding: 16,
          fontSize: 13,
          color: 'var(--theme-elevation-500, #6b7280)',
          fontStyle: 'italic',
        }}
      >
        Save the client first to manage integrations.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          fontSize: 13,
          color: 'var(--theme-elevation-600, #4b5563)',
          lineHeight: 1.5,
        }}
      >
        All integrations below use a shared agency account that has been
        granted access to this client's properties. Use{' '}
        <strong>Test connection</strong> to verify the agency credentials can
        read this client's data. To grant or revoke agency-level OAuth, use
        the global Integrations page.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {INTEGRATIONS.map((cfg) => (
          <IntegrationRow
            key={cfg.key}
            name={cfg.name}
            idLabel={cfg.idLabel}
            idValue={idValues[cfg.key]}
            emptyHint={cfg.emptyHint}
            result={results[cfg.key]}
            onTest={() => testIntegration(cfg.key)}
          />
        ))}
      </div>
    </div>
  )
}

export default ClientToolsTab
