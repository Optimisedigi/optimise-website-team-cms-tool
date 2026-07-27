import { describe, expect, it } from "vitest";

import {
  CHAT_PICKER_MODELS,
  MODEL_REGISTRY,
} from "@/lib/agents/_shared/llm/registry";

describe("OptiMate OAuth model registry", () => {
  it.each([
    ["gpt-5.6-luna", "openai-codex", "gpt-5.6-luna"],
    ["gpt-5.6-terra", "openai-codex", "gpt-5.6-terra"],
    ["claude-opus-5", "anthropic", "claude-opus-5"],
  ] as const)(
    "surfaces %s in the OAuth picker with its provider model ID",
    (canonical, provider, model) => {
      expect(CHAT_PICKER_MODELS).toContainEqual(expect.objectContaining({ canonical }));
      expect(MODEL_REGISTRY[canonical]).toEqual({ provider, model });
    },
  );

  it.each(["claude-opus-4-8", "gpt-5.5-codex"])("does not surface retired model %s in the picker", (canonical) => {
    expect(CHAT_PICKER_MODELS).not.toContainEqual(expect.objectContaining({ canonical }));
  });
});
