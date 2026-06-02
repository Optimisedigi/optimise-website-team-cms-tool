import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { headers as nextHeaders } from 'next/headers'
import { getTools } from '@/lib/agents/optimate-google-ads'
import { conversionActionsForClient } from '@/lib/agents/optimate-google-ads/config'
import { isVoiceTool } from '@/lib/agents/optimate-google-ads/realtime-tools'
import type { CanonicalTool, ToolContext, ToolResultPayload } from '@/lib/agents/_shared/tool'

export const runtime = 'nodejs'

/**
 * POST /api/optimate/realtime-tool
 *
 * Server-side tool bridge for the OptiMate Realtime voice UI. The browser
 * forwards each `function_call` the model emits; we execute the matching
 * CanonicalTool here (where the Google Ads / Payload / secret access lives) and
 * return its ToolResultPayload.
 *
 * This is the trust boundary (plan §3):
 *   - Re-authenticate every call via Payload — never trust the browser's
 *     claimed user.
 *   - Resolve the run context (clientId, customerId, conversionActions) from
 *     the authenticated audit, NOT from the request body.
 *   - Reject any tool that isn't in the registered voice allow-set. Voice now
 *     shares text OptiMate's tool surface; safety is enforced by the same
 *     tool-level approval queues and Gmail draft-only scope.
 *
 * Body: { auditId: string|number, name: string, arguments?: object }
 */
export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const headersList = await nextHeaders()
    const { user } = await payload.auth({ headers: headersList })
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as {
      auditId?: unknown
      name?: unknown
      arguments?: unknown
    }

    const auditId = body.auditId
    if (
      (typeof auditId !== 'string' && typeof auditId !== 'number') ||
      String(auditId).trim().length === 0
    ) {
      return NextResponse.json({ ok: false, error: 'auditId is required' }, { status: 400 })
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 })
    }

    // Reject anything outside the registered voice allow-set BEFORE touching
    // the DB or the tool, so a confused/compromised client can never call an
    // unregistered function through speech.
    if (!isVoiceTool(name)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Tool "${name}" is not available over voice.`,
        },
        { status: 403 },
      )
    }

    const args =
      body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
        ? (body.arguments as Record<string, unknown>)
        : {}

    // Load the audit server-side. This is the source of truth for run context.
    let audit: Record<string, unknown> | null = null
    try {
      audit = (await payload.findByID({
        collection: 'google-ads-audits',
        id: auditId as string,
        overrideAccess: true,
        depth: 1,
      })) as unknown as Record<string, unknown>
    } catch {
      audit = null
    }
    if (!audit) {
      return NextResponse.json({ ok: false, error: 'Audit not found' }, { status: 404 })
    }
    if (!audit.customerId || String(audit.customerId).trim().length === 0) {
      return NextResponse.json({ ok: false, error: 'Audit has no Customer ID' }, { status: 400 })
    }

    const linkedClient = await resolveLinkedClient(payload, audit)

    // Find the registered tool. It must exist AND still pass the voice gate
    // (defence in depth against a free-text `name`).
    const tool = getTools().find((t) => t.name === name) as CanonicalTool<unknown> | undefined
    if (!tool || !isVoiceTool(tool.name)) {
      return NextResponse.json(
        { ok: false, error: `Unknown or disallowed tool: ${name}` },
        { status: 403 },
      )
    }

    const ctx: ToolContext = {
      agentName: 'optimate-google-ads',
      agentRunId: `voice_${Date.now()}`,
      context: {
        customerId: String(audit.customerId).replace(/-/g, ''),
        clientId: linkedClient?.id,
        auditId: audit.id,
        conversionActions: conversionActionsForClient(linkedClient),
        userId: typeof user.id === 'number' ? user.id : Number(user.id),
      },
      log: (msg, meta) => console.log(`[optimate-voice-tool] ${msg}`, meta ?? ''),
    }

    let validated: unknown = args
    try {
      validated = tool.validate ? tool.validate(args) : args
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: `Invalid arguments: ${(err as Error).message}` },
        { status: 400 },
      )
    }

    const result: ToolResultPayload = await tool.execute(validated, ctx)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[optimate-realtime-tool] error:', err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message || 'Tool execution failed' },
      { status: 500 },
    )
  }
}

/**
 * Resolve the client linked to this audit (directly or via its proposal).
 * Mirrors the text-chat route's resolution so voice + text share run context.
 */
async function resolveLinkedClient(
  payload: Awaited<ReturnType<typeof getPayload>>,
  audit: Record<string, unknown>,
): Promise<{
  id?: string | number
  name?: string | null
  conversionActionCategories?: Array<{ label?: string; actions?: string }> | null
  phoneCallConversionActions?: string | null
  formSubmitConversionActions?: string | null
} | null> {
  const directClient = audit.client as { id?: string | number } | string | number | null | undefined
  let clientId: string | number | undefined
  if (directClient && typeof directClient === 'object') {
    clientId = (directClient as { id?: string | number }).id
  } else if (typeof directClient === 'string' || typeof directClient === 'number') {
    clientId = directClient
  }

  if (!clientId) {
    const proposal = audit.proposal as
      | { id?: string | number; client?: unknown }
      | string
      | number
      | null
      | undefined
    if (proposal && typeof proposal === 'object') {
      const pc = (proposal as { client?: unknown }).client
      if (pc && typeof pc === 'object') clientId = (pc as { id?: string | number }).id
      else if (typeof pc === 'string' || typeof pc === 'number') clientId = pc
    }
  }

  if (!clientId) return null
  try {
    const c = await payload.findByID({
      collection: 'clients',
      id: clientId,
      overrideAccess: true,
    })
    return c as never
  } catch {
    return null
  }
}
