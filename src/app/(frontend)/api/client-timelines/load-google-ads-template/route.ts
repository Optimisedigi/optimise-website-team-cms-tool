import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { buildGoogleAdsTimelinePhases } from '@/lib/google-ads-timeline-template'

export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const doc = await payload.findByID({
      collection: 'client-timelines' as any,
      id,
      depth: 0,
    })

    if (!doc) {
      return NextResponse.json({ error: 'Timeline not found' }, { status: 404 })
    }

    // Replace phases with the Google Ads template
    await payload.update({
      collection: 'client-timelines' as any,
      id,
      data: {
        phases: buildGoogleAdsTimelinePhases(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}
