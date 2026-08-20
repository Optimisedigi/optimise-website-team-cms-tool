'use client'

/**
 * Per-client "Integrations" tab — consolidated status + connect/reconnect for:
 *   • Google Analytics 4   (shared agency OAuth — test only)
 *   • Google Search Console (per-client OAuth — Connect / Reconnect / Disconnect)
 *   • Google Ads           (brokered via Growth Tools MCC — test only)
 *   • Meta Ads             (API not wired yet — test validates format only)
 *
 * GSC is the only integration with per-client OAuth tokens stored on the
 * Client doc (`gscAccessToken` / `gscRefreshToken` / `gscPropertyUrl` /
 * `gscConnected`). Connect/reconnect kicks off `/api/gsc/connect`, which
 * redirects back to the admin after Google completes the OAuth dance.
 *
 * Gmail is intentionally excluded — it remains per-user OAuth and is managed
 * elsewhere.
 */

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

type Status = 'idle' | 'checking' | 'ok' | 'missing' | 'error'

type IntegrationResult = {
  status: Status
  message?: string
}

type IntegrationKey = 'ga4' | 'gsc' | 'googleAds' | 'metaAds'

type OAuthProvider = 'ga4' | 'gsc'

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
    emptyHint: 'Set the numeric GA4 property ID above, then save, to enable.',
  },
  {
    key: 'gsc',
    name: 'Google Search Console',
    idLabel: 'GSC Property',
    idFieldPath: 'gscPropertyUrl',
    emptyHint:
      'Connect this client to Google Search Console to populate the property URL.',
  },
  {
    key: 'googleAds',
    name: 'Google Ads',
    idLabel: 'Customer ID',
    idFieldPath: 'googleAdsCustomerId',
    emptyHint: 'Set the Google Ads customer ID above, then save, to enable.',
  },
  {
    key: 'metaAds',
    name: 'Meta Ads',
    idLabel: 'Ad Account ID',
    idFieldPath: 'metaAdAccountId',
    emptyHint: 'Set the Meta Ads account ID above (act_XXXXXXXXX), then save, to enable.',
  },
]

function useFieldValue(path: string): string {
  return useFormFields(([fields]) => {
    const v = fields?.[path]?.value
    return typeof v === 'string' ? v : ''
  })
}

/**
 * The value currently saved on the document, not the one being typed.
 *
 * Test connection runs server-side against the saved doc, so showing the live
 * form value here made the panel contradict itself — "Customer ID: 4894896666"
 * directly above "No Google Ads customer ID set." Reading `initialValue` keeps
 * the panel showing exactly what the server will see.
 */
function useSavedFieldValue(path: string): string {
  return useFormFields(([fields]) => {
    const v = fields?.[path]?.initialValue
    return typeof v === 'string' ? v : ''
  })
}

function useBoolFieldValue(path: string): boolean {
  return useFormFields(([fields]) => {
    const v = fields?.[path]?.value
    return Boolean(v)
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

type ActionButton = {
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
  /**
   * Set on actions that read the saved ID, so an unsaved edit blocks them.
   * Disconnect and Reconnect deliberately leave this off — they act on the
   * stored OAuth grant, not the field being typed, and gating them would trap
   * a user who merely touched the ID input.
   */
  blockedByUnsaved?: boolean
}

function buttonStyle(
  variant: ActionButton['variant'] = 'primary',
  disabled = false,
): React.CSSProperties {
  const palette: Record<NonNullable<ActionButton['variant']>, string> = {
    primary: '#2563eb',
    secondary: '#6b7280',
    danger: '#dc2626',
  }
  const bg = disabled ? '#9ca3af' : palette[variant]
  return {
    padding: '6px 14px',
    background: bg,
    color: 'white',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }
}

function IntegrationRow({
  name,
  idLabel,
  idValue,
  unsaved = false,
  emptyHint,
  result,
  actions,
}: {
  name: string
  idLabel: string
  idValue: string
  unsaved?: boolean
  emptyHint: string
  result: IntegrationResult
  actions: ActionButton[]
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
            // break-all keeps long IDs and GSC URLs inside the card, but it
            // shreds the prose hints mid-word ("Con sole") at narrow widths.
            wordBreak: hasId ? 'break-all' : 'normal',
            overflowWrap: 'anywhere',
          }}
        >
          {hasId ? `${idLabel}: ${idValue}` : emptyHint}
        </div>
        {unsaved ? (
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--theme-warning-500, #b45309)',
            }}
          >
            Unsaved change above — press Save before testing, or the test will
            still use the value shown here.
          </div>
        ) : null}
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}
      >
        {actions.map((action) => {
          const blocked = Boolean(action.blockedByUnsaved && unsaved)
          const isDisabled = Boolean(action.disabled) || blocked
          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              disabled={isDisabled}
              style={buttonStyle(action.variant, isDisabled)}
              title={blocked ? 'Save the client first — this runs against saved data.' : undefined}
            >
              {action.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ClientToolsTab() {
  const { id: clientId } = useDocumentInfo()
  // Hooks must run unconditionally and in stable order — call useFieldValue
  // once per integration at the top level, not inside a map callback.
  // Saved values drive the panel; live values only tell us an edit is pending.
  const ga4Id = useSavedFieldValue('ga4PropertyId')
  const gscId = useSavedFieldValue('gscPropertyUrl')
  const ga4Connected = useBoolFieldValue('ga4Connected')
  const gscConnected = useBoolFieldValue('gscConnected')
  const dispatchFields = useFormFields(([, dispatch]) => dispatch)
  const googleAdsId = useSavedFieldValue('googleAdsCustomerId')
  const metaAdsId = useSavedFieldValue('metaAdAccountId')
  const idValues: Record<IntegrationKey, string> = {
    ga4: ga4Id,
    gsc: gscId,
    googleAds: googleAdsId,
    metaAds: metaAdsId,
  }

  const ga4Draft = useFieldValue('ga4PropertyId')
  const gscDraft = useFieldValue('gscPropertyUrl')
  const googleAdsDraft = useFieldValue('googleAdsCustomerId')
  const metaAdsDraft = useFieldValue('metaAdAccountId')
  // An ID typed but not saved yet is invisible to the server-side test, so say
  // so instead of testing a value the server cannot see.
  const unsavedIds: Record<IntegrationKey, boolean> = {
    ga4: ga4Draft.trim() !== ga4Id.trim(),
    gsc: gscDraft.trim() !== gscId.trim(),
    googleAds: googleAdsDraft.trim() !== googleAdsId.trim(),
    metaAds: metaAdsDraft.trim() !== metaAdsId.trim(),
  }

  const [results, setResults] = useState<Record<IntegrationKey, IntegrationResult>>({
    ga4: { status: 'idle' },
    gsc: { status: 'idle' },
    googleAds: { status: 'idle' },
    metaAds: { status: 'idle' },
  })
  const [disconnecting, setDisconnecting] = useState<Record<OAuthProvider, boolean>>({
    ga4: false,
    gsc: false,
  })
  const [oauthConnectedOverride, setOauthConnectedOverride] = useState<Record<OAuthProvider, boolean>>({
    ga4: false,
    gsc: false,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    const params = new URLSearchParams(window.location.search)
    const ga4Error = params.get('ga4_error')
    if (ga4Error) {
      setResults((prev) => ({
        ...prev,
        ga4: {
          status: 'error',
          message: decodeURIComponent(ga4Error),
        },
      }))
    } else if (params.get('ga4_connected') === '1') {
      dispatchFields({ path: 'ga4Connected', type: 'UPDATE', value: true })
      setOauthConnectedOverride((prev) => ({ ...prev, ga4: true }))
      setResults((prev) => ({
        ...prev,
        ga4: {
          status: 'ok',
          message: 'OAuth completed. You can now test the GA4 connection.',
        },
      }))
    }

    const loadStoredStatus = async () => {
      if (!clientId) return
      try {
        const res = await fetch(
          `/api/clients/${encodeURIComponent(String(clientId))}/integrations`,
          { credentials: 'include' },
        )
        if (!res.ok) return
        const currentClient = (await res.json()) as {
          ga4Connected?: boolean
          gscConnected?: boolean
        }
        if (cancelled) return
        setOauthConnectedOverride((prev) => ({
          ga4: Boolean(currentClient.ga4Connected) || prev.ga4,
          gsc: Boolean(currentClient.gscConnected) || prev.gsc,
        }))
      } catch {
        // The form fields still provide a best-effort fallback.
      }
    }

    void loadStoredStatus()

    return () => {
      cancelled = true
    }
  }, [clientId, dispatchFields])

  const effectiveGa4Connected = ga4Connected || oauthConnectedOverride.ga4
  const effectiveGscConnected = gscConnected || oauthConnectedOverride.gsc

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

  const connectOAuth = useCallback(
    (provider: OAuthProvider) => {
      if (!clientId) return
      // Full-page navigation kicks off Google's OAuth flow and redirects back
      // to the admin once tokens are written.
      window.location.href = `/api/${provider}/connect?clientId=${encodeURIComponent(String(clientId))}`
    },
    [clientId],
  )

  const disconnectOAuth = useCallback(
    async (provider: OAuthProvider) => {
      if (!clientId || disconnecting[provider]) return
      const label = provider === 'ga4' ? 'Google Analytics 4' : 'Google Search Console'
      if (typeof window !== 'undefined') {
        const ok = window.confirm(
          `Disconnect ${label} for this client? Existing snapshots are kept; new pulls will stop until you reconnect.`,
        )
        if (!ok) return
      }
      setDisconnecting((prev) => ({ ...prev, [provider]: true }))
      try {
        const res = await fetch(`/api/${provider}/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        })
        if (!res.ok) {
          setResults((prev) => ({
            ...prev,
            [provider]: { status: 'error', message: 'Disconnect failed — try again.' },
          }))
          return
        }
        // Reload the doc so the form picks up the cleared connection fields.
        if (typeof window !== 'undefined') window.location.reload()
      } catch (err) {
        setResults((prev) => ({
          ...prev,
          [provider]: {
            status: 'error',
            message: err instanceof Error ? err.message : 'Network error',
          },
        }))
      } finally {
        setDisconnecting((prev) => ({ ...prev, [provider]: false }))
      }
    },
    [clientId, disconnecting],
  )

  const actionsFor = useCallback(
    (key: IntegrationKey): ActionButton[] => {
      const hasId = idValues[key].trim().length > 0
      const checking = results[key].status === 'checking'

      if (key === 'ga4' || key === 'gsc') {
        const connected = key === 'ga4' ? effectiveGa4Connected : effectiveGscConnected
        const isDisconnecting = disconnecting[key]
        const buttons: ActionButton[] = [
          {
            label: connected ? 'Reconnect' : 'Connect',
            onClick: () => connectOAuth(key),
            variant: 'primary',
            disabled: !clientId || (key === 'ga4' && !hasId),
            // GA4 OAuth reads the saved property ID; GSC's does not.
            blockedByUnsaved: key === 'ga4',
          },
        ]
        if (connected) {
          buttons.push({
            label: checking ? 'Testing…' : 'Test connection',
            onClick: () => testIntegration(key),
            variant: 'secondary',
            disabled: !hasId || checking,
            blockedByUnsaved: true,
          })
          buttons.push({
            label: isDisconnecting ? 'Disconnecting…' : 'Disconnect',
            onClick: () => disconnectOAuth(key),
            variant: 'danger',
            disabled: isDisconnecting,
          })
        }
        return buttons
      }

      // Google Ads / Meta Ads — test only.
      return [
        {
          label: checking ? 'Testing…' : 'Test connection',
          onClick: () => testIntegration(key),
          variant: 'primary',
          disabled: !hasId || checking,
          blockedByUnsaved: true,
        },
      ]
    },
    [
      clientId,
      connectOAuth,
      disconnectOAuth,
      disconnecting,
      effectiveGa4Connected,
      effectiveGscConnected,
      idValues,
      results,
      testIntegration,
    ],
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
        Manage client-level auth here: <strong>GA4</strong> and <strong>GSC</strong>{' '}
        use per-client Google OAuth — Connect or Reconnect below, then Test
        connection to verify access. <strong>Google Ads</strong> and <strong>Meta Ads</strong>{' '}
        use agency/platform access; Test connection validates the configured IDs.
        The global Integrations page still works for cross-client management.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {INTEGRATIONS.map((cfg) => (
          <IntegrationRow
            key={cfg.key}
            name={cfg.name}
            idLabel={cfg.idLabel}
            idValue={idValues[cfg.key]}
            unsaved={unsavedIds[cfg.key]}
            emptyHint={cfg.emptyHint}
            result={results[cfg.key]}
            actions={actionsFor(cfg.key)}
          />
        ))}
      </div>
    </div>
  )
}

export default ClientToolsTab
