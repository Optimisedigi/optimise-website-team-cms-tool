/**
 * Single reader for the OptiMate default-model settings.
 *
 * Reads the `optimate-settings` global and returns the configured chat /
 * autonomous default models, falling back to the registry constants when:
 *  - the global has never been saved (findGlobal returns empty),
 *  - a stored value is not a canonical model name, or
 *  - a stored value has since been removed from the chat picker.
 *
 * Centralising the fallback here means every consumer (the chat API, the
 * autonomous tick, the picker-seed endpoint) agrees on the same resolution
 * and on the same safety net. Never throws — a settings-read failure must not
 * break a chat turn, so it logs and falls back.
 */

import { getPayload } from "payload";
import config from "@/payload.config";
import {
  CHAT_PICKER_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_AUTONOMOUS_MODEL,
  isCanonicalModel,
  type CanonicalModelName,
} from "./llm/registry";

export interface OptiMateDefaultModels {
  defaultChatModel: CanonicalModelName;
  defaultAutonomousModel: CanonicalModelName;
  /** Optional task-specific model for Blog Prompter AI Suggest. */
  blogPrompterModel?: CanonicalModelName;
  /** Optional task-specific model for the Xero invoice assistant. */
  invoiceAssistantModel?: CanonicalModelName;
  /** Approximate token budget for chat history before compacting older turns. */
  chatHistoryTokenLimit: number;
}

/** True if the model is canonical AND still offered in the chat picker. */
function normaliseModelName(value: unknown): unknown {
  if (value === "gpt-5.5-codex-medium" || value === "gpt-5.5-codex-low") return "gpt-5.5-codex";
  return value;
}

function isUsablePickerModel(value: unknown): value is CanonicalModelName {
  const model = normaliseModelName(value);
  return (
    typeof model === "string" &&
    isCanonicalModel(model) &&
    CHAT_PICKER_MODELS.some((m) => m.canonical === model)
  );
}

function resolvePickerModel(value: unknown): CanonicalModelName | undefined {
  const model = normaliseModelName(value);
  return isUsablePickerModel(model) ? model : undefined;
}

const DEFAULT_CHAT_HISTORY_TOKEN_LIMIT = 6000;
const MIN_CHAT_HISTORY_TOKEN_LIMIT = 1000;
const MAX_CHAT_HISTORY_TOKEN_LIMIT = 30000;

function resolveChatHistoryTokenLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CHAT_HISTORY_TOKEN_LIMIT;
  return Math.min(
    MAX_CHAT_HISTORY_TOKEN_LIMIT,
    Math.max(MIN_CHAT_HISTORY_TOKEN_LIMIT, Math.round(parsed)),
  );
}

/**
 * Resolve the configured defaults. `payloadOverride` lets callers that already
 * hold a Payload instance avoid a second getPayload() (e.g. inside a route
 * that has one). Most callers omit it.
 */
export async function getOptiMateDefaultModels(
  payloadOverride?: Awaited<ReturnType<typeof getPayload>>,
): Promise<OptiMateDefaultModels> {
  try {
    const payload = payloadOverride ?? (await getPayload({ config: await config }));
    const global = (await payload.findGlobal({
      slug: "optimate-settings",
      overrideAccess: true,
    })) as {
      defaultChatModel?: unknown;
      defaultAutonomousModel?: unknown;
      blogPrompterModel?: unknown;
      invoiceAssistantModel?: unknown;
      chatHistoryTokenLimit?: unknown;
    } | null;

    const blogPrompterModel = resolvePickerModel(global?.blogPrompterModel);
    const invoiceAssistantModel = resolvePickerModel(global?.invoiceAssistantModel);

    return {
      defaultChatModel: resolvePickerModel(global?.defaultChatModel) ?? DEFAULT_CHAT_MODEL,
      defaultAutonomousModel: resolvePickerModel(global?.defaultAutonomousModel) ?? DEFAULT_AUTONOMOUS_MODEL,
      chatHistoryTokenLimit: resolveChatHistoryTokenLimit(global?.chatHistoryTokenLimit),
      ...(blogPrompterModel ? { blogPrompterModel } : {}),
      ...(invoiceAssistantModel ? { invoiceAssistantModel } : {}),
    };
  } catch (err) {
    console.warn(
      "[optimate-default-models] Could not read optimate-settings global; using registry defaults.",
      err,
    );
    return {
      defaultChatModel: DEFAULT_CHAT_MODEL,
      defaultAutonomousModel: DEFAULT_AUTONOMOUS_MODEL,
      chatHistoryTokenLimit: DEFAULT_CHAT_HISTORY_TOKEN_LIMIT,
    };
  }
}
