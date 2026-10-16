import { getPayload } from 'payload'
import config from '@/payload.config'
import { buildPostPreview } from '@/lib/in-the-picture/preview-post'
import { validPostId, verifyPreview } from '@/lib/in-the-picture/preview'

export const runtime = 'nodejs'

const noStore = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }

/**
 * Called server-to-server by the In The Picture website's preview page. Access
 * is the CMS-signed, unexpired link itself; anything else is a plain 404 so the
 * endpoint reveals nothing about which posts exist.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const postId = validPostId(params.get('postId'))
  if (!postId || !verifyPreview(postId, params.get('exp'), params.get('sig'))) return Response.json({ error: 'Not found' }, { status: 404, headers: noStore })
  try {
    const payload = await getPayload({ config })
    const preview = await buildPostPreview(payload, postId)
    if (!preview.ok) return Response.json({ error: preview.error }, { status: preview.status, headers: noStore })
    return Response.json(preview.event, { headers: noStore })
  } catch (error) {
    console.error('[itp-preview] fetch failed', { postId, reason: error instanceof Error ? error.message : 'Unknown' })
    return Response.json({ error: 'Preview failed; try again' }, { status: 500, headers: noStore })
  }
}
