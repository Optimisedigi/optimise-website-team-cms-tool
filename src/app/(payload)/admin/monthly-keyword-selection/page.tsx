import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { MonthlyKeywordSelection } from '@/components/MonthlyKeywordSelection'

export default async function MonthlyKeywordSelectionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (!user) {
    return <div style={{ padding: 24 }}>Unauthorized</div>
  }

  const clientId = typeof params.clientId === 'string' ? params.clientId : ''
  const customerId = typeof params.customerId === 'string' ? params.customerId : ''
  const slug = typeof params.slug === 'string' ? params.slug : ''

  if (!clientId || !customerId || !slug) {
    return <div style={{ padding: 24 }}>Missing clientId, customerId, or slug.</div>
  }

  return <MonthlyKeywordSelection clientId={clientId} customerId={customerId} slug={slug} isAdmin={(user as any).role === 'admin'} />
}
