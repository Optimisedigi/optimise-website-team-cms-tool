import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { headers as nextHeaders } from 'next/headers'

/** Website CMS ideas for one client, strictly scoped: never leaks other clients' ideas. */
export async function GET(request: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const headersList = await nextHeaders()
    const { user } = await payload.auth({ headers: headersList })
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const clientId = url.searchParams.get('clientId')?.trim()
    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }

    const result = await payload.find({
      collection: 'blog-ideas',
      where: { client: { equals: clientId } },
      sort: 'priority',
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })

    return NextResponse.json({ docs: result.docs })
  } catch (err) {
    console.error('[blog-ideas GET] error:', err)
    return NextResponse.json({ error: 'Failed to load ideas' }, { status: 500 })
  }
}
