/**
 * OpenAI-compatible API adapter.
 *
 * One adapter for any provider that exposes the OpenAI Chat Completions
 * shape. Today: Moonshot (Kimi), MiniMax. Parameterised by baseUrl + provider.
 */

import { resolveCredential } from "../auth/resolver";
import { withRetry, HttpError } from "../retry";
import { toOpenAI } from "../transformers/to-openai";
import { fromOpenAI } from "../transformers/from-openai";
import type { CallLLMOptions, LLMResponse } from "../types";
import type { ProviderName } from "../registry";

export async function callOpenAICompatible(
  opts: CallLLMOptions,
  providerModel: string,
  config: { provider: ProviderName; baseUrl: string },
): Promise<LLMResponse> {
  const auth = await resolveCredential(config.provider);
  const body = toOpenAI(opts, providerModel);

  const json = await withRetry(async () => {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...auth.authHeader,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new HttpError(res.status, await res.text());
    }
    return res.json();
  });

  return fromOpenAI(json, opts.model, auth.source);
}
