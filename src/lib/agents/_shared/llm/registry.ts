/**
 * Model registry. Maps canonical model names (what agents declare in their
 * config) to the (provider, providerModelId) tuple used by the adapters.
 *
 * Adding a new model is one new line here. Adding a new provider is a new
 * key in PROVIDER_CONFIG plus a new adapter under providers/.
 */

/**
 * Canonical model registry. Maps display-friendly model names (used by
 * agents and the chat picker) to the (provider, providerModelId) tuple.
 *
 * Adding a new model is one line here. Adding a new provider needs a new
 * entry in PROVIDER_CONFIG plus a new adapter under providers/.
 *
 * Last reviewed: 2026-05-07 (Kimi K2 series deprecates 2026-05-25).
 */
/**
 * Reasoning-effort levels for the GPT-5.5-class models served over the Codex
 * Responses backend. The Codex API takes this as a per-request
 * `reasoning.effort` value.
 */
export type CodexEffort = "low" | "medium" | "high" | "xhigh";

export const MODEL_REGISTRY = {
  // Anthropic (native API). All connect via OAuth (Claude Code client
  // impersonation) when ANTHROPIC OAuth is connected; otherwise via
  // ANTHROPIC_API_KEY when explicitly selected by the user.
  "claude-sonnet-4.6": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "claude-sonnet-4.5": { provider: "anthropic", model: "claude-sonnet-4-5" },
  "claude-opus-4-8": { provider: "anthropic", model: "claude-opus-4-8" },
  "claude-opus-4.7": { provider: "anthropic", model: "claude-opus-4-7" },
  "claude-haiku-4.5": { provider: "anthropic", model: "claude-haiku-4-5" },

  // Moonshot / Kimi (OpenAI-compatible). K2 series sunsets 2026-05-25;
  // K2.6 is the current flagship.
  "kimi-k2.6": { provider: "moonshot", model: "kimi-k2.6" },

  // MiniMax. M3 uses MiniMax's Anthropic-compatible API; M2.7 remains on
  // the legacy OpenAI-compatible endpoint for stored-setting compatibility.
  "minimax-m3": { provider: "minimax", model: "MiniMax-M3" },
  "minimax-m2.7": { provider: "minimax-openai", model: "MiniMax-M2.7" },

  // OpenAI / GPT (OpenAI-compatible). API-key path billed to OPENAI_API_KEY.
  "gpt-5.5": { provider: "openai", model: "gpt-5.5" },
  "gpt-4.1": { provider: "openai", model: "gpt-4.1" },
  "gpt-4o": { provider: "openai", model: "gpt-4o" },

  // GPT-5.5 over the Codex Responses backend, served by a ChatGPT
  // subscription via Codex OAuth ("Sign in with ChatGPT"). Reasoning effort is
  // selected per request, not baked into the model name.
  "gpt-5.5-codex": { provider: "openai-codex", model: "gpt-5.5" },

  // xAI Grok over the grok-cli proxy (cli-chat-proxy.grok.com), served by a
  // SuperGrok subscription via device-code OAuth — NOT the billed XAI_API_KEY
  // path. These are the only models the subscription proxy exposes; the raw
  // grok-4.x API models require an API key and are deliberately omitted.
  "grok-build": { provider: "xai-grok", model: "grok-build" },
  "grok-composer-2.5-fast": { provider: "xai-grok", model: "grok-composer-2.5-fast" },
} as const;

export type CanonicalModelName = keyof typeof MODEL_REGISTRY;
export type ProviderName =
  | "anthropic"
  | "moonshot"
  | "minimax"
  | "minimax-openai"
  | "openai"
  | "openai-codex"
  | "xai-grok";

export interface AnthropicProviderConfig {
  handler: "callAnthropic";
  supportsOAuth: true;
}

export interface AnthropicCompatibleProviderConfig {
  handler: "callAnthropicCompatible";
  baseUrl: string;
  supportsOAuth: false;
}

export interface OpenAICompatibleProviderConfig {
  handler: "callOpenAICompatible";
  baseUrl: string;
  supportsOAuth: false;
}

export interface OpenAICodexProviderConfig {
  handler: "callOpenAICodex";
  /** Base for the Codex Responses endpoint, e.g. https://chatgpt.com/backend-api. */
  baseUrl: string;
  supportsOAuth: true;
}

export interface XaiGrokProviderConfig {
  handler: "callXaiGrok";
  /** Base for the grok-cli proxy Responses endpoint, e.g. https://cli-chat-proxy.grok.com/v1. */
  baseUrl: string;
  /** Sent as `x-grok-client-version`; the proxy 426s outdated/missing versions. */
  clientVersion: string;
  supportsOAuth: true;
}

export type ProviderConfig =
  | AnthropicProviderConfig
  | AnthropicCompatibleProviderConfig
  | OpenAICompatibleProviderConfig
  | OpenAICodexProviderConfig
  | XaiGrokProviderConfig;

export const PROVIDER_CONFIG: Record<ProviderName, ProviderConfig> = {
  anthropic: {
    handler: "callAnthropic",
    supportsOAuth: true,
  },
  moonshot: {
    handler: "callOpenAICompatible",
    baseUrl: "https://api.moonshot.ai/v1",
    supportsOAuth: false,
  },
  minimax: {
    handler: "callAnthropicCompatible",
    // MiniMax M3 uses MiniMax's Anthropic-compatible international endpoint,
    // matching the local ggcoder adapter.
    baseUrl: "https://api.minimax.io/anthropic",
    supportsOAuth: false,
  },
  "minimax-openai": {
    handler: "callOpenAICompatible",
    // Legacy MiniMax OpenAI-compatible endpoint kept for minimax-m2.7.
    baseUrl: "https://api.minimaxi.chat/v1",
    supportsOAuth: false,
  },
  openai: {
    handler: "callOpenAICompatible",
    baseUrl: "https://api.openai.com/v1",
    supportsOAuth: false,
  },
  "openai-codex": {
    handler: "callOpenAICodex",
    // The Codex Responses endpoint is <baseUrl>/codex/responses.
    baseUrl: "https://chatgpt.com/backend-api",
    supportsOAuth: true,
  },
  "xai-grok": {
    handler: "callXaiGrok",
    // The grok-cli proxy Responses endpoint is <baseUrl>/responses.
    baseUrl: "https://cli-chat-proxy.grok.com/v1",
    // Mirrors the installed grok CLI; the proxy rejects missing/old versions
    // with HTTP 426. Bump if the proxy raises its minimum.
    clientVersion: "0.2.51",
    supportsOAuth: true,
  },
};

export function isCanonicalModel(name: string): name is CanonicalModelName {
  return name in MODEL_REGISTRY;
}

/**
 * Default model when a chat session starts (sticky until the user picks
 * something else). Sonnet 4.6 is Anthropic's current best Sonnet and
 * connects via OAuth (Claude Code client impersonation), drawing from the
 * agency's $150/mo Max plan rather than billed API.
 */
export const DEFAULT_CHAT_MODEL: CanonicalModelName = "claude-sonnet-4.6";

/**
 * Default fallback chain for autonomous (non-chat) agent runs. Kept separate
 * from the chat default because autonomous runs should be cost-conscious by
 * default, while chat runs prioritise voice quality.
 */
export const DEFAULT_AUTONOMOUS_MODEL: CanonicalModelName = "kimi-k2.6";
export const DEFAULT_AUTONOMOUS_FALLBACKS: CanonicalModelName[] = [
  "minimax-m3",
  "claude-sonnet-4.6",
];

/**
 * Curated list of models surfaced in the chat-mode picker. The full registry
 * has more entries (e.g. claude-sonnet-4.5 stays available for explicit
 * selection if needed) but this is what shows up in the dropdown. Order
 * matches the dropdown order, with the default first.
 */
export const CHAT_PICKER_MODELS: ReadonlyArray<{
  canonical: CanonicalModelName;
  label: string;
  hint?: string;
}> = [
  { canonical: "claude-sonnet-4.6", label: "Claude Sonnet 4.6 (OAuth)", hint: "Default. Best brand voice, free via Claude Max." },
  { canonical: "claude-opus-4-8", label: "Claude Opus 4.8 (OAuth)", hint: "Latest Opus. Heaviest reasoning for complex investigations." },
  { canonical: "claude-haiku-4.5", label: "Claude Haiku 4.5 (OAuth)", hint: "Fast and cheap. Good for simple chat replies." },
  { canonical: "kimi-k2.6", label: "Kimi K2.6", hint: "Long context, analytical. Default for autonomous runs." },
  { canonical: "minimax-m3", label: "MiniMax M3", hint: "Latest MiniMax fallback for agentic workflows." },
  { canonical: "gpt-5.5-codex", label: "GPT-5.5 Codex (ChatGPT OAuth)", hint: "GPT-5.5 over Codex. Reasoning is controlled per request." },
  { canonical: "grok-build", label: "Grok Build (SuperGrok OAuth)", hint: "xAI Grok coding model via your SuperGrok subscription. No API tokens billed." },
  { canonical: "grok-composer-2.5-fast", label: "Grok Composer 2.5 Fast (SuperGrok OAuth)", hint: "Faster Grok model via SuperGrok subscription." },
  { canonical: "claude-opus-4.7", label: "Claude Opus 4.7 (OAuth)", hint: "Previous Opus generation, kept for compatibility." },
  { canonical: "minimax-m2.7", label: "MiniMax M2.7", hint: "Previous MiniMax generation, kept for compatibility." },
  { canonical: "claude-sonnet-4.5", label: "Claude Sonnet 4.5 (OAuth)", hint: "Previous Sonnet generation, kept for compatibility." },
];
