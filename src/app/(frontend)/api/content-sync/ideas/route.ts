import { getPayload } from 'payload'
import config from '@/payload.config'
import { applyIdeas, batchSchema, deleteIdeas } from '@/lib/in-the-picture/ideas'
import { boundedJson, configuredClientId, matchesBearer } from '@/lib/in-the-picture/config'

export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  if (!configuredClientId() || !process.env.CONTENT_CMS_IDEAS_TOKEN) return Response.json({ error: 'Not configured' }, { status: 503 })
  if (!matchesBearer(request, process.env.CONTENT_CMS_IDEAS_TOKEN)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  let raw: unknown
  try { raw = await boundedJson(request) }
  catch (error) { return Response.json({ error: 'Invalid batch' }, { status: error instanceof Error && error.message === 'Payload too large' ? 413 : 400 }) }
  const parsed = batchSchema.safeParse(raw)
  const ideas = parsed.success ? parsed.data.ideas : []
  const deletedBlogIds = parsed.success ? parsed.data.deletedBlogIds : []
  const blogIds = ideas.map((idea) => idea.blogId)
  const invalid = !parsed.success
    || (blogIds.length === 0 && deletedBlogIds.length === 0)
    || new Set(blogIds).size !== blogIds.length
    || new Set(deletedBlogIds).size !== deletedBlogIds.length
    || deletedBlogIds.some((blogId) => blogIds.includes(blogId))
  if (invalid) return Response.json({ error: 'Invalid batch' }, { status: 400 })
  try {
    const started = Date.now()
    const payload = await getPayload({ config })
    const result = ideas.length ? await applyIdeas(payload, ideas, true) : { applied: 0, ignored: 0 }
    const deletion = await deleteIdeas(payload, deletedBlogIds)
    console.info('[itp-sync] ideas received', { count: ideas.length, ...result, deleted: deletion.deleted, elapsedMs: Date.now() - started })
    return Response.json({ ...result, deleted: deletion.deleted })
  } catch (error) {
    console.error('[itp-sync] ideas rejected', { error: error instanceof Error ? error.message : 'Unknown' })
    return Response.json({ error: 'Ideas could not be applied; retry or review' }, { status: 409 })
  }
}
