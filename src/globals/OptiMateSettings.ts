import type { GlobalConfig } from "payload";
import { globalAccess, hideGlobalUnlessFeature } from "../lib/access";
import {
  CHAT_PICKER_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_AUTONOMOUS_MODEL,
} from "../lib/agents/_shared/llm/registry";
import {
  DEFAULT_GOOGLE_MATE_PORTFOLIO_STARTER_QUESTIONS,
  DEFAULT_GOOGLE_MATE_STARTER_QUESTIONS,
  DEFAULT_INVOICE_MATE_STARTER_QUESTIONS,
} from "../lib/agents/_shared/optimate-starter-questions";
import { DEFAULT_VOICE_REALTIME_MODEL } from "../lib/agents/_shared/optimate-default-models";

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
 *  - `invoiceAssistantModel` is the model used by the Xero invoice assistant.
 *  - `voiceRealtimeModel` is the model used for live OptiMate voice calls.
 *
 * Both fall back to the registry constants (DEFAULT_CHAT_MODEL /
 * DEFAULT_AUTONOMOUS_MODEL) if unset or pointing at a model that's since been
 * removed from the picker — that fallback lives in
 * `src/lib/agents/_shared/optimate-default-models.ts`, the single reader.
 *
 * Options are sourced from CHAT_PICKER_MODELS so this dropdown always matches
 * the models the chat UI offers. Plain OpenAI API-key models are deliberately
 * omitted until OPENAI_API_KEY is configured.
 */
const MODEL_OPTIONS = CHAT_PICKER_MODELS.map((m) => ({
  label: m.label,
  value: m.canonical,
}));

const REALTIME_MODEL_OPTIONS = [
  {
    label: "GPT Realtime Mini (~$0.90/hr, cheaper/faster)",
    value: "gpt-realtime-mini",
  },
  {
    label: "GPT Realtime 2 (~$2.88/hr, stronger tool use)",
    value: "gpt-realtime-2",
  },
];

const MODEL_OPTION_VALUES = new Set<string>(MODEL_OPTIONS.map((option) => option.value));
const REALTIME_MODEL_OPTION_VALUES = new Set<string>(REALTIME_MODEL_OPTIONS.map((option) => option.value));

function normaliseOptionalPickerModel(value: unknown): string | undefined {
  return typeof value === "string" && MODEL_OPTION_VALUES.has(value) ? value : undefined;
}

function normaliseRequiredPickerModel(value: unknown, fallback: string): string {
  return typeof value === "string" && MODEL_OPTION_VALUES.has(value) ? value : fallback;
}

function normaliseRealtimeModel(value: unknown): string {
  return typeof value === "string" && REALTIME_MODEL_OPTION_VALUES.has(value)
    ? value
    : DEFAULT_VOICE_REALTIME_MODEL;
}

function starterQuestionDefaults(questions: readonly string[]): Array<{ question: string }> {
  return questions.map((question) => ({ question }));
}

function starterQuestionField(name: string, label: string, questions: readonly string[]) {
  return {
    name,
    type: "array" as const,
    label,
    defaultValue: starterQuestionDefaults(questions),
    admin: {
      description:
        "Starter prompt chips shown on the empty OptiMate chat screen. Users can click a chip to send that question immediately.",
    },
    fields: [
      {
        name: "question",
        type: "text" as const,
        required: true,
        maxLength: 240,
      },
    ],
  };
}

export const OptiMateSettings: GlobalConfig = {
  slug: "optimate-settings",
  label: "OptiMate Settings",
  admin: {
    group: "OptiMate",
    description:
      "Default models for the OptiMate Google Ads agent. The chat default seeds the model picker and is used when a request doesn't specify a model; the autonomous default is used for scheduled/cron runs.",
    hidden: hideGlobalUnlessFeature("optimate-settings"),
  },
  access: globalAccess("optimate-settings"),
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data;

        data.defaultChatModel = normaliseRequiredPickerModel(data.defaultChatModel, DEFAULT_CHAT_MODEL);
        data.defaultAutonomousModel = normaliseRequiredPickerModel(data.defaultAutonomousModel, DEFAULT_AUTONOMOUS_MODEL);
        data.voiceRealtimeModel = normaliseRealtimeModel(data.voiceRealtimeModel);
        data.blogPrompterModel = normaliseOptionalPickerModel(data.blogPrompterModel);
        data.invoiceAssistantModel = normaliseOptionalPickerModel(data.invoiceAssistantModel);
        data.emailAssistantModel = normaliseOptionalPickerModel(data.emailAssistantModel);

        return data;
      },
    ],
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Models & Chat",
          fields: [
            {
              name: "reasoningNote",
              type: "ui",
              admin: {
                components: {
                  Field: {
                    path: "@payloadcms/ui#Banner",
                    clientProps: {
                      type: "info",
                      children:
                        "Reasoning is now controlled per request in the OptiMate chat UI. It defaults to off for routine requests; turn it on only for complex multi-step work.",
                    },
                  },
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
              name: "voiceRealtimeModel",
              type: "select",
              label: "Voice model",
              options: REALTIME_MODEL_OPTIONS,
              defaultValue: DEFAULT_VOICE_REALTIME_MODEL,
              required: true,
              admin: {
                description:
                  "Model used for OptiMate live voice calls. Mini is cheaper and faster; Realtime 2 is better for complex tool-heavy requests.",
              },
            },
            {
              name: "voiceUsageTracker",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/agent/RealtimeVoiceUsagePanel",
                },
              },
            },
            {
              name: "chatHistoryTokenLimit",
              type: "number",
              label: "Chat history token limit",
              defaultValue: 6000,
              min: 1000,
              max: 30000,
              admin: {
                description:
                  "Approximate token budget for previous chat turns sent to OptiMate. Older messages are compacted into a summary when the history grows beyond this limit, while recent turns are kept verbatim.",
              },
            },
            {
              name: "blogPrompterModel",
              type: "select",
              options: MODEL_OPTIONS,
              label: "Blog AI model",
              admin: {
                description:
                  "Optional. Model used by all blog AI features — the Blog Prompter AI Suggest button, blog draft generation, and blog post image-prompt generation. Leave blank to use the autonomous default. Plain OpenAI API-key models are hidden until OPENAI_API_KEY is configured.",
              },
            },
            {
              name: "invoiceAssistantModel",
              type: "select",
              options: MODEL_OPTIONS,
              label: "Invoice Assistant model",
              admin: {
                description:
                  "Optional. Model used by the Xero invoice assistant. Leave blank to use the autonomous default.",
              },
            },
            {
              name: "emailAssistantModel",
              type: "select",
              options: MODEL_OPTIONS,
              label: "Email Assistant model",
              admin: {
                description:
                  "Optional. Model used by GmailMate / OptiMate Gmail. Leave blank to use the autonomous default. Users can still switch models at the bottom of GmailMate.",
              },
            },
          ],
        },
        {
          label: "Starter Questions",
          fields: [
            starterQuestionField(
              "googleMateStarterQuestions",
              "Google Mate account questions",
              DEFAULT_GOOGLE_MATE_STARTER_QUESTIONS,
            ),
            starterQuestionField(
              "googleMatePortfolioStarterQuestions",
              "Google Mate portfolio questions",
              DEFAULT_GOOGLE_MATE_PORTFOLIO_STARTER_QUESTIONS,
            ),
            starterQuestionField(
              "invoiceMateStarterQuestions",
              "Ultimate InvoiceMate questions",
              DEFAULT_INVOICE_MATE_STARTER_QUESTIONS,
            ),
          ],
        },
        {
          label: "OptiMate Memory",
          fields: [
            {
              name: "memorySettings",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/agent/OptiMateMemorySettingsPanel",
                },
              },
            },
            {
              name: "memoryReview",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/agent/MemoryReviewPanel",
                },
              },
            },
          ],
        },
        {
          label: "Token & Tool Cost",
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
              name: "systemPromptTokenUsage",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/agent/SystemPromptTokenUsagePanel",
                },
              },
            },
          ],
        },
        {
          label: "OptiMate Soul",
          fields: [
            {
              name: "soulSettings",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/agent/OptiMateSoulSettingsPanel",
                },
              },
            },
          ],
        },
        {
          label: "OptiMate Auth",
          fields: [
            {
              name: "authLink",
              type: "ui",
              admin: {
                components: {
                  Field: {
                    path: "./components/agent/OptiMateSettingsLinksPanel",
                    clientProps: { kind: "auth" },
                  },
                },
              },
            },
          ],
        },
      ],
    },

  ],
};
