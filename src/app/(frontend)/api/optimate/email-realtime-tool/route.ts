import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { headers as nextHeaders } from 'next/headers'
import { getEmailTools, isEmailVoiceTool } from '@/lib/agents/optimate-email'
import type { CanonicalTool, ToolContext, ToolResultPayload } from '@/lib/agents/_shared/tool'

export const runtime = 'nodejs'

/**
 * POST /api/optimate/email-realtime-tool
 *
 * Server-side tool bridge for the OptiMate Email Reply voice agent. The browser
 * forwards each `function_call` the model emits; we execute the matching
 * email-only CanonicalTool here and return its ToolResultPayload.
 *
 * Trust boundary:
 *   - Re-authenticate every call via Payload — never trust the browser.
 *   - Reject any tool outside the registered EMAIL voice allow-set (no Google
 *     Ads data or proposal tools can be reached here).
 *   - Resolve userId from the authenticated session, not the request body.
 *
 * Body: { name: string, arguments?: object }
 */
export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const headersList = await nextHeaders()
    const { user } = await payload.auth({ headers: headersList })
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as { name?: unknown; arguments?: unknown }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 })
    }

    // Reject anything outside the registered email voice allow-set before
    // touching any tool. A confused/compromised client cannot widen the surface
    // to Google Ads or proposal tools.
    if (!isEmailVoiceTool(name)) {
      return NextResponse.json(
        { ok: false, error: `Tool "${name}" is not available to the email agent.` },
        { status: 403 },
      )
    }

    const args =
      body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
        ? (body.arguments as Record<string, unknown>)
        : {}

    const tool = getEmailTools({ attachMemoryTools: true }).find((t) => t.name === name) as
      | CanonicalTool<unknown>
      | undefined
    if (!tool || !isEmailVoiceTool(tool.name)) {
      return NextResponse.json(
        { ok: false, error: `Unknown or disallowed tool: ${name}` },
        { status: 403 },
      )
    }

    const ctx: ToolContext = {
      agentName: 'optimate-email',
      agentRunId: `email_voice_${Date.now()}`,
      context: {
        userId: typeof user.id === 'number' ? user.id : Number(user.id),
      },
      log: (msg, meta) => console.log(`[optimate-email-voice-tool] ${msg}`, meta ?? ''),
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
    console.error('[optimate-email-realtime-tool] error:', err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message || 'Tool execution failed' },
      { status: 500 },
    )
  }
}
