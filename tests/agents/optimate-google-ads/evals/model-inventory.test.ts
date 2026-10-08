import { describe, expect, it } from "vitest";
import { getActivePickerModels, getLegacyHiddenModels, getModelInventory } from "../../../../src/lib/agents/optimate-google-ads/evals/model-inventory";

  describe("model inventory", () => {
  it("classifies active picker and legacy hidden models", () => {
    const inventory = getModelInventory();
    const active = getActivePickerModels();
    const legacy = getLegacyHiddenModels();

    expect(active).toContain("claude-sonnet-5.5");
    expect(active).toContain("claude-haiku-5.5");
    expect(legacy).toContain("claude-sonnet-5");
    expect(legacy).toContain("claude-haiku-4.5");
    expect(active).toContain("gpt-6-sol");
    expect(active).toContain("grok-4.7");
    expect(active).toContain("grok-4.6");
    expect(legacy).toContain("gpt-5.5-codex");
    expect(legacy).toContain("grok-build");
    expect(legacy).toContain("gpt-4o");
    expect(legacy).toContain("gpt-4");
    expect(legacy).toContain("gpt-4o-mini");
    // Retired models are kept only as hidden back-compat aliases.
    expect(legacy).toContain("gpt-5.4");
    expect(legacy).toContain("gpt-5.4-mini");
    expect(legacy).toContain("gpt-5.6-sol");
    expect(legacy).toContain("gpt-5.6-terra");
    expect(legacy).toContain("gpt-5.6-luna");
    expect(legacy).toContain("grok-4.5");
    expect(inventory.find((entry) => entry.canonical === "gpt-4o")?.status).toBe("legacy_hidden");
    expect(inventory.find((entry) => entry.canonical === "claude-sonnet-5.5")?.status).toBe("active_picker");
  });
});
