import { getPayload } from 'payload'
import config from '@/payload.config'
import AdCopyPreviewClient from './AdCopyPreviewClient'

export default async function AdCopyPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!slug) return <div>Not found</div>

  let businessName: string | undefined
  try {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const result = await payload.find({
      collection: 'google-ads-audits',
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
      select: { businessName: true },
    })
    businessName = result.docs[0]?.businessName || undefined
  } catch {
    // If fetch fails, proceed without businessName
  }

  return <AdCopyPreviewClient slug={slug} businessName={businessName} />
}
