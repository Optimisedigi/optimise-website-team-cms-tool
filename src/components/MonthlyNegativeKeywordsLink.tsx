'use client'

import { useAllFormFields, useDocumentInfo } from '@payloadcms/ui'

export default function MonthlyNegativeKeywordsLink() {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()

  const slug = fields?.slug?.value ? String(fields.slug.value) : ''
  const customerId = fields?.googleAdsCustomerId?.value ? String(fields.googleAdsCustomerId.value) : ''

  if (!id || !slug || !customerId) return null

  const href = `/admin/monthly-keyword-selection?clientId=${encodeURIComponent(String(id))}&customerId=${encodeURIComponent(customerId)}&slug=${encodeURIComponent(slug)}`

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
