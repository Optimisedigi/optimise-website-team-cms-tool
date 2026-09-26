import { getPayload } from 'payload'
import config from '@/payload.config'
import { applyIdeas, batchSchema } from '@/lib/in-the-picture/ideas'
import { boundedJson, configuredClientId, matchesBearer } from '@/lib/in-the-picture/config'

export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  if (!configuredClientId() || !process.env.CONTENT_CMS_IDEAS_TOKEN) return Response.json({ error: 'Not configured' }, { status: 503 })
  if (!matchesBearer(request, process.env.CONTENT_CMS_IDEAS_TOKEN)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  let raw: unknown
  try { raw = await boundedJson(request) }
  catch (error) { return Response.json({ error: 'Invalid batch' }, { status: error instanceof Error && error.message === 'Payload too large' ? 413 : 400 }) }
  const parsed = batchSchema.safeParse(raw)
  if (!parsed.success || new Set(parsed.data?.ideas.map(idea => idea.blogId)).size !== parsed.data?.ideas.length) return Response.json({ error: 'Invalid batch' }, { status: 400 })
  try {
    const started = Date.now()
    const payload = await getPayload({ config })
    const result = await applyIdeas(payload, parsed.data.ideas, true)
    console.info('[itp-sync] ideas received', { count: parsed.data.ideas.length, ...result, elapsedMs: Date.now() - started })
    return Response.json(result)
  } catch (error) {
    console.error('[itp-sync] ideas rejected', { error: error instanceof Error ? error.message : 'Unknown' })
    return Response.json({ error: 'Ideas could not be applied; retry or review' }, { status: 409 })
  }
}
