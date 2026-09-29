import { describe, expect, it } from "vitest";

import {
  CHAT_PICKER_MODELS,
  DEFAULT_AUTONOMOUS_FALLBACKS,
  MODEL_REGISTRY,
} from "@/lib/agents/_shared/llm/registry";

describe("OptiMate OAuth model registry", () => {
  it.each([
    ["gpt-6-sol", "openai", "gpt-6-sol"],
    ["claude-sonnet-5", "anthropic", "claude-sonnet-5"],
    ["claude-opus-5.5", "anthropic", "claude-opus-5-5"],
    ["grok-4.6", "xai-grok", "grok-4.6"],
    ["grok-4.7", "xai-api", "grok-4.7"],
  ] as const)(
    "surfaces %s in the OAuth picker with its provider model ID",
    (canonical, provider, model) => {
      expect(CHAT_PICKER_MODELS).toContainEqual(expect.objectContaining({ canonical }));
      expect(MODEL_REGISTRY[canonical]).toEqual({ provider, model });
    },
  );

  it.each(["claude-opus-4-8", "gpt-5.5-codex", "grok-build", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "grok-4.5"])("does not surface retired model %s in the picker", (canonical) => {
    expect(CHAT_PICKER_MODELS).not.toContainEqual(expect.objectContaining({ canonical }));
  });

  it("runs retired Sonnet names on the most recent Sonnet", () => {
    expect(MODEL_REGISTRY["claude-sonnet-4.6"]).toEqual({ provider: "anthropic", model: "claude-sonnet-5" });
    expect(MODEL_REGISTRY["claude-sonnet-4.5"]).toEqual({ provider: "anthropic", model: "claude-sonnet-5" });
  });

  it("uses active subscription models before billed API fallbacks", () => {
    expect(DEFAULT_AUTONOMOUS_FALLBACKS.slice(0, 2)).toEqual([
      "kimi-k3",
      "claude-sonnet-5",
    ]);
    expect(DEFAULT_AUTONOMOUS_FALLBACKS).not.toContain("gpt-5.6-terra");
  });
});
