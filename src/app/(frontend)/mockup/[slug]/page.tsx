import { getPayload } from 'payload'
import { notFound } from 'next/navigation'
import config from '@/payload.config'
import MockupViewer from './MockupViewer'

async function findProposalBySlug(slug: string) {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const result = await payload.find({
    collection: 'client-proposals',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  return result.docs[0] ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const proposal = await findProposalBySlug(slug)
  if (!proposal) return { title: 'Mockup Not Found' }
  return {
    title: `Website Mockup — ${proposal.businessName}`,
    robots: { index: false, follow: false },
  }
}

export default async function MockupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const proposal = await findProposalBySlug(slug)

  if (!proposal) notFound()

  return (
    <MockupViewer
      businessName={proposal.businessName as string}
      slug={proposal.slug as string}
    />
  )
}
