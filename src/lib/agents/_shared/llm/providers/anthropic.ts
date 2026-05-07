/**
 * Anthropic native API adapter.
 *
 * Uses the credential resolver for every call (OAuth-first with API-key
 * fallback). The resolver returns headers compatible with both auth modes;
 * the adapter only knows about the canonical request/response shapes.
 */

import { resolveCredential } from "../auth/resolver";
import { withRetry, HttpError } from "../retry";
import { toAnthropic } from "../transformers/to-anthropic";
import { fromAnthropic } from "../transformers/from-anthropic";
import type { CallLLMOptions, LLMResponse } from "../types";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export async function callAnthropic(
  opts: CallLLMOptions,
  providerModel: string,
): Promise<LLMResponse> {
  const auth = await resolveCredential("anthropic");
  const body = toAnthropic(opts, providerModel);

  const json = await withRetry(async () => {
    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
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

  return fromAnthropic(json, opts.model, auth.source);
}
