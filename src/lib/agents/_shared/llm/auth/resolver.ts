/**
 * Credential resolver. The single entry point every adapter uses to obtain
 * an auth header for an outbound LLM call.
 *
 * Resolution semantics (Option B per the build conversation 2026-05-07):
 *
 *   1. If the provider supports OAuth AND no force-fallback flag AND a
 *      stored OAuth credential exists, refresh it if needed and return it.
 *      Mark source='oauth'.
 *   2. If step 1 threw (token revoked, refresh failed, OAuth-endpoint
 *      network error), DO NOT silently fall through to the env API key.
 *      Log an oauth-failed event to the activity log and throw
 *      OAuthFailedError. The agent loop classifies this as non-retryable
 *      and walks down fallbackModels (typically Kimi -> MiniMax).
 *   3. If no OAuth credential is stored for this provider (i.e. OAuth was
 *      never connected, not a failure), use the env-var API key with
 *      source='api-key'. This is a chosen path, not a fallback.
 *   4. If neither OAuth nor API key is available, throw NoCredentialError;
 *      the agent loop walks down the chain.
 *
 * Why the asymmetry: OAuth being silently swapped for billed Anthropic API
 * was a footgun (silent cost surprise, user couldn't see when it happened).
 * The user explicitly wants OAuth failures to fall through to a different
 * provider entirely, with visibility on every transition.
 */

import { PROVIDER_CONFIG, type ProviderName } from "../registry";
import {
  getCredential,
  setCredential,
  isForceFallback,
  setRefreshLock,
  getRefreshLock,
} from "./store";
import { isExpiringSoon, refreshAnthropicCredential } from "./oauth/anthropic";
import {
  isCodexExpiringSoon,
  refreshCodexCredential,
  codexAuthHeaders,
} from "./oauth/openai-codex";
import { NoCredentialError, type ResolvedAuth, type OAuthCredential } from "./types";
import { recordAuthEvent } from "./events";

export class OAuthFailedError extends Error {
  constructor(
    public provider: ProviderName,
    public reason: string,
    public originalError: unknown,
  ) {
    super(`OAuth resolution failed for ${provider}: ${reason}`);
    this.name = "OAuthFailedError";
  }
}

function envApiKeyFor(provider: ProviderName): string | undefined {
  switch (provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "moonshot":
      // The rest of the CMS uses KIMI_API_KEY (Xero chat, blog generator,
      // ad-copy gen, negative sweep). MOONSHOT_API_KEY accepted as an alias
      // so this code stays portable; KIMI_API_KEY wins if both set.
      return process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY;
    case "minimax":
      return process.env.MINIMAX_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "openai-codex":
      // Codex is OAuth-only — there is no API key for the subscription path.
      // Returning undefined makes the resolver throw NoCredentialError when
      // OAuth isn't connected, which the agent loop walks past.
      return undefined;
    default: {
      const _exhaust: never = provider;
      void _exhaust;
      return undefined;
    }
  }
}

function apiKeyAuthHeader(
  provider: ProviderName,
  apiKey: string,
): Record<string, string> {
  if (provider === "anthropic") {
    // Anthropic API key auth uses x-api-key, not Authorization.
    return { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  }
  // OpenAI-compatible providers use Bearer.
  return { Authorization: `Bearer ${apiKey}` };
}

function isOAuthExpiringSoon(cred: OAuthCredential): boolean {
  return cred.provider === "openai-codex" ? isCodexExpiringSoon(cred) : isExpiringSoon(cred);
}

async function refreshOAuthCredential(cred: OAuthCredential): Promise<OAuthCredential> {
  return cred.provider === "openai-codex"
    ? refreshCodexCredential(cred)
    : refreshAnthropicCredential(cred);
}

async function refreshIfNeeded(cred: OAuthCredential): Promise<OAuthCredential> {
  if (!isOAuthExpiringSoon(cred)) return cred;
  const inFlight = getRefreshLock(cred.provider);
  if (inFlight) {
    const result = (await inFlight) as OAuthCredential;
    return result;
  }
  const refreshPromise = (async () => {
    const refreshed = await refreshOAuthCredential(cred);
    await setCredential(cred.provider, refreshed);
    return refreshed;
  })();
  return setRefreshLock(cred.provider, refreshPromise);
}

export async function resolveCredential(provider: ProviderName): Promise<ResolvedAuth> {
  const provCfg = PROVIDER_CONFIG[provider];

  if (provCfg.supportsOAuth) {
    // Env kill-switch: when CODEX_OAUTH_DISABLED is set, behave as if no Codex
    // credential is stored at all (skip OAuth entirely) so the agent falls
    // through its fallback chain. Infra-level off switch, independent of the
    // DB forceFallback flag. Only affects the Codex provider.
    const codexDisabled =
      provider === "openai-codex" && Boolean(process.env.CODEX_OAUTH_DISABLED);
    const forced = await isForceFallback(provider);
    const stored = forced || codexDisabled ? null : await getCredential(provider);

    if (stored?.kind === "oauth") {
      // OAuth was connected. We MUST use it or hard-fail; we never silently
      // fall through to billed API for the same provider.
      try {
        const refreshed = await refreshIfNeeded(stored);
        let authHeader: Record<string, string> | null = null;
        if (provider === "anthropic") {
          // The adapter composes the rest (anthropic-beta, user-agent, x-app).
          // We only return the auth identity here.
          authHeader = {
            Authorization: `Bearer ${refreshed.accessToken}`,
            "anthropic-version": "2023-06-01",
          };
        } else if (provider === "openai-codex") {
          // Bearer token + chatgpt-account-id. The adapter composes the rest
          // (OpenAI-Beta, originator, User-Agent, Content-Type).
          authHeader = codexAuthHeaders(refreshed);
        }
        if (authHeader) {
          // Record success quietly; only failures get a notification.
          await recordAuthEvent({
            provider,
            kind: "oauth-success",
            message: "OAuth credential refreshed and used.",
          }).catch(() => {});
          return { authHeader, source: "oauth", credential: refreshed };
        }
      } catch (err) {
        const reason = (err as Error).message ?? "unknown";
        console.warn(
          `[resolver] OAuth resolution failed for ${provider}: ${reason}. Throwing OAuthFailedError; agent loop will fall through to next provider.`,
        );
        // Loud audit trail. The chat surface and agent-auth page both read
        // these events to surface the failure to the user.
        await recordAuthEvent({
          provider,
          kind: "oauth-failed",
          message: reason,
        }).catch(() => {});
        throw new OAuthFailedError(provider, reason, err);
      }
    }
  }

  // API key path. Reached when:
  //  (a) provider doesn't support OAuth (Kimi, MiniMax), OR
  //  (b) OAuth was never connected for this provider, OR
  //  (c) force-fallback toggle is on (admin emergency switch).
  // This is NOT reached after an OAuth refresh failure; that throws above.
  const envKey = envApiKeyFor(provider);
  if (envKey) {
    return {
      authHeader: apiKeyAuthHeader(provider, envKey),
      source: "api-key",
      credential: { kind: "api-key", provider, apiKey: envKey, label: "env" },
    };
  }

  // Stored API key (future per-client keys go here too)
  const stored = await getCredential(provider);
  if (stored?.kind === "api-key" && stored.apiKey) {
    return {
      authHeader: apiKeyAuthHeader(provider, stored.apiKey),
      source: "api-key",
      credential: stored,
    };
  }

  throw new NoCredentialError(provider);
}
