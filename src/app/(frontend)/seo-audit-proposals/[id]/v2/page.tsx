/**
 * SEO Audit Proposal report — full 1920×1080 deck (Option A).
 *
 * Loads a stored seo-audit-proposals record and renders its report through the
 * shared proposal v2 deck framework (DeckStage + RocketScroll + StarfieldRunner
 * + SeoHealthSlide/CroHealthSlide/ClosingSlide). PIN-gated for client sharing
 * when the record (or its linked proposal) carries a PIN.
 */
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import config from '@/payload.config'
import AuditPasswordGate from '@/components/AuditPasswordGate'
import { SeoProposalDeck, type SeoProposalReport } from './SeoProposalDeck'
import './report-v2.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }).toUpperCase()
}

function deriveBusinessName(record: any): string {
  // Prefer a linked client/proposal name; fall back to the domain.
  const fromClient = record.client && typeof record.client === 'object' ? record.client.name || record.client.businessName : null
  const fromProposal = record.proposal && typeof record.proposal === 'object' ? record.proposal.businessName : null
  if (fromClient) return fromClient
  if (fromProposal) return fromProposal
  try {
    const host = new URL(record.websiteUrl).hostname.replace(/^www\./, '')
    const label = host.split('.')[0]
    return label.charAt(0).toUpperCase() + label.slice(1)
  } catch {
    return record.websiteUrl || 'Your business'
  }
}

async function loadRecord(idOrSlug: string) {
  const payload = await getPayload({ config: await config })
  const bySlug = await payload.find({
    collection: 'seo-audit-proposals',
    where: { reportSlug: { equals: idOrSlug } },
    depth: 2,
    limit: 1,
    overrideAccess: true,
  })
  if (bySlug.docs.length > 0) return bySlug.docs[0]
  const numId = Number(idOrSlug)
  if (!Number.isNaN(numId)) {
    try {
      return await payload.findByID({ collection: 'seo-audit-proposals', id: numId, depth: 2, overrideAccess: true })
    } catch {
      return null
    }
  }
  return null
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const record = (await loadRecord(id)) as any
  if (!record) return { title: 'SEO Audit Proposal Not Found' }
  return {
    title: `SEO Audit Proposal | ${deriveBusinessName(record)}`,
    robots: { index: false, follow: false },
  }
}

export default async function SeoAuditProposalV2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const record = (await loadRecord(id)) as any
  if (!record) notFound()

  const report = (record.report || null) as SeoProposalReport | null
  const businessName = deriveBusinessName(record)
  const dateLabel = formatMonthYear(record.completedAt || record.createdAt)

  // PIN gate: record-level, falling back to the linked proposal's PIN.
  const pin: string | null =
    record.proposalPin ||
    (record.proposal && typeof record.proposal === 'object' ? record.proposal.proposalPin : null) ||
    null

  const body =
    !report || record.status !== 'completed' ? (
      <div className={`proposal-v2 ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, textAlign: 'center', color: 'var(--ink-mute)' }}>
          <div>
            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", marginBottom: 12 }}>SEO Audit Proposal</h1>
            <p>
              {record.status === 'running'
                ? 'This proposal is still being generated. Refresh shortly.'
                : record.status === 'failed'
                  ? `This run failed: ${record.error || 'unknown error'}`
                  : 'No report yet. Run the SEO Audit Proposal to generate it.'}
            </p>
          </div>
        </div>
      </div>
    ) : (
      <div className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
        <SeoProposalDeck businessName={businessName} websiteUrl={record.websiteUrl ?? null} dateLabel={dateLabel} presentedBy={record.presentedBy ?? null} report={report} />
      </div>
    )

  if (pin) {
    return (
      <AuditPasswordGate auditSlug={record.reportSlug || String(record.id)} businessName={businessName} featureLabel="SEO Audit Proposal">
        {body}
      </AuditPasswordGate>
    )
  }
  return body
}
