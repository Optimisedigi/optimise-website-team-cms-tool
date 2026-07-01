import { NextResponse } from 'next/server'
import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import config from '@/payload.config'
import type { Message } from '@/lib/agents/_shared/llm/types'
import { getOptiMateDefaultModels } from '@/lib/agents/_shared/optimate-default-models'
import {
  getGoogleMateInitialTools,
  getPortfolioTools,
  runChatTurn,
  runPortfolioChatTurn,
} from '@/lib/agents/optimate-google-ads'
import {
  GOOGLE_MATE_PARITY_QUERY,
  summarizeForDevTrace,
  type GoogleMateDevModeContext,
  type GoogleMateDevTextTrace,
  type GoogleMateDevToolTrace,
} from '@/lib/optimate/dev-google-mate-parity'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'This parity harness is development-only.' }, { status: 404 })
  }

  try {
    const payload = await getPayload({ config })
    const headersList = await nextHeaders()
    const { user } = await payload.auth({ headers: headersList })
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      mode?: unknown
      auditId?: unknown
      customerId?: unknown
      businessName?: unknown
      selectedAccountRefs?: unknown
    }

    const mode = body.mode === 'portfolio' ? 'portfolio' : 'audit'
    const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : ''
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : ''
    const selectedAccountRefs = Array.isArray(body.selectedAccountRefs)
      ? body.selectedAccountRefs.filter(
          (value): value is string | number => typeof value === 'string' || typeof value === 'number',
        )
      : []

    const messages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: GOOGLE_MATE_PARITY_QUERY }],
      },
    ]

    const defaults = await getOptiMateDefaultModels(payload)

    if (mode === 'portfolio') {
      const result = await runPortfolioChatTurn({
        messages,
        userId: typeof user.id === 'number' ? user.id : Number(user.id),
        selectedAccountRefs,
      })
      const rows = await fetchActivityRows(payload, result.runId)
      const trace: GoogleMateDevTextTrace = {
        kind: 'text',
        query: GOOGLE_MATE_PARITY_QUERY,
        userMessage: GOOGLE_MATE_PARITY_QUERY,
        runId: result.runId,
        finalAssistantReply: result.reply || '',
        emptyResponsePoint: result.reply ? null : 'text route returned an empty assistant reply',
        toolsCalled: mapToolRows(rows),
        context: {
          mode,
          modelRequested: result.modelRequested,
          modelUsed: result.modelUsed,
          availableToolNames: getPortfolioTools({ attachMemoryTools: true }).map((tool) => tool.name),
          historyMessageCount: messages.length,
          replyPath: 'typed-backend',
        },
      }

      return NextResponse.json({
        query: GOOGLE_MATE_PARITY_QUERY,
        textTrace: trace,
        voiceContext: buildSpeechOnlyVoiceContext(mode, defaults.voiceRealtimeModel, messages.length),
        divergenceHints: buildDivergenceHints(trace.context),
      })
    }

    const auditId = body.auditId
    if ((typeof auditId !== 'string' && typeof auditId !== 'number') || String(auditId).trim().length === 0) {
      return NextResponse.json({ error: 'auditId is required for audit mode' }, { status: 400 })
    }

    const audit = await resolveAudit(payload, { auditId, customerId, businessName })
    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 })
    }
    const client = await resolveLinkedClient(payload, audit)

    const result = await runChatTurn({
      audit: audit as never,
      client: client as never,
      messages,
      userId: typeof user.id === 'number' ? user.id : Number(user.id),
    })
    const rows = await fetchActivityRows(payload, result.runId)
    const trace: GoogleMateDevTextTrace = {
      kind: 'text',
      query: GOOGLE_MATE_PARITY_QUERY,
      userMessage: GOOGLE_MATE_PARITY_QUERY,
      runId: result.runId,
      finalAssistantReply: result.reply || '',
      emptyResponsePoint: result.reply ? null : 'text route returned an empty assistant reply',
      toolsCalled: mapToolRows(rows),
      context: {
        mode,
        modelRequested: result.modelRequested,
        modelUsed: result.modelUsed,
        availableToolNames: getGoogleMateInitialTools(messages).map((tool) => tool.name),
        historyMessageCount: messages.length,
        replyPath: 'typed-backend',
      },
    }

    return NextResponse.json({
      query: GOOGLE_MATE_PARITY_QUERY,
      textTrace: trace,
      voiceContext: buildSpeechOnlyVoiceContext(mode, defaults.voiceRealtimeModel, messages.length),
      divergenceHints: buildDivergenceHints(trace.context),
    })
  } catch (err) {
    console.error('[google-mate-parity] error:', err)
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to run parity harness' },
      { status: 500 },
    )
  }
}

function buildSpeechOnlyVoiceContext(
  mode: 'audit' | 'portfolio',
  realtimeModel: string,
  historyMessageCount: number,
): GoogleMateDevModeContext {
  return {
    mode,
    modelRequested: realtimeModel,
    modelUsed: undefined,
    availableToolNames: [],
    historyMessageCount,
    replyPath: 'typed-backend',
  }
}

async function fetchActivityRows(
  payload: Awaited<ReturnType<typeof getPayload>>,
  runId: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = await payload.find({
    collection: 'activity-log' as never,
    where: { agentRunId: { equals: runId } } as never,
    limit: 200,
    sort: 'createdAt',
    overrideAccess: true,
  })
  return rows.docs as Array<Record<string, unknown>>
}

function mapToolRows(rows: Array<Record<string, unknown>>): GoogleMateDevToolTrace[] {
  return rows
    .filter((row) => row.type === 'agent_tool_call' && typeof row.toolName === 'string')
    .map((row) => ({
      name: String(row.toolName),
      args: row.input,
      resultSummary: summarizeForDevTrace(row.output),
      ok: !summarizeForDevTrace(row.output).toLowerCase().includes('error'),
    }))
}

function buildDivergenceHints(textContext: GoogleMateDevModeContext): string[] {
  return [
    'Voice for audit/portfolio is now a speech-only Realtime shell with no GoogleMate reasoning tools.',
    `Typed baseline uses replyPath=${textContext.replyPath ?? 'typed-backend'} with ${textContext.historyMessageCount} history message(s). Voice should send the same session and history into the typed backend.`,
    'If parity still drifts now, focus on transcript wording, duplicated/missing history, or UI-side assistant-turn handling instead of Realtime tool planning.',
  ]
}

async function resolveAudit(
  payload: Awaited<ReturnType<typeof getPayload>>,
  input: { auditId: unknown; customerId: string; businessName: string },
): Promise<Record<string, unknown> | null> {
  if (typeof input.auditId === 'string' || typeof input.auditId === 'number') {
    try {
      return (await payload.findByID({
        collection: 'google-ads-audits',
        id: input.auditId as string,
        overrideAccess: true,
        depth: 1,
      })) as unknown as Record<string, unknown>
    } catch {
      // Fall through to customerId lookup.
    }
  }

  if (!input.customerId) return null
  const customerKey = input.customerId.replace(/-/g, '')
  try {
    const existing = await payload.find({
      collection: 'google-ads-audits',
      where: {
        or: [{ customerId: { equals: input.customerId } }, { customerId: { equals: customerKey } }],
      },
      limit: 1,
      depth: 1,
      overrideAccess: true,
    })
    const found = existing.docs[0]
    if (found) return found as unknown as Record<string, unknown>
  } catch {
    // Best-effort fallback only.
  }

  return null
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
