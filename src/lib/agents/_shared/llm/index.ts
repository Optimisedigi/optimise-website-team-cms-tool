/**
 * Top-level LLM entry point. Looks up the model in the registry, dispatches
 * to the right provider adapter, and walks the fallbackModels chain on
 * recoverable errors.
 *
 *   const response = await callLLM({
 *     model: 'claude-sonnet-4.5',
 *     fallbackModels: ['kimi-k2.6', 'minimax-m2.7'],
 *     system: '...',
 *     messages: [...],
 *     tools: [...],
 *   })
 */

import { MODEL_REGISTRY, PROVIDER_CONFIG, type CanonicalModelName } from "./registry";
import { classifyError, isRetryable } from "./retry";
import { callAnthropic } from "./providers/anthropic";
import { callOpenAICompatible } from "./providers/openai-compatible";
import { callOpenAICodex } from "./providers/openai-codex";
import { NoCredentialError } from "./auth/types";
import { OAuthFailedError } from "./auth/resolver";
import type { CallLLMOptions, LLMResponse } from "./types";

export class AggregateLLMError extends Error {
  constructor(
    public readonly tried: string[],
    public readonly errors: Array<{ model: string; error: unknown }>,
  ) {
    super(
      `All models failed (${tried.join(", ")}). Last error: ${
        (errors[errors.length - 1]?.error as Error | undefined)?.message ?? "unknown"
      }`,
    );
    this.name = "AggregateLLMError";
  }
}

export async function callLLM(opts: CallLLMOptions): Promise<LLMResponse> {
  const chain = [opts.model, ...(opts.fallbackModels ?? [])];
  const tried: string[] = [];
  const errors: Array<{ model: string; error: unknown }> = [];

  for (const modelName of chain) {
    if (!(modelName in MODEL_REGISTRY)) {
      errors.push({ model: modelName, error: new Error(`Unknown model: ${modelName}`) });
      continue;
    }
    const entry = MODEL_REGISTRY[modelName as CanonicalModelName];
    const provCfg = PROVIDER_CONFIG[entry.provider];
    tried.push(modelName);

    try {
      if (provCfg.handler === "callAnthropic") {
        return await callAnthropic({ ...opts, model: modelName }, entry.model);
      }
      if (provCfg.handler === "callOpenAICodex") {
        return await callOpenAICodex(
          { ...opts, model: modelName },
          entry.model,
          { baseUrl: provCfg.baseUrl },
        );
      }
      // callOpenAICompatible
      return await callOpenAICompatible(
        { ...opts, model: modelName },
        entry.model,
        { provider: entry.provider, baseUrl: provCfg.baseUrl },
      );
    } catch (err) {
      const cls = classifyError(err);
      errors.push({ model: modelName, error: err });

      // Non-retryable + non-fallback-eligible errors abort immediately. The
      // caller almost certainly wants to know about a malformed request or
      // context overflow rather than blindly trying a different model.
      if (cls === "invalid-request" || cls === "context-overflow") {
        throw err;
      }
      // NoCredentialError, OAuthFailedError, rate limits, transient errors:
      // try the next model. OAuthFailedError specifically encodes the user's
      // Option B preference: when Anthropic OAuth dies, walk to Kimi rather
      // than silently switching to billed Anthropic API.
      if (
        err instanceof NoCredentialError ||
        err instanceof OAuthFailedError ||
        isRetryable(cls) ||
        cls === "auth" ||
        cls === "unknown"
      ) {
        continue;
      }
      // Anything else: also fall through, the loop tries the next model.
      continue;
    }
  }

  throw new AggregateLLMError(tried, errors);
}

export type { CallLLMOptions, LLMResponse } from "./types";
