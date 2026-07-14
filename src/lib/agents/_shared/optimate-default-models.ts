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
import {
  DEFAULT_GOOGLE_MATE_PORTFOLIO_STARTER_QUESTIONS,
  DEFAULT_GOOGLE_MATE_STARTER_QUESTIONS,
  DEFAULT_INVOICE_MATE_STARTER_QUESTIONS,
  resolveStarterQuestions,
} from "./optimate-starter-questions";

export type OptiMateRealtimeModel = "gpt-realtime-mini" | "gpt-realtime-2";

export interface OptiMateDefaultModels {
  defaultChatModel: CanonicalModelName;
  defaultAutonomousModel: CanonicalModelName;
  /** Model used when minting OptiMate Realtime voice sessions. */
  voiceRealtimeModel: OptiMateRealtimeModel;
  /** Optional task-specific model for Blog Prompter AI Suggest. */
  blogPrompterModel?: CanonicalModelName;
  /** Optional task-specific model for the Xero invoice assistant. */
  invoiceAssistantModel?: CanonicalModelName;
  /** Optional task-specific model for GmailMate / OptiMate Gmail. */
  emailAssistantModel?: CanonicalModelName;
  /** Optional task-specific model for Match Type Violations research. */
  searchTermResearchModel?: CanonicalModelName;
  /** Optional task-specific model for Weekly Negative Sweep classification. */
  negativeSweepModel?: CanonicalModelName;
  /** OpenAI model used for OptiMate Realtime input transcription. */
  voiceTranscriptionModel: string;
  /** Gemini Imagen model used for blog hero image generation. */
  blogImageGenerationModel: string;
  /** Approximate token budget for chat history before compacting older turns. */
  chatHistoryTokenLimit: number;
  /** Starter prompt chips for single-account Google Mate chats. */
  googleMateStarterQuestions: string[];
  /** Starter prompt chips for portfolio Google Mate chats. */
  googleMatePortfolioStarterQuestions: string[];
  /** Starter prompt chips for Ultimate InvoiceMate chats. */
  invoiceMateStarterQuestions: string[];
}

/** True if the model is canonical AND still offered in the chat picker. */
function normaliseModelName(value: unknown): unknown {
  if (value === "gpt-5.5-codex-medium" || value === "gpt-5.5-codex-low") return "gpt-5.5-codex";
  // Stored selections of GPT-5.4 / 5.4 Mini (retired by OpenAI, removed from the
  // picker) map to the closest surviving GPT-5.6 tier so a saved GPT preference
  // keeps resolving to a GPT model instead of silently falling back to Claude.
  if (value === "gpt-5.4") return "gpt-5.6-terra";
  if (value === "gpt-5.4-mini") return "gpt-5.6-luna";
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

export const DEFAULT_VOICE_REALTIME_MODEL: OptiMateRealtimeModel = "gpt-realtime-mini";
export const DEFAULT_VOICE_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
export const DEFAULT_BLOG_IMAGE_GENERATION_MODEL = "imagen-4.0-fast-generate-001";

const DEFAULT_CHAT_HISTORY_TOKEN_LIMIT = 6000;
const MIN_CHAT_HISTORY_TOKEN_LIMIT = 1000;
const MAX_CHAT_HISTORY_TOKEN_LIMIT = 30000;

function resolveNativeModel(value: unknown, fallback: string): string {
  const model = typeof value === "string" ? value.trim() : "";
  return model || fallback;
}

function resolveChatHistoryTokenLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CHAT_HISTORY_TOKEN_LIMIT;
  return Math.min(
    MAX_CHAT_HISTORY_TOKEN_LIMIT,
    Math.max(MIN_CHAT_HISTORY_TOKEN_LIMIT, Math.round(parsed)),
  );
}

export function resolveVoiceRealtimeModel(value: unknown): OptiMateRealtimeModel {
  return value === "gpt-realtime-2" || value === "gpt-realtime-mini"
    ? value
    : DEFAULT_VOICE_REALTIME_MODEL;
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
      emailAssistantModel?: unknown;
      searchTermResearchModel?: unknown;
      negativeSweepModel?: unknown;
      voiceTranscriptionModel?: unknown;
      blogImageGenerationModel?: unknown;
      voiceRealtimeModel?: unknown;
      chatHistoryTokenLimit?: unknown;
      googleMateStarterQuestions?: unknown;
      googleMatePortfolioStarterQuestions?: unknown;
      invoiceMateStarterQuestions?: unknown;
    } | null;

    const blogPrompterModel = resolvePickerModel(global?.blogPrompterModel);
    const invoiceAssistantModel = resolvePickerModel(global?.invoiceAssistantModel);
    const emailAssistantModel = resolvePickerModel(global?.emailAssistantModel);
    const searchTermResearchModel = resolvePickerModel(global?.searchTermResearchModel);
    const negativeSweepModel = resolvePickerModel(global?.negativeSweepModel);

    return {
      defaultChatModel: resolvePickerModel(global?.defaultChatModel) ?? DEFAULT_CHAT_MODEL,
      defaultAutonomousModel: resolvePickerModel(global?.defaultAutonomousModel) ?? DEFAULT_AUTONOMOUS_MODEL,
      voiceRealtimeModel: resolveVoiceRealtimeModel(global?.voiceRealtimeModel),
      voiceTranscriptionModel: resolveNativeModel(
        global?.voiceTranscriptionModel,
        DEFAULT_VOICE_TRANSCRIPTION_MODEL,
      ),
      blogImageGenerationModel: resolveNativeModel(
        global?.blogImageGenerationModel,
        DEFAULT_BLOG_IMAGE_GENERATION_MODEL,
      ),
      chatHistoryTokenLimit: resolveChatHistoryTokenLimit(global?.chatHistoryTokenLimit),
      googleMateStarterQuestions: resolveStarterQuestions(
        global?.googleMateStarterQuestions,
        DEFAULT_GOOGLE_MATE_STARTER_QUESTIONS,
      ),
      googleMatePortfolioStarterQuestions: resolveStarterQuestions(
        global?.googleMatePortfolioStarterQuestions,
        DEFAULT_GOOGLE_MATE_PORTFOLIO_STARTER_QUESTIONS,
      ),
      invoiceMateStarterQuestions: resolveStarterQuestions(
        global?.invoiceMateStarterQuestions,
        DEFAULT_INVOICE_MATE_STARTER_QUESTIONS,
      ),
      ...(blogPrompterModel ? { blogPrompterModel } : {}),
      ...(invoiceAssistantModel ? { invoiceAssistantModel } : {}),
      ...(emailAssistantModel ? { emailAssistantModel } : {}),
      ...(searchTermResearchModel ? { searchTermResearchModel } : {}),
      ...(negativeSweepModel ? { negativeSweepModel } : {}),
    };
  } catch (err) {
    console.warn(
      "[optimate-default-models] Could not read optimate-settings global; using registry defaults.",
      err,
    );
    return {
      defaultChatModel: DEFAULT_CHAT_MODEL,
      defaultAutonomousModel: DEFAULT_AUTONOMOUS_MODEL,
      voiceRealtimeModel: DEFAULT_VOICE_REALTIME_MODEL,
      voiceTranscriptionModel: DEFAULT_VOICE_TRANSCRIPTION_MODEL,
      blogImageGenerationModel: DEFAULT_BLOG_IMAGE_GENERATION_MODEL,
      chatHistoryTokenLimit: DEFAULT_CHAT_HISTORY_TOKEN_LIMIT,
      googleMateStarterQuestions: [...DEFAULT_GOOGLE_MATE_STARTER_QUESTIONS],
      googleMatePortfolioStarterQuestions: [...DEFAULT_GOOGLE_MATE_PORTFOLIO_STARTER_QUESTIONS],
      invoiceMateStarterQuestions: [...DEFAULT_INVOICE_MATE_STARTER_QUESTIONS],
    };
  }
}
