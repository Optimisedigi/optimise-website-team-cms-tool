/**
 * Realtime token provider — the single swappable seam for where the OpenAI
 * Realtime ephemeral secret comes from.
 *
 * The default provider mints secrets through our own Next.js route using the
 * server-side OPENAI_API_KEY. The older local Electron helper bridge remains as
 * a fallback provider for single-machine testing.
 *
 * This module runs in the browser (the helper resolves `localhost` to the
 * user's own machine), so it must stay client-safe.
 */

/** The minted ephemeral secret the browser uses to open the WebRTC call. */
export interface RealtimeSecret {
  /** Ephemeral client secret, e.g. `ek_...`. Send as `Bearer <value>`. */
  value: string
  /** Epoch ms the secret expires, or null when the source didn't report it. */
  expiresAt: number | null
  /** Realtime model id the secret was minted for. */
  model: string
}

/** The session config minted against (instructions + tools come from OptiMate). */
export interface RealtimeSessionRequest {
  auditId: string
  session: Record<string, unknown>
}

export interface TokenProvider {
  /** Mint a fresh ephemeral secret for this audit + session config. */
  getSecret(request: RealtimeSessionRequest): Promise<RealtimeSecret>
  /** Whether the selected secret source is reachable + ready. */
  getStatus(): Promise<{ reachable: boolean; connected: boolean }>
}

// Use the IPv4 loopback literal, NOT `localhost`. On macOS `localhost` often
// resolves to IPv6 `::1` first, but the helper binds only to `127.0.0.1`
// (IPv4) — so `http://localhost:1456` hits `[::1]:1456`, gets connection
// refused, and the UI wrongly reports the helper as "not running".
const DEFAULT_HELPER_URL = 'http://127.0.0.1:1456'

function helperUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_OPTIMATE_VOICE_HELPER_URL
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : DEFAULT_HELPER_URL
}

/** Talks to the app server, which mints the secret with OPENAI_API_KEY. */
export const apiKeyProvider: TokenProvider = {
  async getSecret({ auditId, session }) {
    const response = await fetch('/api/optimate/realtime-secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auditId, session }),
    })
    const text = await response.text()
    if (!response.ok) {
      let message = text
      try {
        const parsed = JSON.parse(text) as { error?: string }
        if (parsed.error) message = parsed.error
      } catch {
        // keep raw text
      }
      throw new Error(`OptiMate rejected the Realtime secret request (${response.status}): ${message}`)
    }
    const raw = JSON.parse(text) as {
      value?: unknown
      expires_at?: unknown
      model?: unknown
    }
    if (typeof raw.value !== 'string' || raw.value.length === 0) {
      throw new Error('OptiMate secret route did not include a secret value.')
    }
    return {
      value: raw.value,
      expiresAt: typeof raw.expires_at === 'number' ? raw.expires_at : null,
      model: typeof raw.model === 'string' ? raw.model : 'gpt-realtime-mini',
    }
  },

  async getStatus() {
    return { reachable: true, connected: true }
  },
}

/**
 * Talks to the local Electron helper bridge. `localhost` resolves to the
 * machine running the browser, which is also the machine running the helper —
 * that's the whole single-user design.
 */
export const localBridgeProvider: TokenProvider = {
  async getSecret({ auditId, session }) {
    const response = await fetch(`${helperUrl()}/realtime-secret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auditId, session }),
    })
    const text = await response.text()
    if (!response.ok) {
      let message = text
      try {
        const parsed = JSON.parse(text) as { error?: string }
        if (parsed.error) message = parsed.error
      } catch {
        // keep raw text
      }
      throw new Error(`Voice helper rejected the secret request (${response.status}): ${message}`)
    }
    const raw = JSON.parse(text) as {
      value?: unknown
      expires_at?: unknown
      model?: unknown
    }
    if (typeof raw.value !== 'string' || raw.value.length === 0) {
      throw new Error('Voice helper response did not include a secret value.')
    }
    return {
      value: raw.value,
      expiresAt: typeof raw.expires_at === 'number' ? raw.expires_at : null,
      model: typeof raw.model === 'string' ? raw.model : 'gpt-realtime-2',
    }
  },

  async getStatus() {
    try {
      const response = await fetch(`${helperUrl()}/status`, { method: 'GET' })
      if (!response.ok) {
        return { reachable: true, connected: false }
      }
      const raw = (await response.json()) as { connected?: unknown }
      return { reachable: true, connected: raw.connected === true }
    } catch {
      // Network error / connection refused = helper not running.
      return { reachable: false, connected: false }
    }
  },
}

/**
 * Resolve the active provider from NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER.
 * Defaults to `api-key`. This is the ONLY place that decides where secrets come
 * from.
 */
export function getTokenProvider(): TokenProvider {
  const selected = (process.env.NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER ?? 'api-key').trim()
  switch (selected) {
    case 'api-key':
      return apiKeyProvider
    case 'local':
      return localBridgeProvider
    default:
      throw new Error(
        `Unknown OptiMate voice provider "${selected}". Set NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER=api-key or local.`,
      )
  }
}

/** Whether voice is enabled at all (feature flag = provider env var present). */
export function isVoiceEnabled(): boolean {
  return true
}
