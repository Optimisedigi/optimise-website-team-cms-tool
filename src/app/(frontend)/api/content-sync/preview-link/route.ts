import { getPayload } from 'payload'
import config from '@/payload.config'
import { isAdmin, userHasFeature } from '@/lib/access'
import { buildPostPreview } from '@/lib/in-the-picture/preview-post'
import { previewUrl, signPreview, validPostId } from '@/lib/in-the-picture/preview'

export const runtime = 'nodejs'

const noStore = { 'Cache-Control': 'private, no-store' }

/**
 * Mints a 15-minute signed website preview link for the CMS editor. Requires a
 * same-origin admin session with blog access; the post must belong to In The Picture.
 */
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Invalid origin' }, { status: 403, headers: noStore })
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || !(isAdmin(user) || userHasFeature(user, 'blog-posts'))) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
    const body: unknown = await request.json().catch(() => null)
    const postId = validPostId(body && typeof body === 'object' && 'postId' in body ? body.postId : null)
    if (!postId) return Response.json({ error: 'Invalid request' }, { status: 400, headers: noStore })
    // Build once here so the editor sees what to fix instead of a broken frame.
    const preview = await buildPostPreview(payload, postId)
    if (!preview.ok) return Response.json({ error: preview.error }, { status: preview.status, headers: noStore })
    const signed = signPreview(postId)
    const url = signed ? previewUrl(postId, signed) : null
    if (!signed || !url) return Response.json({ error: 'Website preview is not configured' }, { status: 503, headers: noStore })
    return Response.json({ url: url.toString(), expiresAt: new Date(signed.exp * 1000).toISOString() }, { headers: noStore })
  } catch (error) {
    console.error('[itp-preview] link failed', { reason: error instanceof Error ? error.message : 'Unknown' })
    return Response.json({ error: 'Preview failed; try again' }, { status: 500, headers: noStore })
  }
}
