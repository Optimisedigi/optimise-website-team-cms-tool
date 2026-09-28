import { getPayload } from 'payload'
import config from '@/payload.config'
import { boundedJson, configuredClientId, matchesBearer } from '@/lib/in-the-picture/config'
import { applyReviewDecision, reviewDecisionSchema } from '@/lib/in-the-picture/review-decision'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  if (!configuredClientId() || !process.env.CONTENT_CMS_IDEAS_TOKEN)
    return Response.json({ error: 'Not configured' }, { status: 503 })
  if (!matchesBearer(request, process.env.CONTENT_CMS_IDEAS_TOKEN))
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  let raw: unknown
  try { raw = await boundedJson(request) }
  catch (error) {
    return Response.json({ error: 'Invalid decision' }, { status: error instanceof Error && error.message === 'Payload too large' ? 413 : 400 })
  }
  const parsed = reviewDecisionSchema.safeParse(raw)
  if (!parsed.success) return Response.json({ error: 'Invalid decision' }, { status: 400 })
  try {
    const started = Date.now()
    const payload = await getPayload({ config })
    const outcome = await applyReviewDecision(payload, parsed.data)
    console.info('[itp-sync] review decision', { postId: parsed.data.postId, outcome, elapsedMs: Date.now() - started })
    return outcome === 'applied'
      ? Response.json({ outcome })
      : Response.json({ error: 'Review revision is not current or decision conflicts' }, { status: 409 })
  } catch (error) {
    console.error('[itp-sync] review decision failed', { error: error instanceof Error ? error.message : 'Unknown' })
    return Response.json({ error: 'Could not record review decision' }, { status: 503 })
  }
}
