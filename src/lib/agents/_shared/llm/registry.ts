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
 * Last reviewed: 2026-09-30 (Kimi K2 series deprecates 2026-05-25).
 */
/**
 * Reasoning-effort levels for the GPT-5.5-class models served over the Codex
 * Responses backend. The Codex API takes this as a per-request
 * `reasoning.effort` value.
 */
export type CodexEffort = "none" | "low" | "medium" | "high" | "xhigh";

export const MODEL_REGISTRY = {
  // Anthropic (native API). All connect via OAuth (Claude Code client
  // impersonation) when ANTHROPIC OAuth is connected; otherwise via
  // ANTHROPIC_API_KEY when explicitly selected by the user.
  "claude-sonnet-5": { provider: "anthropic", model: "claude-sonnet-5" },
  // Sonnet 4.6 / 4.5 stay as names for old stored selections but now run the
  // most recent Sonnet.
  "claude-sonnet-4.6": { provider: "anthropic", model: "claude-sonnet-5" },
  "claude-sonnet-4.5": { provider: "anthropic", model: "claude-sonnet-5" },
  "claude-opus-5.5": { provider: "anthropic", model: "claude-opus-5-5" },
  "claude-opus-5": { provider: "anthropic", model: "claude-opus-5" },
  "claude-opus-4-8": { provider: "anthropic", model: "claude-opus-4-8" },
  "claude-opus-4.7": { provider: "anthropic", model: "claude-opus-4-7" },
  "claude-haiku-4.5": { provider: "anthropic", model: "claude-haiku-4-5" },

  // Moonshot / Kimi (OpenAI-compatible, billed API-key path). Retired from the
  // chat/settings picker but kept here so stored selections and the autonomous
  // failover chain still resolve.
  "kimi-k2.6": { provider: "moonshot", model: "kimi-k2.6" },

  // Kimi via the official kimi-cli device-code OAuth flow. Uses the user's Kimi
  // coding subscription (`scope: kimi-code`), not billed API keys. K3 is Kimi's
  // flagship (wire id `k3`, up to 1M context); kimi-for-coding is K2.7 Code.
  "kimi-k3": { provider: "kimi-coding", model: "k3" },
  "kimi-for-coding": { provider: "kimi-coding", model: "kimi-for-coding" },

  // MiniMax. M3 uses MiniMax's Anthropic-compatible API; M2.7 remains on
  // the legacy OpenAI-compatible endpoint only for stored-setting compatibility.
  "minimax-m3": { provider: "minimax", model: "MiniMax-M3" },
  "minimax-m2.7": { provider: "minimax-openai", model: "MiniMax-M2.7" },

  // Xiaomi MiMo Open Platform (billed API key, not a subscription OAuth path).
  "mimo-v2.6-pro": { provider: "mimo", model: "mimo-v2.6-pro" },
  "mimo-v2.6-flash": { provider: "mimo", model: "mimo-v2.6-flash" },

  // OpenAI / GPT (OpenAI-compatible). API-key path billed to OPENAI_API_KEY.
  "gpt-6-astra": { provider: "openai", model: "gpt-6-astra" },
  "gpt-6-sol": { provider: "openai", model: "gpt-6-sol" },
  "gpt-6-luna": { provider: "openai", model: "gpt-6-luna" },
  "gpt-5.5": { provider: "openai", model: "gpt-5.5" },
  "gpt-4o": { provider: "openai", model: "gpt-4o" },

  // GPT over the Codex Responses backend, served by a ChatGPT subscription via
  // Codex OAuth ("Sign in with ChatGPT"). Reasoning effort is selected per
  // request, not baked into the model name.
  //
  // GPT-5.6 family (Sol / Terra / Luna) — retired from the picker now that the
  // GPT-6 family is on the billed OpenAI API. Kept so stored selections and old
  // per-request model names still resolve on the Codex OAuth backend.
  "gpt-5.6-sol": { provider: "openai-codex", model: "gpt-5.6-sol" },
  "gpt-5.6-terra": { provider: "openai-codex", model: "gpt-5.6-terra" },
  "gpt-5.6-luna": { provider: "openai-codex", model: "gpt-5.6-luna" },
  "gpt-5.5-codex": { provider: "openai-codex", model: "gpt-5.5" },
  // Back-compat aliases for stored prod selections pointing at models OpenAI has
  // since retired (GPT-5.4, 5.4 Mini) or the short-lived GPT-4 picker entries.
  // The Codex OAuth backend rejects those model IDs, so route them to the
  // closest surviving GPT-5.6 tier instead of failing as "Unknown model".
  "gpt-5.4": { provider: "openai-codex", model: "gpt-5.6-terra" },
  "gpt-5.4-mini": { provider: "openai-codex", model: "gpt-5.6-luna" },
  "gpt-4.1": { provider: "openai-codex", model: "gpt-5.6-terra" },
  "gpt-4": { provider: "openai-codex", model: "gpt-5.6-terra" },
  "gpt-4o-mini": { provider: "openai-codex", model: "gpt-5.6-luna" },

  // xAI Grok over the grok-cli proxy (cli-chat-proxy.grok.com), served by a
  // SuperGrok subscription via device-code OAuth — NOT the billed XAI_API_KEY
  // path. grok-4.6 is the current chat model; grok-4.5 is retired from the
  // picker but kept so stored selections still resolve; grok-build and
  // grok-composer-2.5-fast stay as stored-setting aliases.
  "grok-4.7": { provider: "xai-api", model: "grok-4.7" },
  "grok-4.6": { provider: "xai-grok", model: "grok-4.6" },
  "grok-4.5": { provider: "xai-grok", model: "grok-4.5" },
  "grok-build": { provider: "xai-grok", model: "grok-build" },
  "grok-composer-2.5-fast": { provider: "xai-grok", model: "grok-composer-2.5-fast" },
} as const;

export type CanonicalModelName = keyof typeof MODEL_REGISTRY;
export type ProviderName =
  | "anthropic"
  | "moonshot"
  | "kimi-coding"
  | "minimax"
  | "minimax-openai"
  | "mimo"
  | "openai"
  | "openai-codex"
  | "xai-api"
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

export interface KimiCodingProviderConfig {
  handler: "callKimiCoding";
  baseUrl: string;
  supportsOAuth: true;
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
  | KimiCodingProviderConfig
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
  "kimi-coding": {
    handler: "callKimiCoding",
    baseUrl: "https://api.kimi.com/coding/v1",
    supportsOAuth: true,
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
  mimo: {
    handler: "callOpenAICompatible",
    baseUrl: "https://api.xiaomimimo.com/v1",
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
  "xai-api": {
    handler: "callOpenAICompatible",
    baseUrl: "https://api.x.ai/v1",
    supportsOAuth: false,
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
 * something else). Sonnet 5 is Anthropic's current best Sonnet — the retired
 * Sonnet 4.6 / 4.5 names run Sonnet 5 too — and connects via OAuth (Claude
 * Code client impersonation), drawing from the agency's $150/mo Max plan
 * rather than billed API.
 */
export const DEFAULT_CHAT_MODEL: CanonicalModelName = "claude-sonnet-5";

/**
 * Default fallback chain for autonomous (non-chat) agent runs. Kept separate
 * from the chat default because autonomous runs should be cost-conscious by
 * default, while chat runs prioritise voice quality.
 */
export const DEFAULT_AUTONOMOUS_MODEL: CanonicalModelName = "kimi-k3";
export const DEFAULT_AUTONOMOUS_FALLBACKS: CanonicalModelName[] = [
  "kimi-k3",
  "claude-sonnet-5",
  "minimax-m3",
];

/**
 * Curated list of current models surfaced in the chat-mode picker. The full
 * registry keeps some older models for stored-setting compatibility, but they
 * are deliberately hidden from dropdowns. Order matches the dropdown order,
 * with the default first.
 */
export const CHAT_PICKER_MODELS: ReadonlyArray<{
  canonical: CanonicalModelName;
  label: string;
  hint?: string;
  /**
   * Model whose flagship behaviour only exists with reasoning enabled. Kimi's
   * router serves `k3` only when Thinking is on; a no-thinking request silently
   * routes to K2.6 instead. The chat UI forces reasoning on for these models so
   * selecting K3 actually gets K3.
   */
  requiresReasoning?: boolean;
}> = [
  { canonical: "claude-sonnet-5", label: "Claude Sonnet 5 (OAuth)", hint: "Default. Best brand voice, free via Claude Max." },
  { canonical: "claude-opus-5.5", label: "Claude Opus 5.5 (OAuth)", hint: "Latest Opus. Adaptive thinking is always on." },
  { canonical: "claude-haiku-4.5", label: "Claude Haiku 4.5 (OAuth)", hint: "Fastest Claude. Latest Haiku." },
  { canonical: "kimi-k3", label: "Kimi K3 (Kimi OAuth)", hint: "Kimi's flagship. Long-horizon coding, up to 1M context. Default for autonomous runs. Reasoning is always on for K3. No API tokens billed.", requiresReasoning: true },
  { canonical: "kimi-for-coding", label: "Kimi For Coding (Kimi OAuth)", hint: "Kimi K2.7 Code via device-code OAuth. No API tokens billed." },
  { canonical: "minimax-m3", label: "MiniMax M3", hint: "Latest MiniMax fallback for agentic workflows." },
  { canonical: "mimo-v2.6-pro", label: "MiMo V2.6 Pro (API key)", hint: "Xiaomi flagship. Billed to MIMO_API_KEY; requires an API key." },
  { canonical: "mimo-v2.6-flash", label: "MiMo V2.6 Flash (API key)", hint: "Faster Xiaomi model. Billed to MIMO_API_KEY; requires an API key." },
  { canonical: "gpt-6-astra", label: "GPT-6 Astra (API key)", hint: "Latest flagship. Billed to OPENAI_API_KEY; not ChatGPT OAuth." },
  { canonical: "gpt-6-sol", label: "GPT-6 Sol (API key)", hint: "Balanced GPT-6. Billed to OPENAI_API_KEY; not ChatGPT OAuth." },
  { canonical: "gpt-6-luna", label: "GPT-6 Luna (API key)", hint: "Fast GPT-6. Billed to OPENAI_API_KEY; not ChatGPT OAuth." },
  { canonical: "grok-4.7", label: "Grok 4.7 (API key)", hint: "Latest Grok. Billed to XAI_API_KEY; not SuperGrok OAuth." },
  { canonical: "grok-4.6", label: "Grok 4.6 (SuperGrok OAuth)", hint: "xAI Grok 4.6 via your SuperGrok subscription. No API tokens billed." },
];

/**
 * True when the model only behaves as its flagship self with reasoning enabled
 * (see CHAT_PICKER_MODELS.requiresReasoning). The chat UI uses this to force the
 * reasoning toggle on when such a model is selected.
 */
export function modelRequiresReasoning(name: string): boolean {
  return CHAT_PICKER_MODELS.some((m) => m.canonical === name && m.requiresReasoning === true);
}
