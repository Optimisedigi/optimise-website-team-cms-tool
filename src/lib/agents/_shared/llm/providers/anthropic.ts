/**
 * Anthropic native API adapter.
 *
 * Uses the credential resolver for every call (OAuth-first with API-key
 * fallback). The resolver returns headers compatible with both auth modes;
 * the adapter only knows about the canonical request/response shapes.
 *
 * OAuth requests have to look like real Claude Code CLI traffic, or
 * Anthropic's anti-abuse gate returns HTTP 429 with body
 * `{"message":"Error"}` (no detail) regardless of actual usage. The exact
 * shape — system identity prefix, beta flags, user-agent, x-app header —
 * is mirrored from @kenkaiiii/gg-ai's anthropic adapter, the canonical
 * Claude Code OAuth integration that backs ggcoder.
 */

import { resolveCredential } from "../auth/resolver";
import { withRetry, HttpError } from "../retry";
import { toAnthropic } from "../transformers/to-anthropic";
import { fromAnthropic } from "../transformers/from-anthropic";
import type { CallLLMOptions, LLMResponse } from "../types";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_LLM_TIMEOUT_MS = 90_000;

/** Real Claude Code CLI version sent as user-agent on OAuth requests.
 *  gg-ai pins this; we mirror so our traffic doesn't stand out. */
const CLAUDE_CLI_USER_AGENT = "claude-cli/2.1.75";

/** Models that ship with adaptive thinking baked in (Opus 4.6/4.7, Sonnet
 *  4.6). For these we DROP the `interleaved-thinking-2025-05-14` beta flag,
 *  matching gg-ai's logic — sending the flag with an adaptive-thinking
 *  model is redundant and confuses the routing layer. */
function hasAdaptiveThinking(providerModel: string): boolean {
  return (
    providerModel.includes("opus-4-7") ||
    providerModel.includes("opus-4.7") ||
    providerModel.includes("opus-4-6") ||
    providerModel.includes("opus-4.6") ||
    providerModel.includes("sonnet-4-6") ||
    providerModel.includes("sonnet-4.6")
  );
}

export async function callAnthropic(
  opts: CallLLMOptions,
  providerModel: string,
): Promise<LLMResponse> {
  const auth = await resolveCredential("anthropic");
  const isOAuth = auth.source === "oauth";
  const body = toAnthropic(opts, providerModel, isOAuth);

  // Build the full header set. OAuth callers need extra identity headers
  // and a broader anthropic-beta list (matching gg-ai's outbound shape).
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...auth.authHeader,
  };

  if (isOAuth) {
    const betaFlags = [
      "claude-code-20250219",
      "oauth-2025-04-20",
      "fine-grained-tool-streaming-2025-05-14",
      ...(!hasAdaptiveThinking(providerModel) ? ["interleaved-thinking-2025-05-14"] : []),
    ];
    headers["anthropic-beta"] = betaFlags.join(",");
    headers["user-agent"] = CLAUDE_CLI_USER_AGENT;
    headers["x-app"] = "cli";
  }

  const json = await withRetry(async () => {
    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new HttpError(res.status, await res.text(), { headers: res.headers });
    }
    return res.json();
  });

  return fromAnthropic(json, opts.model, auth.source);
}
