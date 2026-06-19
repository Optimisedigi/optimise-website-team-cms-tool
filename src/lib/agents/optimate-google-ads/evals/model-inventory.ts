import {
  CHAT_PICKER_MODELS,
  MODEL_REGISTRY,
  PROVIDER_CONFIG,
  type CanonicalModelName,
  type ProviderName,
} from "../../_shared/llm/registry";

export type ModelInventoryStatus = "active_picker" | "legacy_hidden";

export interface ModelInventoryEntry {
  canonical: CanonicalModelName;
  displayLabel?: string;
  hint?: string;
  provider: ProviderName;
  providerModelId: string;
  status: ModelInventoryStatus;
  credentialPath: "oauth_subscription" | "api_key";
  requiredCredential: string;
  providerHandler: string;
}

const REQUIRED_CREDENTIAL_BY_PROVIDER: Record<ProviderName, string> = {
  anthropic: "Claude OAuth subscription, or ANTHROPIC_API_KEY when explicitly configured",
  moonshot: "MOONSHOT_API_KEY / Kimi API key",
  "kimi-coding": "Kimi For Coding OAuth subscription",
  minimax: "MINIMAX_API_KEY",
  "minimax-openai": "MINIMAX_API_KEY for the legacy OpenAI-compatible MiniMax endpoint",
  openai: "OPENAI_API_KEY",
  "openai-codex": "ChatGPT/Codex OAuth subscription",
  "xai-grok": "SuperGrok OAuth subscription",
};

export function getModelInventory(): ModelInventoryEntry[] {
  const picker = new Map(CHAT_PICKER_MODELS.map((model) => [model.canonical, model]));

  return (Object.keys(MODEL_REGISTRY) as CanonicalModelName[]).map((canonical) => {
    const registryEntry = MODEL_REGISTRY[canonical];
    const provider = registryEntry.provider;
    const providerConfig = PROVIDER_CONFIG[provider];
    const pickerEntry = picker.get(canonical);

    return {
      canonical,
      displayLabel: pickerEntry?.label,
      hint: pickerEntry?.hint,
      provider,
      providerModelId: registryEntry.model,
      status: pickerEntry ? "active_picker" : "legacy_hidden",
      credentialPath: providerConfig.supportsOAuth ? "oauth_subscription" : "api_key",
      requiredCredential: REQUIRED_CREDENTIAL_BY_PROVIDER[provider],
      providerHandler: providerConfig.handler,
    };
  });
}

export function getActivePickerModels(): CanonicalModelName[] {
  return CHAT_PICKER_MODELS.map((model) => model.canonical);
}

export function getLegacyHiddenModels(): CanonicalModelName[] {
  const active = new Set(getActivePickerModels());
  return (Object.keys(MODEL_REGISTRY) as CanonicalModelName[]).filter((model) => !active.has(model));
}

export function formatModelInventoryMarkdown(entries = getModelInventory()): string {
  const active = entries.filter((entry) => entry.status === "active_picker");
  const legacy = entries.filter((entry) => entry.status === "legacy_hidden");

  return [
    "# OptiMate Google Ads Model Inventory",
    "",
    "## Active picker models",
    formatInventoryTable(active),
    "",
    "## Legacy / hidden registry models",
    formatInventoryTable(legacy),
    "",
  ].join("\n");
}

function formatInventoryTable(entries: ModelInventoryEntry[]): string {
  if (entries.length === 0) return "No models.";

  return [
    "| Canonical | Label | Provider | Provider model ID | Credential path | Required credential |",
    "| --- | --- | --- | --- | --- | --- |",
    ...entries.map((entry) =>
      [
        entry.canonical,
        entry.displayLabel ?? "Hidden",
        entry.provider,
        entry.providerModelId,
        entry.credentialPath,
        entry.requiredCredential,
      ]
        .map(escapeMarkdownCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    ),
  ].join("\n");
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}
