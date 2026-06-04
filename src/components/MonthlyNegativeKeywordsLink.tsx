'use client'

import { useAllFormFields, useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type ClientLinkData = {
  clientId: string
  slug: string
  customerId: string
}

export default function MonthlyNegativeKeywordsLink() {
  const { id } = useDocumentInfo()
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

  const href = `/admin/monthly-keyword-selection?clientId=${encodeURIComponent(resolvedClient.clientId)}&customerId=${encodeURIComponent(resolvedClient.customerId)}&slug=${encodeURIComponent(resolvedClient.slug)}`

  return (
    <div style={{ margin: '12px 0 20px', padding: 14, border: '1px solid #bbf7d0', borderRadius: 8, background: '#ecfdf5' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Monthly negative KWs</div>
          <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>
            Review complete-month search terms and apply approved negatives to this client&apos;s active lists.
          </div>
        </div>
        <a
          href={href}
          style={{ padding: '8px 12px', borderRadius: 6, background: '#15803d', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          Open monthly negative KWs
        </a>
      </div>
    </div>
  )
}
