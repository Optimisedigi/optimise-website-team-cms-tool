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
}

/** True if the model is canonical AND still offered in the chat picker. */
function isUsablePickerModel(value: unknown): value is CanonicalModelName {
  return (
    typeof value === "string" &&
    isCanonicalModel(value) &&
    CHAT_PICKER_MODELS.some((m) => m.canonical === value)
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
    } | null;

    const blogPrompterModel = isUsablePickerModel(global?.blogPrompterModel)
      ? global.blogPrompterModel
      : undefined;

    return {
      defaultChatModel: isUsablePickerModel(global?.defaultChatModel)
        ? global.defaultChatModel
        : DEFAULT_CHAT_MODEL,
      defaultAutonomousModel: isUsablePickerModel(global?.defaultAutonomousModel)
        ? global.defaultAutonomousModel
        : DEFAULT_AUTONOMOUS_MODEL,
      ...(blogPrompterModel ? { blogPrompterModel } : {}),
    };
  } catch (err) {
    console.warn(
      "[optimate-default-models] Could not read optimate-settings global; using registry defaults.",
      err,
    );
    return {
      defaultChatModel: DEFAULT_CHAT_MODEL,
      defaultAutonomousModel: DEFAULT_AUTONOMOUS_MODEL,
    };
  }
}
