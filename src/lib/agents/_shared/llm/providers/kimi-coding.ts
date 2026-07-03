import { kimiAuthHeaders } from "../auth/oauth/kimi-coding";
import { resolveCredential } from "../auth/resolver";
import { withRetry, HttpError } from "../retry";
import { fromOpenAI } from "../transformers/from-openai";
import { toOpenAI } from "../transformers/to-openai";
import type { CallLLMOptions, LLMResponse, ReasoningMode } from "../types";

const DEFAULT_LLM_TIMEOUT_MS = 120_000;
const CHAT_COMPLETIONS_PATH = "/chat/completions";
const PROMPT_CACHE_KEY = "content-cms-optimate";

type KimiRequestBody = ReturnType<typeof toOpenAI> & {
  prompt_cache_key?: string;
  thinking?: { type: "enabled" | "disabled" };
  reasoning_effort?: "low" | "medium" | "high";
};

function applyReasoning(body: KimiRequestBody, reasoningMode: ReasoningMode | undefined): void {
  if (!reasoningMode || reasoningMode === "off") {
    body.thinking = { type: "disabled" };
    delete body.reasoning_effort;
    return;
  }
  body.thinking = { type: "enabled" };
  body.reasoning_effort = reasoningMode;
}

export async function callKimiCoding(
  opts: CallLLMOptions,
  providerModel: string,
  config: { baseUrl: string },
): Promise<LLMResponse> {
  const auth = await resolveCredential("kimi-coding");
  if (auth.credential.kind !== "oauth") {
    throw new Error("Kimi For Coding requires OAuth credentials.");
  }

  const credential = auth.credential;
  const body: KimiRequestBody = toOpenAI(opts, credential.kimiModelId ?? providerModel);
  body.prompt_cache_key = PROMPT_CACHE_KEY;
  // Kimi For Coding rejects arbitrary temperatures; if a caller supplied one
  // through the shared LLM options, normalize it to the only accepted value.
  if (body.temperature !== undefined) body.temperature = 0.6;
  applyReasoning(body, opts.reasoningMode);

  const json = await withRetry(async () => {
    const res = await fetch(`${config.baseUrl.replace(/\/+$/, "")}${CHAT_COMPLETIONS_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...kimiAuthHeaders(credential),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new HttpError(res.status, await res.text(), { headers: res.headers });
    }
    return res.json();
  });

  return fromOpenAI(json, opts.model, auth.source);
}

