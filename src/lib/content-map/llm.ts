/**
 * Content Map's model access. Follows the models the CMS has active instead of
 * a fixed list, and only ever uses subscription (OAuth) logins, so Content Map
 * never bills an API key:
 *
 *   1. OptiMate settings → "Content Map model", when set.
 *   2. OptiMate settings → "Default chat model" (the CMS's main model).
 *   3. Backups: the other models in the CMS model picker, at most one per
 *      provider, in the picker's order.
 *
 * A model is used only when its provider has a stored OAuth login that isn't
 * switched to "force fallback" (which would mean an API key). Models from a
 * provider without an active login are skipped.
 */

import type { Payload } from "payload";
import { callLLM } from "@/lib/agents/_shared/llm";
import { getCredential, isForceFallback } from "@/lib/agents/_shared/llm/auth/store";
import { CHAT_PICKER_MODELS, MODEL_REGISTRY, type CanonicalModelName } from "@/lib/agents/_shared/llm/registry";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";

export async function contentMapModelChain(
  payload: Payload,
  deps: {
    settings?: typeof getOptiMateDefaultModels;
    credential?: typeof getCredential;
    forceFallback?: typeof isForceFallback;
  } = {},
): Promise<CanonicalModelName[]> {
  const settings = await (deps.settings ?? getOptiMateDefaultModels)(payload);
  const credential = deps.credential ?? getCredential;
  const forceFallback = deps.forceFallback ?? isForceFallback;
  const activeByProvider = new Map<string, boolean>();
  const isActive = async (model: CanonicalModelName): Promise<boolean> => {
    const provider = MODEL_REGISTRY[model]?.provider;
    if (!provider) return false;
    if (!activeByProvider.has(provider)) {
      const [cred, forced] = await Promise.all([
        Promise.resolve().then(() => credential(provider)).catch(() => null),
        Promise.resolve().then(() => forceFallback(provider)).catch(() => false),
      ]);
      activeByProvider.set(provider, Boolean(cred && cred.kind === "oauth" && !forced));
    }
    return activeByProvider.get(provider) === true;
  };

  const chain: CanonicalModelName[] = [];
  const chosen = settings.contentMapModel;
  if (chosen) {
    if (await isActive(chosen)) chain.push(chosen);
    else console.warn(`[content-map] ignoring Content Map model "${chosen}": its provider has no active subscription (OAuth) login`);
  }
  const main = settings.defaultChatModel;
  if (main && !chain.includes(main) && (await isActive(main))) chain.push(main);
  // Backups from other providers, so one provider's outage or rate limit doesn't stop the run.
  const providers = new Set(chain.map((m) => MODEL_REGISTRY[m].provider));
  for (const { canonical } of CHAT_PICKER_MODELS) {
    const provider = MODEL_REGISTRY[canonical]?.provider;
    if (!provider || providers.has(provider) || chain.includes(canonical)) continue;
    if (await isActive(canonical)) {
      chain.push(canonical);
      providers.add(provider);
    }
  }
  return chain;
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
  if (!chain.length) throw new Error("No Content Map model is available: connect a subscription (OAuth) model login in the CMS");
  const [model, ...fallbackModels] = chain;
  const response = await (deps.call ?? callLLM)({
    model,
    fallbackModels,
    system: input.system,
    messages: [{ role: "user", content: [{ type: "text", text: input.user }] }],
    maxTokens: input.maxTokens ?? 4000,
    temperature: 0.3,
    // Light reasoning keeps these JSON tasks quick (and is still "on" for models that need it).
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
