import { ProposalReportV2PageContent, generateMetadata } from '../v2/page'

export { generateMetadata }

export default async function ProposalSlotPreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return ProposalReportV2PageContent({
    params,
    slotPreview: true,
    gateEnabled: process.env.NODE_ENV === 'production',
  })
}
