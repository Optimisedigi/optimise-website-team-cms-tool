/**
 * Anthropic-compatible API adapter for providers that expose /v1/messages but
 * authenticate with a standard Bearer API key. Today: MiniMax M3.
 */

import { resolveCredential } from "../auth/resolver";
import { withRetry, HttpError } from "../retry";
import { toAnthropic } from "../transformers/to-anthropic";
import { fromAnthropic } from "../transformers/from-anthropic";
import type { ProviderName } from "../registry";
import type { CallLLMOptions, LLMResponse } from "../types";

const DEFAULT_LLM_TIMEOUT_MS = 90_000;

export async function callAnthropicCompatible(
  opts: CallLLMOptions,
  providerModel: string,
  config: { provider: ProviderName; baseUrl: string },
): Promise<LLMResponse> {
  const auth = await resolveCredential(config.provider);
  const body = toAnthropic(opts, providerModel, false);

  const json = await withRetry(async () => {
    const res = await fetch(`${config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...auth.authHeader,
      },
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
