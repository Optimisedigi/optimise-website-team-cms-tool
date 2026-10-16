import type { Payload } from 'payload'
import { APIError } from 'payload'
import type { BlogPost } from '@/payload-types'
import { configuredClientId } from './config'
import { previewArticleEvent } from './outbox'

export type PreviewResult =
  | { ok: true; event: Record<string, unknown> }
  | { ok: false; status: 404 | 422 | 503; error: string }

/**
 * The latest saved version (draft included) of an In The Picture post, built
 * exactly as it would be sent to the website. Other clients' posts are not found.
 */
export async function buildPostPreview(payload: Payload, postId: number): Promise<PreviewResult> {
  const clientId = configuredClientId()
  if (!clientId) return { ok: false, status: 503, error: 'Website preview is not configured' }
  let post: BlogPost
  try {
    post = await payload.findByID({ collection: 'blog-posts', id: postId, draft: true, depth: 0, overrideAccess: true })
  } catch {
    return { ok: false, status: 404, error: 'Post not found' }
  }
  const owner = typeof post.client === 'number' ? post.client : post.client?.id
  if (owner !== clientId) return { ok: false, status: 404, error: 'Post not found' }
  const revision = post.updatedAt && !Number.isNaN(Date.parse(post.updatedAt)) ? new Date(post.updatedAt).toISOString() : new Date().toISOString()
  try {
    return { ok: true, event: await previewArticleEvent(payload, post, revision) }
  } catch (error) {
    // Editor-fixable problems (missing fields, unsupported Markdown) are shown to the editor.
    if (error instanceof APIError && error.isPublic && error.status === 400) return { ok: false, status: 422, error: error.message }
    console.error('[itp-preview] build failed', { postId, reason: error instanceof Error ? error.message : 'Unknown' })
    return { ok: false, status: 422, error: 'This post cannot be previewed yet. Save it and try again.' }
  }
}
