import { describe, expect, it } from "vitest";

import {
  CHAT_PICKER_MODELS,
  DEFAULT_AUTONOMOUS_FALLBACKS,
  MODEL_REGISTRY,
} from "@/lib/agents/_shared/llm/registry";

describe("OptiMate OAuth model registry", () => {
  it.each([
    ["gpt-5.6-luna", "openai-codex", "gpt-5.6-luna"],
    ["gpt-5.6-terra", "openai-codex", "gpt-5.6-terra"],
    ["claude-sonnet-5", "anthropic", "claude-sonnet-5"],
    ["claude-opus-5", "anthropic", "claude-opus-5"],
    ["grok-4.6", "xai-grok", "grok-4.6"],
    ["grok-4.5", "xai-grok", "grok-4.5"],
  ] as const)(
    "surfaces %s in the OAuth picker with its provider model ID",
    (canonical, provider, model) => {
      expect(CHAT_PICKER_MODELS).toContainEqual(expect.objectContaining({ canonical }));
      expect(MODEL_REGISTRY[canonical]).toEqual({ provider, model });
    },
  );

  it.each(["claude-opus-4-8", "gpt-5.5-codex", "grok-build"])("does not surface retired model %s in the picker", (canonical) => {
    expect(CHAT_PICKER_MODELS).not.toContainEqual(expect.objectContaining({ canonical }));
  });

  it("uses active subscription models before billed API fallbacks", () => {
    expect(DEFAULT_AUTONOMOUS_FALLBACKS.slice(0, 2)).toEqual([
      "gpt-5.6-terra",
      "kimi-k3",
    ]);
  });
});
