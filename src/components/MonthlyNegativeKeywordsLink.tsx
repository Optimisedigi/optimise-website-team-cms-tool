'use client'

import { useAllFormFields, useAuth, useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import { MonthlyKeywordSelection } from './MonthlyKeywordSelection'

type ClientLinkData = {
  clientId: string
  slug: string
  customerId: string
}

export default function MonthlyNegativeKeywordsLink() {
  const { id } = useDocumentInfo()
  const { user } = useAuth()
  const [fields] = useAllFormFields()
  const [resolvedClient, setResolvedClient] = useState<ClientLinkData | null>(null)
  const [loading, setLoading] = useState(false)

  const directSlug = fields?.slug?.value ? String(fields.slug.value) : ''
  const directCustomerId = fields?.googleAdsCustomerId?.value ? String(fields.googleAdsCustomerId.value) : ''
  const directClientId = id ? String(id) : ''
  const clientRel = fields?.client?.value as string | number | { id?: string | number } | undefined
  const linkedClientId = typeof clientRel === 'object' ? clientRel?.id : clientRel

  useEffect(() => {
    if (!id) return
    if (directSlug && directCustomerId) {
      setResolvedClient({ clientId: directClientId, slug: directSlug, customerId: directCustomerId })
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
        const auditClient = typeof audit?.client === 'object' ? audit.client?.id : audit?.client
        if (auditClient) {
          await fetchClient(auditClient)
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
  }, [id, directSlug, directCustomerId, directClientId, linkedClientId])

  if (!id) return null

  if (!resolvedClient) {
    return (
      <div style={{ margin: '12px 0 20px', padding: 14, border: '1px solid #fde68a', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 13 }}>
        {loading ? 'Loading monthly negative KWs…' : 'Monthly negative KWs needs a linked client with a slug and Google Ads customer ID.'}
      </div>
    )
  }

  return (
    <MonthlyKeywordSelection
      clientId={resolvedClient.clientId}
      customerId={resolvedClient.customerId}
      slug={resolvedClient.slug}
      isAdmin={(user as { role?: string } | null | undefined)?.role === 'admin'}
    />
  )
}
