import type { GlobalConfig } from "payload";
import { globalAccess, hideGlobalUnlessFeature } from "../lib/access";
import {
  CHAT_PICKER_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_AUTONOMOUS_MODEL,
} from "../lib/agents/_shared/llm/registry";

/**
 * OptiMate agent settings.
 *
 * Currently holds the default model selections for the Optimate-Google-Ads
 * agent:
 *  - `defaultChatModel` seeds the chat model picker the first time a user opens
 *    OptiMate (before they've made their own per-browser choice) and is the
 *    model the API uses when a chat request omits an explicit `model`.
 *  - `defaultAutonomousModel` is the model used for unattended runs (scheduled
 *    tasks / cron) where there is no human picking a model.
 *
 * Both fall back to the registry constants (DEFAULT_CHAT_MODEL /
 * DEFAULT_AUTONOMOUS_MODEL) if unset or pointing at a model that's since been
 * removed from the picker — that fallback lives in
 * `src/lib/agents/_shared/optimate-default-models.ts`, the single reader.
 *
 * Options are sourced from CHAT_PICKER_MODELS so this dropdown always matches
 * the models the chat UI offers (including the new gpt-5.5-codex-* entries).
 */
const MODEL_REASONING_LABELS: Record<string, "thinking" | "non-thinking" | "light thinking"> = {
  "claude-sonnet-4.6": "thinking",
  "claude-sonnet-4.5": "thinking",
  "claude-opus-4.7": "thinking",
  "claude-haiku-4.5": "light thinking",
  "kimi-k2.6": "thinking",
  "minimax-m2.7": "thinking",
  "gpt-5.5": "thinking",
  "gpt-4.1": "non-thinking",
  "gpt-4o": "non-thinking",
  "gpt-5.5-codex-medium": "thinking",
  "gpt-5.5-codex-low": "thinking",
};

const MODEL_OPTIONS = CHAT_PICKER_MODELS.map((m) => ({
  label: `${m.label} — ${MODEL_REASONING_LABELS[m.canonical] ?? "thinking"}`,
  value: m.canonical,
}));

export const OptiMateSettings: GlobalConfig = {
  slug: "optimate-settings",
  label: "OptiMate Settings",
  admin: {
    group: "Agent",
    description:
      "Default models for the OptiMate Google Ads agent. The chat default seeds the model picker and is used when a request doesn't specify a model; the autonomous default is used for scheduled/cron runs.",
    hidden: hideGlobalUnlessFeature("optimate-settings"),
  },
  access: globalAccess("optimate-settings"),
  fields: [
    {
      name: "memoryTokenUsage",
      type: "ui",
      admin: {
        components: {
          Field: "./components/agent/MemoryTokenUsagePanel",
        },
      },
    },
    {
      name: "defaultChatModel",
      type: "select",
      options: MODEL_OPTIONS,
      defaultValue: DEFAULT_CHAT_MODEL,
      required: true,
      admin: {
        description:
          "Model the OptiMate chat picker defaults to, and the model used when a chat request doesn't pick one. Users can still switch models per-conversation.",
      },
    },
    {
      name: "defaultAutonomousModel",
      type: "select",
      options: MODEL_OPTIONS,
      defaultValue: DEFAULT_AUTONOMOUS_MODEL,
      required: true,
      admin: {
        description:
          "Model used for unattended runs (scheduled tasks, cron) where no human picks a model.",
      },
    },
    {
      name: "blogPrompterModel",
      type: "select",
      options: MODEL_OPTIONS,
      label: "Blog Prompter AI model",
      admin: {
        description:
          "Optional. Model used only by the Blog Prompter AI Suggest button. Leave blank to use the autonomous default. Non-thinking models (GPT-4.1 / GPT-4o) are best for strict JSON tasks if OpenAI is connected.",
      },
    },
  ],
};
