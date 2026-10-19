import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { headers as nextHeaders } from 'next/headers'

export const runtime = 'nodejs'

/**
 * GET /api/optimate/realtime-session?auditId=...
 *
 * Audit and portfolio GoogleMate voice now use Realtime only for:
 * - microphone capture
 * - server VAD / transcription
 * - short greeting + assistant readback audio
 *
 * All Google Ads reasoning runs through the normal typed backend routes.
 *
 * `mode=adminmate` (admins only) is the same speech layer for AdminMate: the
 * browser sends each transcript to /api/optimate/adminmate/chat and Realtime
 * reads the reply aloud.
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
    const requestedMode = url.searchParams.get('mode')
    if (requestedMode === 'adminmate') {
      // Same gate as the AdminMate chat route.
      if ((user as { role?: string }).role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.json({ instructions: ADMINMATE_SPEECH_ONLY_INSTRUCTIONS, tools: [] })
    }
    const mode = requestedMode === 'portfolio' ? 'portfolio' : 'audit'
    const auditId = url.searchParams.get('auditId')
    const customerId = url.searchParams.get('customerId')
    const businessName = url.searchParams.get('businessName')
    const selectedAccountRefs = parseSelectedAccountRefs(url.searchParams.get('selectedAccountRefs'))

    if (mode === 'audit') {
      if (!auditId && !customerId) {
        return NextResponse.json({ error: 'auditId or customerId is required' }, { status: 400 })
      }
      const audit = await resolveAudit(payload, { auditId, customerId, businessName })
      if (!audit) {
        return NextResponse.json({ error: 'Audit not found' }, { status: 404 })
      }
    }

    return NextResponse.json({
      instructions: buildSpeechOnlyRealtimeInstructions(mode, selectedAccountRefs),
      tools: [],
    })
  } catch (err) {
    console.error('[optimate-realtime-session] error:', err)
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to build voice session' },
      { status: 500 },
    )
  }
}

const ADMINMATE_SPEECH_ONLY_INSTRUCTIONS =
  '--- ADMINMATE SPEECH-ONLY MODE ---\n' +
  'You are the live speech layer for AdminMate, the agency admin assistant. Greet the user once in one short sentence when the call opens, then wait silently for speech.\n' +
  'Your job is transcription and audio readback only.\n' +
  'Do not answer client, contract, proposal, meeting, invite, or payment questions yourself, and never say anything was created, sent, or saved.\n' +
  'Do not call tools. No tools are available in this session.\n' +
  'After the user speaks, wait for the app to provide the assistant reply text. When the app provides assistant text, read that text aloud exactly as written with no paraphrasing, no summarising, and no extra commentary.\n' +
  'If no app-provided assistant text has arrived yet, stay silent.\n' +
  'Never invent client details, amounts, dates, or email addresses.'

function buildSpeechOnlyRealtimeInstructions(
  mode: 'audit' | 'portfolio',
  selectedAccountRefs: string[],
): string {
  const scopeNote =
    mode === 'portfolio' && selectedAccountRefs.length > 0
      ? ` The app may be scoped to these selected account refs: ${selectedAccountRefs.join(', ')}.`
      : ''

  return (
    '--- GOOGLEMATE SPEECH-ONLY MODE ---\n' +
    'You are the live speech layer for GoogleMate. Greet the user once in one short sentence when the call opens, then wait silently for speech.\n' +
    'Your job is transcription and audio readback only.\n' +
    'Do not answer Google Ads, audit, portfolio, account, keyword, campaign, reporting, proposal, or approval questions yourself.\n' +
    'Do not call tools. No tools are available in this session.\n' +
    'After the user speaks, wait for the app to provide the assistant reply text. When the app provides assistant text, read that text aloud exactly as written with no paraphrasing, no summarising, and no extra commentary.\n' +
    'If no app-provided assistant text has arrived yet, stay silent.\n' +
    'Never invent account data, tool output, or approval status.' +
    scopeNote
  )
}

function parseSelectedAccountRefs(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

async function resolveAudit(
  payload: Awaited<ReturnType<typeof getPayload>>,
  input: { auditId: string | null; customerId: string | null; businessName: string | null },
): Promise<Record<string, unknown> | null> {
  if (input.auditId) {
    try {
      return (await payload.findByID({
        collection: 'google-ads-audits',
        id: input.auditId,
        overrideAccess: true,
        depth: 1,
      })) as unknown as Record<string, unknown>
    } catch {
      // Fall through to customerId lookup. Some launcher rows are client-derived
      // or lightweight audit rows that may not resolve by id in production yet.
    }
  }

  const customerId = input.customerId?.trim()
  if (!customerId) return null
  const customerKey = customerId.replace(/-/g, '')
  try {
    const existing = await payload.find({
      collection: 'google-ads-audits',
      where: {
        or: [{ customerId: { equals: customerId } }, { customerId: { equals: customerKey } }],
      },
      limit: 1,
      depth: 1,
      overrideAccess: true,
    })
    const found = existing.docs[0]
    if (found) return found as unknown as Record<string, unknown>
  } catch {
    // Best-effort fallback only; do not create audit records from a voice session.
  }

  return null
}
