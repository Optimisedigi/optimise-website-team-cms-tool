import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { hasValidApiKey } from '@/collections/api-key-access'
import {
  applyTimelineBackfill,
  loadBackfillSource,
  planTimelineBackfill,
} from '@/lib/account-timeline-backfill'
import { ACCOUNT_TIMELINE_ACTION_TYPE_OPTIONS, optionLabel } from '@/lib/client-field-options'

export const maxDuration = 300

/**
 * POST /api/account-timeline/backfill — header `x-api-key: AUDIT_API_KEY`.
 *
 * Adds automatic Account Timeline entries for past events (see
 * src/lib/account-timeline-backfill.ts). Preview by default: nothing is
 * written unless the body is exactly `{ "apply": true }`. Safe to re-run.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!hasValidApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown = {}
  try {
    const text = await request.text()
    body = text.trim() ? JSON.parse(text) : {}
  } catch {
    return NextResponse.json({ error: 'Body must be JSON, e.g. {"apply": true}' }, { status: 400 })
  }
  const apply =
    typeof body === 'object' && body !== null && (body as { apply?: unknown }).apply === true

  const started = Date.now()
  const payload = await getPayload({ config: await config })
  let plan: ReturnType<typeof planTimelineBackfill>
  try {
    plan = planTimelineBackfill(await loadBackfillSource(payload))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    payload.logger.error({
      msg: 'account timeline backfill failed to load records',
      apply,
      error: message,
      ms: Date.now() - started,
    })
    return NextResponse.json(
      { error: 'Could not load records for the backfill; nothing was written.', detail: message },
      { status: 500 },
    )
  }

  const preview = plan.owners.map((owner) => ({
    timeline: owner.collection === 'clients' ? 'client' : 'prospect',
    id: owner.id,
    name: owner.name,
    entries: owner.entries.map((entry) => ({
      date: entry.date.slice(0, 10),
      action: optionLabel(ACCOUNT_TIMELINE_ACTION_TYPE_OPTIONS, entry.actionType),
      description: entry.description,
    })),
  }))

  const summary = {
    mode: apply ? 'apply' : 'preview',
    owners: plan.owners.length,
    planned: plan.planned,
    skippedAlreadyOnTimeline: plan.skippedAlreadyOnTimeline,
    skippedNoDate: plan.skippedNoDate.length,
    byAction: plan.byAction,
  }

  if (!apply) {
    payload.logger.info({
      msg: 'account timeline backfill preview',
      ...summary,
      ms: Date.now() - started,
    })
    return NextResponse.json({ ...summary, preview, skippedNoDateDetails: plan.skippedNoDate })
  }

  const result = await applyTimelineBackfill(payload, plan)
  payload.logger.info({
    msg: 'account timeline backfill applied',
    ...summary,
    ...result,
    ms: Date.now() - started,
  })
  return NextResponse.json(
    {
      ...summary,
      added: result.added,
      failedOwners: result.failedOwners,
      preview,
      skippedNoDateDetails: plan.skippedNoDate,
    },
    { status: result.failedOwners.length > 0 ? 207 : 200 },
  )
}
