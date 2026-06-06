import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { MonthlyKeywordSelection } from '@/components/MonthlyKeywordSelection'
import { userHasFeature } from '@/lib/access'

export default async function MonthlyKeywordSelectionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (!user) {
    return <div style={{ padding: 24 }}>Unauthorized</div>
  }
  if (!userHasFeature(user, 'negative-keyword-lists')) {
    return <div style={{ padding: 24 }}>Forbidden: you need Negative Keyword Lists access.</div>
  }

  const clientId = typeof params.clientId === 'string' ? params.clientId : ''
  const customerId = typeof params.customerId === 'string' ? params.customerId : ''
  const slug = typeof params.slug === 'string' ? params.slug : ''

  if (!clientId || !customerId || !slug) {
    return <div style={{ padding: 24 }}>Missing clientId, customerId, or slug.</div>
  }

  // Teammates available to @tag on a review comment. Fetched with overrideAccess
  // because the Users collection read is admin-only, but every tool user needs
  // the name list to tag colleagues.
  const usersResult = await payload.find({
    collection: 'users',
    limit: 500,
    depth: 0,
    overrideAccess: true,
    sort: 'name',
  })
  const teammates = (usersResult.docs as Array<{ id: number | string; name?: string; email?: string }>).map((u) => ({
    id: String(u.id),
    label: u.name || u.email || `User ${u.id}`,
  }))
  return (
    <MonthlyKeywordSelection
      clientId={clientId}
      customerId={customerId}
      slug={slug}
      isAdmin={(user as any).role === 'admin'}
      teammates={teammates}
    />
  )
}
