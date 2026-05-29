import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { headers as nextHeaders } from 'next/headers'
import { buildSystemPromptForAudit } from '@/lib/agents/optimate-google-ads'
import {
  getRealtimeToolDefinitions,
  getVoiceReadToolNames,
} from '@/lib/agents/optimate-google-ads/realtime-tools'
import { readClientConnectionFlags } from '@/lib/agents/optimate-google-ads/tools/_client-tokens'

export const runtime = 'nodejs'

/**
 * GET /api/optimate/realtime-session?auditId=...
 *
 * Returns the Realtime session config (instructions + read-only tool defs) the
 * browser passes to the voice helper when minting the ephemeral secret. We
 * build this server-side so:
 *   - the system prompt stays owned by the app (not the client/helper), and
 *   - the heavy agent module graph (payload, tools) never ships to the browser.
 *
 * Auth is required and the audit context is loaded server-side, same as the
 * text-chat route. The voice prompt is the OptiMate prompt plus a read-only
 * voice guardrail telling the model writes must go through text chat.
 */
export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config })
    const headersList = await nextHeaders()
    const { user } = await payload.auth({ headers: headersList })
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const auditId = url.searchParams.get('auditId')
    if (!auditId) {
      return NextResponse.json({ error: 'auditId is required' }, { status: 400 })
    }

    let audit: Record<string, unknown> | null = null
    try {
      audit = (await payload.findByID({
        collection: 'google-ads-audits',
        id: auditId,
        overrideAccess: true,
        depth: 1,
      })) as unknown as Record<string, unknown>
    } catch {
      audit = null
    }
    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 })
    }

    const client = await resolveLinkedClient(payload, audit)
    const connectionFlags = await readClientConnectionFlags(
      (client?.id as string | number | undefined) ?? null,
    )
    const basePrompt = buildSystemPromptForAudit(audit as never, client as never, connectionFlags, {
      pinnedMemoryBlock: '',
      recentMessages: [],
    })

    const voiceGuardrail =
      '\n\n--- VOICE MODE ---\n' +
      'You are on a live voice call. CRITICAL: do NOT volunteer an overview, summary, ' +
      'status report, or any account data unless the user explicitly asks for it. When the ' +
      'call opens, greet the user in one short sentence and then WAIT for their question — ' +
      'say nothing else until they speak. ' +
      'Keep every reply short and conversational (a sentence or two), never a report. Only ' +
      'call a data tool when the user actually asks for that data. ' +
      'NEVER say, read, spell, or reference tool/function names or their syntax out loud or in ' +
      'the transcript. Do NOT verbalize things like "get_weekly_metric_table", ' +
      '"((get_campaign_performance))", "calling the tool", or any underscore/parenthesis ' +
      'function notation. Just use the tool silently and then speak ONLY the plain-English ' +
      'answer as if you already knew it. Use natural words for metrics (e.g. "weekly spend", ' +
      'not the tool name). ' +
      'You CANNOT make changes ' +
      '(budgets, keywords, campaigns, drafts) over voice. If the user asks for a change, say you ' +
      'will set up the proposal and that they should confirm it in the text chat — do not claim ' +
      'the change is done.'

    const allowed = getVoiceReadToolNames()
    const tools = getRealtimeToolDefinitions(allowed)

    return NextResponse.json({
      instructions: basePrompt + voiceGuardrail,
      tools,
    })
  } catch (err) {
    console.error('[optimate-realtime-session] error:', err)
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to build voice session' },
      { status: 500 },
    )
  }
}

async function resolveLinkedClient(
  payload: Awaited<ReturnType<typeof getPayload>>,
  audit: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const directClient = audit.client as { id?: string | number } | string | number | null | undefined
  let clientId: string | number | undefined
  if (directClient && typeof directClient === 'object') {
    clientId = (directClient as { id?: string | number }).id
  } else if (typeof directClient === 'string' || typeof directClient === 'number') {
    clientId = directClient
  }
  if (!clientId) return null
  try {
    return (await payload.findByID({
      collection: 'clients',
      id: clientId,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
  } catch {
    return null
  }
}
