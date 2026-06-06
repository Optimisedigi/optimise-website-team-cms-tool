'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import { ConversionSplit } from './dashboards/googleads/ConversionSplit'
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

const GoogleAdsAuditConversions = () => {
  const { id } = useDocumentInfo()

  const [client, setClient] = useState<LinkedClient | null>(null)
  const [clientLoading, setClientLoading] = useState(true)
  const [clientError, setClientError] = useState<string | null>(null)

  const [splitTotals, setSplitTotals] = useState<ConversionSplitTotals>(null)
  const [splitByCampaign, setSplitByCampaign] = useState<ConversionSplitByCampaign>([])
  const [splitLoading, setSplitLoading] = useState(false)
  const [splitError, setSplitError] = useState<string | null>(null)

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
        <h3
          style={{
            margin: '0 0 8px',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--theme-elevation-800)',
          }}
        >
          Conversion Split
        </h3>
        {!client.slug ? (
          notice(
            'The linked client needs a slug before the conversion split can be loaded.',
          )
        ) : splitLoading ? (
          notice('Loading conversion split from Google Ads…')
        ) : splitError ? (
          notice(splitError)
        ) : splitTotals && splitTotals.categories.length > 0 ? (
          <ConversionSplit totals={splitTotals} byCampaign={splitByCampaign} />
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
