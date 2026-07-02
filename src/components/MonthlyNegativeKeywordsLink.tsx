'use client'

import { useAllFormFields, useAuth, useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import { MonthlyKeywordSelection } from './MonthlyKeywordSelection'
import { relationshipId, type MonthlyNegativeKeywordsRelationshipValue } from './monthly-negative-keywords-relationship'

type ClientLinkData = {
  clientId: string
  slug: string
  customerId: string
  monthlyNegativeKeywordsEnabled: boolean
}

export default function MonthlyNegativeKeywordsLink() {
  const { id } = useDocumentInfo()
  const { user } = useAuth()
  const [fields] = useAllFormFields()
  const [resolvedClient, setResolvedClient] = useState<ClientLinkData | null>(null)
  const [loading, setLoading] = useState(false)
  const [teammates, setTeammates] = useState<Array<{ id: string; label: string }>>([])

  const directSlug = fields?.slug?.value ? String(fields.slug.value) : ''
  const directCustomerId = fields?.googleAdsCustomerId?.value ? String(fields.googleAdsCustomerId.value) : ''
  const directClientId = id ? String(id) : ''
  const directMonthlyNegativeKeywordsEnabled = fields?.['gadsAuto.monthlyNegativeKeywordsEnabled']?.value === true
  const linkedClientId = relationshipId(fields?.client?.value as MonthlyNegativeKeywordsRelationshipValue)

  useEffect(() => {
    if (!id) return
    if (directSlug && directCustomerId) {
      setResolvedClient({ clientId: directClientId, slug: directSlug, customerId: directCustomerId, monthlyNegativeKeywordsEnabled: directMonthlyNegativeKeywordsEnabled })
      return
    }

    const fetchClient = async (clientId: string | number) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/clients/${clientId}?depth=0`, { credentials: 'include' })
        const client = res.ok ? await res.json() : null
        if (client?.slug && client?.googleAdsCustomerId) {
          setResolvedClient({
            clientId: String(client.id || clientId),
            slug: String(client.slug),
            customerId: String(client.googleAdsCustomerId),
            monthlyNegativeKeywordsEnabled: client?.gadsAuto?.monthlyNegativeKeywordsEnabled === true,
          })
        }
      } catch {
        setResolvedClient(null)
      } finally {
        setLoading(false)
      }
    }

    const resolveFromAudit = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/google-ads-audits/${id}?depth=0`, { credentials: 'include' })
        const audit = res.ok ? await res.json() : null
        const auditClientId = relationshipId(audit?.client as MonthlyNegativeKeywordsRelationshipValue)
        if (auditClientId) {
          await fetchClient(auditClientId)
        } else {
          setResolvedClient(null)
          setLoading(false)
        }
      } catch {
        setResolvedClient(null)
        setLoading(false)
      }
    }

    if (linkedClientId) {
      void fetchClient(linkedClientId)
    } else {
      void resolveFromAudit()
    }
  }, [id, directSlug, directCustomerId, directClientId, directMonthlyNegativeKeywordsEnabled, linkedClientId])

  // Load the @-taggable teammate list via the gated endpoint (the Users read is
  // admin-only, so the embedded panel can't hit /api/users directly). If it
  // fails, the tag pills simply stay hidden.
  useEffect(() => {
    let cancelled = false
    const fetchTeammates = async () => {
      try {
        const res = await fetch('/api/monthly-keyword-selection/teammates', { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data?.teammates)) setTeammates(data.teammates)
      } catch {
        /* leave teammates empty; pills stay hidden */
      }
    }
    void fetchTeammates()
    return () => { cancelled = true }
  }, [])

  if (!id) return null

  if (!resolvedClient) {
    return (
      <div style={{ margin: '12px 0 20px', padding: 14, border: '1px solid #fde68a', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 13 }}>
        {loading ? 'Loading monthly negative KWs…' : 'Monthly negative KWs needs a linked client with a slug and Google Ads customer ID.'}
      </div>
    )
  }

  if (!resolvedClient.monthlyNegativeKeywordsEnabled) {
    return (
      <div style={{ margin: '12px 0 20px', padding: 14, border: '1px solid var(--theme-elevation-150)', borderRadius: 8, background: 'var(--theme-elevation-50)', color: 'var(--theme-elevation-700)', fontSize: 13 }}>
        Monthly negative KWs is disabled for this client. Enable it under the linked Client → Automation & Policy → Google Ads Automations.
      </div>
    )
  }

  return (
    <MonthlyKeywordSelection
      clientId={resolvedClient.clientId}
      customerId={resolvedClient.customerId}
      slug={resolvedClient.slug}
      isAdmin={(user as { role?: string } | null | undefined)?.role === 'admin'}
      teammates={teammates}
    />
  )
}
