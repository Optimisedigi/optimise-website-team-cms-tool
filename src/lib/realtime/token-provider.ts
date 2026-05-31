/**
 * Realtime token provider — the single swappable seam for where the OpenAI
 * Realtime ephemeral secret comes from.
 *
 * Today the only provider is the local Electron helper bridge (a stripped-down
 * Brah running on 127.0.0.1 that holds the ChatGPT-OAuth credentials and mints
 * the secret). This keeps the deployment single-user / single-machine and
 * avoids a paid OPENAI_API_KEY.
 *
 * To go multi-user later, add an `apiKeyProvider` that mints the secret from a
 * Vercel route using OPENAI_API_KEY and flip NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER
 * — nothing in the voice UI or tool-bridge needs to change.
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
  /** Whether the source is reachable + connected (helper running + signed in). */
  getStatus(): Promise<{ reachable: boolean; connected: boolean }>
}

const DEFAULT_HELPER_URL = 'http://localhost:1456'

function helperUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_OPTIMATE_VOICE_HELPER_URL
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : DEFAULT_HELPER_URL
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
 * Defaults to `local`. This is the ONLY place that decides where secrets come
 * from.
 */
export function getTokenProvider(): TokenProvider {
  const selected = (process.env.NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER ?? 'local').trim()
  switch (selected) {
    case 'local':
      return localBridgeProvider
    default:
      throw new Error(
        `Unknown OptiMate voice provider "${selected}". Set NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER=local.`,
      )
  }
}

/** Whether voice is enabled at all (feature flag = provider env var present). */
export function isVoiceEnabled(): boolean {
  return true
}
