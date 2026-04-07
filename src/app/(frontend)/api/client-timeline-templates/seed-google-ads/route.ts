import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { buildGoogleAdsTimelinePhases } from '../../../../../lib/google-ads-timeline-template'

export async function POST() {
  const payload = await getPayload({ config })

  // Check if it already exists
  const existing = await payload.find({
    collection: 'client-timeline-templates' as any,
    where: { name: { equals: 'Google Ads 90-Day Onboarding' } },
    limit: 1,
  })

  if (existing.totalDocs > 0) {
    return NextResponse.json({ ok: true, message: 'Already exists', id: existing.docs[0].id })
  }

  // Build the template phases (strip runtime-only fields for the template schema)
  const phases = buildGoogleAdsTimelinePhases().map(p => ({
    phaseName: p.phaseName,
    phaseOrder: p.phaseOrder,
    weekRange: p.weekRange,
    phaseDescription: p.phaseDescription,
    items: p.items.map(i => ({
      itemName: i.itemName,
      itemOrder: i.itemOrder,
      itemDescription: i.itemDescription || undefined,
      requiresApproval: i.requiresApproval,
      internalNotes: i.internalNotes || undefined,
    })),
  }))

  const doc = await payload.create({
    collection: 'client-timeline-templates' as any,
    data: {
      name: 'Google Ads 90-Day Onboarding',
      serviceType: 'google_ads',
      description: 'The standard 90-day onboarding template for Google Ads clients. Covers Quick Wins, Campaign Analysis, Build, Launch, and Ongoing Optimisations. Includes approval gates for changes that need client sign-off.',
      isDefault: true,
      isActive: true,
      phases,
    } as any,
  })

  return NextResponse.json({ ok: true, id: doc.id })
}
