'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import GoogleAdsAuditConversionActionPicker from './GoogleAdsAuditConversionActionPicker'

/**
 * Google Ads Audit > Conversions tab.
 *
 * Surfaces (a) the conversion split/breakdown for the linked client and (b) the
 * Default Conversion Actions picker. Both depend on the audit having a linked
 * client; the split additionally needs the client to have a slug.
 */
type LinkedClient = {
  id: string | number
  slug?: string | null
  name?: string | null
}

type ConversionSplitTotals = {
  categories: Array<{ label: string; color: string }>
  totals: Record<string, number>
} | null

type ConversionSplitByCampaign = Array<{
  name: string
  byCategory: Record<string, number>
  total: number
}>

const notice = (children: React.ReactNode) => (
  <div
    style={{
      padding: '12px 16px',
      background: 'var(--theme-elevation-50)',
      border: '1px solid var(--theme-elevation-150)',
      borderRadius: 6,
      fontSize: 13,
      color: 'var(--theme-elevation-600)',
    }}
  >
    {children}
  </div>
)

function formatNumber(value: number): string {
  if (value >= 100) return Math.round(value).toLocaleString()
  return String(Math.round(value * 10) / 10)
}

function percentage(part: number, total: number): string {
  if (total <= 0) return '0%'
  return `${Math.round((part / total) * 100)}%`
}

const tableStyles = {
  wrapper: {
    overflowX: 'auto' as const,
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 8,
    background: 'var(--theme-elevation-0)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
  },
  th: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--theme-elevation-150)',
    background: 'var(--theme-elevation-50)',
    color: 'var(--theme-elevation-600)',
    fontWeight: 600,
    textAlign: 'left' as const,
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--theme-elevation-100)',
    color: 'var(--theme-elevation-800)',
    verticalAlign: 'top' as const,
  },
  number: {
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
  },
}

function AdminConversionSplit({
  totals,
  byCampaign,
}: {
  totals: ConversionSplitTotals
  byCampaign: ConversionSplitByCampaign
}) {
  if (!totals || totals.categories.length === 0) return null

  const grandTotal = Object.values(totals.totals).reduce((sum, value) => sum + value, 0)
  const configuredLabels = totals.categories.map((category) => category.label)
  const extraLabels = Object.keys(totals.totals).filter(
    (label) => !configuredLabels.includes(label),
  )
  const categoryLabels = [...configuredLabels, ...extraLabels]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: 18,
        background: 'var(--theme-elevation-0)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 10,
      }}
    >
      <div>
        <h3
          style={{
            margin: '0 0 4px',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--theme-elevation-900)',
          }}
        >
          Conversion Split
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--theme-elevation-600)' }}>
          By category, all time
        </p>
      </div>

      {grandTotal === 0 ? (
        notice('No conversions recorded against the configured categories.')
      ) : (
        <>
          <div style={{ maxWidth: 520 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>
              Summary by category
            </h4>
            <div style={tableStyles.wrapper}>
              <table style={tableStyles.table}>
                <thead>
                  <tr>
                    <th style={tableStyles.th}>Category</th>
                    <th style={{ ...tableStyles.th, ...tableStyles.number }}>Conversions</th>
                    <th style={{ ...tableStyles.th, ...tableStyles.number }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryLabels.map((label) => {
                    const value = totals.totals[label] || 0
                    return (
                      <tr key={label}>
                        <td style={tableStyles.td}>{label}</td>
                        <td style={{ ...tableStyles.td, ...tableStyles.number }}>
                          {formatNumber(value)}
                        </td>
                        <td style={{ ...tableStyles.td, ...tableStyles.number }}>
                          {percentage(value, grandTotal)} of total
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {byCampaign.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>
                Campaign breakdown (top {byCampaign.length})
              </h4>
              <div style={tableStyles.wrapper}>
                <table style={tableStyles.table}>
                  <thead>
                    <tr>
                      <th style={tableStyles.th}>Campaign</th>
                      {categoryLabels.map((label) => (
                        <th key={label} style={{ ...tableStyles.th, ...tableStyles.number }}>
                          {label}
                        </th>
                      ))}
                      <th style={{ ...tableStyles.th, ...tableStyles.number }}>Total</th>
                      <th style={{ ...tableStyles.th, ...tableStyles.number }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCampaign.map((campaign) => (
                      <tr key={campaign.name}>
                        <td style={{ ...tableStyles.td, minWidth: 260 }}>
                          {campaign.name}
                        </td>
                        {categoryLabels.map((label) => {
                          const value = campaign.byCategory[label] || 0
                          return (
                            <td key={label} style={{ ...tableStyles.td, ...tableStyles.number }}>
                              {value > 0 ? formatNumber(value) : '—'}
                            </td>
                          )
                        })}
                        <td
                          style={{
                            ...tableStyles.td,
                            ...tableStyles.number,
                            fontWeight: 600,
                          }}
                        >
                          {formatNumber(campaign.total)}
                        </td>
                        <td style={{ ...tableStyles.td, ...tableStyles.number }}>
                          {percentage(campaign.total, grandTotal)} of total
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const GoogleAdsAuditConversions = () => {
  const { id } = useDocumentInfo()

  const [client, setClient] = useState<LinkedClient | null>(null)
  const [clientLoading, setClientLoading] = useState(true)
  const [clientError, setClientError] = useState<string | null>(null)

  const [splitTotals, setSplitTotals] = useState<ConversionSplitTotals>(null)
  const [splitByCampaign, setSplitByCampaign] = useState<ConversionSplitByCampaign>([])
  const [splitLoading, setSplitLoading] = useState(false)
  const [splitError, setSplitError] = useState<string | null>(null)
  const [splitWarning, setSplitWarning] = useState<string | null>(null)
  // Resolve the linked client from the audit.
  useEffect(() => {
    if (!id) {
      setClientLoading(false)
      return
    }
    let cancelled = false

    const loadAudit = async () => {
      setClientLoading(true)
      setClientError(null)
      try {
        const res = await fetch(`/api/google-ads-audits/${id}?depth=1`, {
          credentials: 'include',
        })
        if (!res.ok) {
          if (!cancelled) setClientError(`Failed to load audit (${res.status})`)
          return
        }
        const audit = await res.json()
        if (cancelled) return
        const linked = audit?.client
        if (linked && typeof linked === 'object') {
          setClient({ id: linked.id, slug: linked.slug, name: linked.name })
        } else {
          setClient(null)
        }
      } catch (err) {
        if (!cancelled) {
          setClientError(err instanceof Error ? err.message : 'Fetch failed')
        }
      } finally {
        if (!cancelled) setClientLoading(false)
      }
    }

    loadAudit()
    return () => {
      cancelled = true
    }
  }, [id])

  // Fetch the conversion split once we have a client with a slug.
  useEffect(() => {
    if (!id || !client?.slug) return
    let cancelled = false

    const loadSplit = async () => {
      setSplitLoading(true)
      setSplitError(null)
      setSplitWarning(null)
      try {
        const res = await fetch(
          `/api/google-ads-audits/${id}/conversion-split`,
          { credentials: 'include' },
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          if (!cancelled) setSplitError(body.error || `Failed (${res.status})`)
          return
        }
        const data = await res.json()
        if (!cancelled) {
          setSplitTotals(data?.conversionSplit ?? null)
          setSplitByCampaign(
            Array.isArray(data?.conversionSplitByCampaign)
              ? data.conversionSplitByCampaign
              : [],
          )
          setSplitWarning(typeof data?.warning === 'string' ? data.warning : null)
        }
      } catch (err) {
        if (!cancelled) {
          setSplitError(err instanceof Error ? err.message : 'Fetch failed')
        }
      } finally {
        if (!cancelled) setSplitLoading(false)
      }
    }

    loadSplit()
    return () => {
      cancelled = true
    }
  }, [id, client?.slug])

  if (!id) {
    return notice('Save the audit first to manage conversions.')
  }

  if (clientLoading) {
    return notice('Loading conversion settings…')
  }

  if (clientError) {
    return notice(clientError)
  }

  if (!client) {
    return notice(
      <>
        This audit isn&apos;t linked to a client yet. Link a client on the{' '}
        <strong>Client Info</strong> tab to manage conversion actions and view
        the conversion split.
      </>,
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section>
        {!client.slug ? (
          notice(
            'The linked client needs a slug before the conversion split can be loaded.',
          )
        ) : splitLoading ? (
          notice('Loading conversion split from Google Ads…')
        ) : splitError ? (
          notice(splitError)
        ) : splitWarning ? (
          notice(splitWarning)
        ) : splitTotals && splitTotals.categories.length > 0 ? (
          <AdminConversionSplit totals={splitTotals} byCampaign={splitByCampaign} />
        ) : (
          notice('No conversion split data available for this client.')
        )}
      </section>

      <section>
        <GoogleAdsAuditConversionActionPicker clientId={String(client.id)} />
      </section>
    </div>
  )
}

export default GoogleAdsAuditConversions
