import { NextResponse } from 'next/server'
import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { getOptiMateDefaultModels } from '@/lib/agents/_shared/optimate-default-models'
import { resolveCredential } from '@/lib/agents/_shared/llm/auth/resolver'

export const runtime = 'nodejs'

const DEFAULT_REALTIME_VOICE = 'marin'
const DEFAULT_REALTIME_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe'
const DEFAULT_SAMPLE_RATE = 24_000

type TurnDetectionConfig = {
  type?: unknown
  threshold?: unknown
  prefix_padding_ms?: unknown
  silence_duration_ms?: unknown
  create_response?: unknown
  interrupt_response?: unknown
}

/**
 * POST /api/optimate/realtime-secret
 *
 * Server-side Realtime secret minting. The browser sends the OptiMate-owned
 * session payload (instructions + voice-safe tool definitions); this route adds
 * the OpenAI model/audio config and mints a short-lived `ek_...` client secret.
 *
 * Auth is controlled by the `voiceAuthMethod` setting:
 *  - `codex-oauth`: uses the connected ChatGPT (Codex OAuth) subscription.
 *    No fallback to API key — a missing or failed OAuth credential is a hard error.
 *  - `api-key` (default): uses OPENAI_API_KEY. The real key never leaves the server.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config })
    const headersList = await nextHeaders()
    const { user } = await payload.auth({ headers: headersList })
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const defaults = await getOptiMateDefaultModels(payload)
    const voiceAuthMethod = defaults.voiceAuthMethod

    // Resolve auth headers based on the configured billing method.
    // codex-oauth: ChatGPT plan via Codex OAuth — no fallback to API key.
    // api-key: OPENAI_API_KEY per-hour billing.
    let authHeaders: Record<string, string>
    if (voiceAuthMethod === 'codex-oauth') {
      try {
        const resolved = await resolveCredential('openai-codex')
        if (resolved.source !== 'oauth') {
          return NextResponse.json(
            {
              error:
                'Voice billing is set to ChatGPT Plan (Codex OAuth) but no connected ChatGPT account was found. Connect a ChatGPT account in Agent Auth, or switch voice billing to API Key in OptiMate Settings.',
            },
            { status: 400 },
          )
        }
        authHeaders = { ...resolved.authHeader, 'Content-Type': 'application/json' }
      } catch (err) {
        const reason = (err as Error).message || 'Unknown error'
        console.error('[optimate-realtime-secret] Codex OAuth resolution failed:', reason)
        return NextResponse.json(
          {
            error: `ChatGPT Plan (Codex OAuth) auth failed: ${reason}. No fallback to API key is configured — fix the OAuth connection or switch voice billing to API Key in OptiMate Settings.`,
          },
          { status: 502 },
        )
      }
    } else {
      const apiKey = process.env.OPENAI_API_KEY?.trim()
      if (!apiKey) {
        const diag = describeEnvScope()
        const rawPresent = typeof process.env.OPENAI_API_KEY === 'string'
        const reason = rawPresent
          ? 'OPENAI_API_KEY is present but blank (empty or whitespace-only value).'
          : 'OPENAI_API_KEY is not set in this deployment.'
        console.error(
          `[optimate-realtime-secret] missing key — ${reason} ${diag.log}`,
        )
        return NextResponse.json(
          {
            error: `${reason} Active env: ${diag.env}. Set OPENAI_API_KEY for this environment in Vercel, then redeploy (env vars are baked at build time).`,
            diagnostic: {
              reason: rawPresent ? 'present-but-blank' : 'absent',
              vercelEnv: diag.env,
              commit: diag.commit,
              deploymentUrl: diag.url,
            },
          },
          { status: 500 },
        )
      }
      authHeaders = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }
    }

    const body = (await request.json().catch(() => null)) as {
      session?: unknown
    } | null
    const requestedSession = isRecord(body?.session) ? body.session : null
    if (!requestedSession) {
      return NextResponse.json({ error: 'session is required' }, { status: 400 })
    }

    const instructions = readNonEmptyString(requestedSession.instructions)
    if (!instructions) {
      return NextResponse.json({ error: 'session.instructions is required' }, { status: 400 })
    }

    const session = buildRealtimeSession({
      model: defaults.voiceRealtimeModel,
      instructions,
      tools: Array.isArray(requestedSession.tools) ? requestedSession.tools : [],
      turnDetection: normalizeTurnDetection(requestedSession.turnDetection),
    })

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ session }),
    })

    const rawText = await response.text()
    let raw: unknown = null
    try {
      raw = rawText ? JSON.parse(rawText) : null
    } catch {
      raw = null
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: describeOpenAIError(raw, rawText, response.status),
        },
        { status: response.status },
      )
    }

    if (!isRecord(raw) || typeof raw.value !== 'string' || raw.value.length === 0) {
      return NextResponse.json(
        { error: 'OpenAI did not return a Realtime client secret.' },
        { status: 502 },
      )
    }

    const mintedSession = isRecord(raw.session) ? raw.session : null
    const mintedModel = readNonEmptyString(mintedSession?.model) ?? String(session.model)
    return NextResponse.json({
      value: raw.value,
      expires_at: typeof raw.expires_at === 'number' ? raw.expires_at : null,
      model: mintedModel,
    })
  } catch (err) {
    console.error('[optimate-realtime-secret] error:', err)
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to mint Realtime secret' },
      { status: 500 },
    )
  }
}

/**
 * Summarise which Vercel environment is actually executing this request, so a
 * missing-key error points at the right place to fix. `VERCEL_ENV` is
 * `production` | `preview` | `development`; the git/url fields are absent
 * outside Vercel (e.g. local `next dev`), in which case we report `local`.
 */
function describeEnvScope(): { env: string; commit: string | null; url: string | null; log: string } {
  const env = process.env.VERCEL_ENV ?? (process.env.VERCEL ? 'vercel-unknown' : 'local')
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null
  const url = process.env.VERCEL_URL ?? null
  return {
    env,
    commit,
    url,
    log: `env=${env} commit=${commit ?? 'n/a'} url=${url ?? 'n/a'}`,
  }
}

function buildRealtimeSession(input: {
  model: string
  instructions: string
  tools: unknown[]
  turnDetection: TurnDetectionConfig
}): Record<string, unknown> {
  const model = input.model
  const voice = normalizeVoice(process.env.OPTIMATE_REALTIME_VOICE)

  // GPT-Live uses a delegation architecture: a voice model handles conversation
  // while delegating tool use and reasoning to a backend (Responses delegation).
  // The session type is 'live' instead of 'realtime'.
  if (model === 'gpt-live-1') {
    return {
      type: 'live',
      model,
      instructions: input.instructions,
      output_modalities: ['audio'],
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: DEFAULT_SAMPLE_RATE },
          noise_reduction: { type: 'near_field' },
          transcription: { model: DEFAULT_REALTIME_TRANSCRIPTION_MODEL },
          turn_detection: input.turnDetection,
        },
        output: {
          format: { type: 'audio/pcm', rate: DEFAULT_SAMPLE_RATE },
          voice,
          speed: 1.0,
        },
      },
      max_output_tokens: 4096,
      tools: input.tools,
      tool_choice: 'auto',
      tracing: 'auto',
    }
  }

  return {
    type: 'realtime',
    model,
    instructions: input.instructions,
    output_modalities: ['audio'],
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: DEFAULT_SAMPLE_RATE },
        noise_reduction: { type: 'near_field' },
        transcription: { model: DEFAULT_REALTIME_TRANSCRIPTION_MODEL },
        turn_detection: input.turnDetection,
      },
      output: {
        format: { type: 'audio/pcm', rate: DEFAULT_SAMPLE_RATE },
        voice,
        speed: 1.0,
      },
    },
    max_output_tokens: 4096,
    ...(model.startsWith('gpt-realtime-2') ? { reasoning: { effort: 'minimal' } } : {}),
    tools: input.tools,
    tool_choice: 'auto',
    tracing: 'auto',
  }
}

function normalizeVoice(value: string | undefined): string {
  const voice = value?.trim()
  return voice && /^[a-z][a-z0-9_-]{1,40}$/i.test(voice) ? voice : DEFAULT_REALTIME_VOICE
}

function normalizeTurnDetection(value: unknown): TurnDetectionConfig {
  if (!isRecord(value)) {
    return {
      type: 'server_vad',
      threshold: 0.65,
      prefix_padding_ms: 500,
      silence_duration_ms: 1400,
      create_response: true,
      interrupt_response: false,
    }
  }

  return {
    type: value.type === 'semantic_vad' ? 'semantic_vad' : 'server_vad',
    threshold: typeof value.threshold === 'number' ? value.threshold : 0.65,
    prefix_padding_ms:
      typeof value.prefix_padding_ms === 'number' ? value.prefix_padding_ms : 500,
    silence_duration_ms:
      typeof value.silence_duration_ms === 'number' ? value.silence_duration_ms : 1400,
    create_response: typeof value.create_response === 'boolean' ? value.create_response : true,
    interrupt_response:
      typeof value.interrupt_response === 'boolean' ? value.interrupt_response : false,
  }
}

function describeOpenAIError(raw: unknown, text: string, status: number): string {
  if (isRecord(raw) && isRecord(raw.error) && typeof raw.error.message === 'string') {
    return raw.error.message
  }
  const trimmed = text.trim()
  return trimmed || `OpenAI Realtime client secret request failed (${status}).`
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
