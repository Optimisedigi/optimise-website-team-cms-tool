import { describe, expect, it, vi } from "vitest";

// The settings reader imports the Payload config, which imports this global.
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { OptiMateSettings } from "@/globals/OptiMateSettings";

type Hook = (args: { data?: Record<string, unknown>; originalDoc?: Record<string, unknown> }) => Record<string, unknown> | undefined;

function runBeforeValidate(data: Record<string, unknown>, originalDoc?: Record<string, unknown>) {
  const hook = OptiMateSettings.hooks?.beforeValidate?.[0] as unknown as Hook;
  return hook({ data: { ...data }, originalDoc });
}

describe("OptiMate Settings voice API-key toggle", () => {
  it("is off by default and drives the legacy voiceAuthMethod column", () => {
    expect(runBeforeValidate({})).toMatchObject({ voiceApiKeyEnabled: false, voiceAuthMethod: "codex-oauth" });
    expect(runBeforeValidate({ voiceApiKeyEnabled: true })).toMatchObject({
      voiceApiKeyEnabled: true,
      voiceAuthMethod: "api-key",
    });
    // The old select alone can no longer turn API-key voice on.
    expect(runBeforeValidate({ voiceAuthMethod: "api-key" })).toMatchObject({
      voiceApiKeyEnabled: false,
      voiceAuthMethod: "codex-oauth",
    });
  });

  it("keeps the saved toggle on a save that leaves it out", () => {
    expect(runBeforeValidate({ chatHistoryTokenLimit: 8000 }, { voiceApiKeyEnabled: true })).toMatchObject({
      voiceApiKeyEnabled: true,
    });
    expect(runBeforeValidate({ voiceApiKeyEnabled: false }, { voiceApiKeyEnabled: true })).toMatchObject({
      voiceApiKeyEnabled: false,
    });
  });
});
