/**
 * Content Map's model access. Runs on the CMS's subscription (OAuth) models
 * so link edits and Write next ideas never bill an API key by default:
 *
 *   OptiMate settings → "Content Map model" (explicit choice, used first)
 *   then Kimi K3 (Kimi OAuth) → Claude Sonnet (only when Claude OAuth is
 *   connected; otherwise the resolver would use ANTHROPIC_API_KEY) → Grok
 *   (SuperGrok OAuth) → GPT via Codex (ChatGPT OAuth).
 */

import type { Payload } from "payload";
import { callLLM } from "@/lib/agents/_shared/llm";
import { getCredential } from "@/lib/agents/_shared/llm/auth/store";
import { MODEL_REGISTRY, type CanonicalModelName } from "@/lib/agents/_shared/llm/registry";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";

/** Subscription-only models, in fallback order. */
export const CONTENT_MAP_OAUTH_CHAIN: CanonicalModelName[] = ["kimi-k3", "claude-sonnet-5.5", "grok-4.6", "gpt-5.6-terra"];

/** Providers whose only credential is OAuth (no billed API-key path in the resolver). */
const OAUTH_ONLY_PROVIDERS = new Set(["kimi-coding", "xai-grok", "openai-codex"]);

export async function contentMapModelChain(
  payload: Payload,
  deps: {
    settings?: typeof getOptiMateDefaultModels;
    credential?: typeof getCredential;
  } = {},
): Promise<CanonicalModelName[]> {
  const settings = await (deps.settings ?? getOptiMateDefaultModels)(payload);
  const credential = deps.credential ?? getCredential;
  const chain: CanonicalModelName[] = [];
  for (const model of CONTENT_MAP_OAUTH_CHAIN) {
    const provider = MODEL_REGISTRY[model].provider;
    if (OAUTH_ONLY_PROVIDERS.has(provider)) {
      chain.push(model);
      continue;
    }
    // Anthropic falls back to ANTHROPIC_API_KEY when OAuth is not connected, so
    // only include Claude when a stored OAuth credential exists.
    const cred = await credential(provider).catch(() => null);
    if (cred && cred.kind === "oauth") chain.push(model);
  }
  const chosen = settings.contentMapModel;
  return chosen ? [chosen, ...chain.filter((m) => m !== chosen)] : chain;
}

export interface ContentMapLlmResult {
  text: string;
  model: string;
}

/** One-shot text call through the Content Map chain. */
export async function callContentMapModel(
  payload: Payload,
  input: { system: string; user: string; maxTokens?: number; timeoutMs?: number },
  deps: { call?: typeof callLLM; chain?: CanonicalModelName[] } = {},
): Promise<ContentMapLlmResult> {
  const chain = deps.chain ?? (await contentMapModelChain(payload));
  if (!chain.length) throw new Error("No Content Map model is available");
  const [model, ...fallbackModels] = chain;
  const response = await (deps.call ?? callLLM)({
    model,
    fallbackModels,
    system: input.system,
    messages: [{ role: "user", content: [{ type: "text", text: input.user }] }],
    maxTokens: input.maxTokens ?? 4000,
    temperature: 0.3,
    // Kimi K3 only serves K3 with reasoning on; low keeps it quick for JSON tasks.
    reasoningMode: "low",
    timeoutMs: input.timeoutMs ?? 90_000,
  });
  const text = response.message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
  return { text, model: response.model };
}

/** Pull the first JSON object or array out of a model reply (tolerates ``` fences and prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    /* fall through to bracket scan */
  }
  const starts = [body.indexOf("{"), body.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  const end = body.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}
