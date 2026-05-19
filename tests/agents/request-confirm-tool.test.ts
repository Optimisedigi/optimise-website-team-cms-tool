/**
 * request_confirm tool.
 *
 * The confirm-gate is a pure passthrough: no DB writes, no external calls.
 * The tests cover the validator (rejects missing/invalid fields, accepts both
 * proposalTypes) and the happy-path response shape (confirmId + echo of
 * proposalType/wording/draftSettings).
 */

import { describe, it, expect, vi } from "vitest";
import { requestConfirmTool } from "@/lib/agents/optimate-google-ads/tools/request-confirm";
import type { ToolContext } from "@/lib/agents/_shared/tool";

const baseCtx = (): ToolContext => ({
  agentName: "optimate-google-ads",
  agentRunId: "run_test_confirm",
  context: {},
  log: vi.fn(),
});

describe("request_confirm \u2014 validator", () => {
  it("accepts a valid campaign-restructure call", () => {
    const validate = requestConfirmTool.validate!;
    const out = validate({
      proposalType: "campaign-restructure",
      wording: "Want me to restructure the campaigns for approval?",
      summary: "Split brand and generic across 4 campaigns based on last 30 days of search terms.",
      draftSettings: { proposalEnabledCampaigns: ["brand", "services-geo"] },
    });
    expect(out.proposalType).toBe("campaign-restructure");
    expect(out.wording).toBe("Want me to restructure the campaigns for approval?");
    expect(out.draftSettings).toEqual({ proposalEnabledCampaigns: ["brand", "services-geo"] });
  });

  it("accepts a valid campaign-build call", () => {
    const validate = requestConfirmTool.validate!;
    const out = validate({
      proposalType: "campaign-build",
      wording: "Want me to build the campaigns for approval?",
      summary: "Build the approved structure into Google Ads PAUSED.",
      draftSettings: {},
    });
    expect(out.proposalType).toBe("campaign-build");
  });

  it("rejects an unknown proposalType", () => {
    const validate = requestConfirmTool.validate!;
    expect(() =>
      validate({
        proposalType: "negative-keywords",
        wording: "Want me to add some negatives?",
        summary: "Adding 12 wasteful terms.",
        draftSettings: {},
      }),
    ).toThrow(/proposalType must be one of/);
  });

  it("rejects missing wording", () => {
    const validate = requestConfirmTool.validate!;
    expect(() =>
      validate({
        proposalType: "campaign-build",
        summary: "Build the approved structure into Google Ads PAUSED.",
        draftSettings: {},
      }),
    ).toThrow(/wording/);
  });

  it("rejects too-short wording", () => {
    const validate = requestConfirmTool.validate!;
    expect(() =>
      validate({
        proposalType: "campaign-build",
        wording: "Build?",
        summary: "Build the approved structure into Google Ads PAUSED.",
        draftSettings: {},
      }),
    ).toThrow(/wording must be at least 10/);
  });

  it("rejects missing summary", () => {
    const validate = requestConfirmTool.validate!;
    expect(() =>
      validate({
        proposalType: "campaign-build",
        wording: "Want me to build the campaigns for approval?",
        draftSettings: {},
      }),
    ).toThrow(/summary/);
  });

  it("rejects non-object draftSettings", () => {
    const validate = requestConfirmTool.validate!;
    expect(() =>
      validate({
        proposalType: "campaign-build",
        wording: "Want me to build the campaigns for approval?",
        summary: "Build the approved structure into Google Ads PAUSED.",
        draftSettings: "not an object",
      }),
    ).toThrow(/draftSettings must be an object/);

    expect(() =>
      validate({
        proposalType: "campaign-build",
        wording: "Want me to build the campaigns for approval?",
        summary: "Build the approved structure into Google Ads PAUSED.",
        draftSettings: [],
      }),
    ).toThrow(/draftSettings must be an object/);
  });

  it("rejects non-object root", () => {
    const validate = requestConfirmTool.validate!;
    expect(() => validate(null)).toThrow();
    expect(() => validate("string")).toThrow();
  });
});

describe("request_confirm \u2014 execute", () => {
  it("returns a fresh confirmId on each call", async () => {
    const args = {
      proposalType: "campaign-restructure" as const,
      wording: "Want me to restructure the campaigns for approval?",
      summary: "Split brand and generic across 4 campaigns.",
      draftSettings: { proposalServiceRadius: "metro" },
    };
    const r1 = await requestConfirmTool.execute(args, baseCtx());
    const r2 = await requestConfirmTool.execute(args, baseCtx());
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    const d1 = r1.data as { confirmId: string };
    const d2 = r2.data as { confirmId: string };
    expect(typeof d1.confirmId).toBe("string");
    expect(d1.confirmId.length).toBeGreaterThan(0);
    expect(d1.confirmId).not.toBe(d2.confirmId);
  });

  it("echoes proposalType, wording, and draftSettings in the response", async () => {
    const args = {
      proposalType: "campaign-build" as const,
      wording: "Want me to build the campaigns for approval?",
      summary: "Build the approved structure into Google Ads PAUSED.",
      draftSettings: { foo: "bar", n: 42 },
    };
    const result = await requestConfirmTool.execute(args, baseCtx());
    expect(result.ok).toBe(true);
    const data = result.data as {
      confirmId: string;
      proposalType: string;
      wording: string;
      draftSettings: Record<string, unknown>;
    };
    expect(data.proposalType).toBe("campaign-build");
    expect(data.wording).toBe("Want me to build the campaigns for approval?");
    expect(data.draftSettings).toEqual({ foo: "bar", n: 42 });
  });

  it("declares the right name and inputSchema fields", () => {
    expect(requestConfirmTool.name).toBe("request_confirm");
    const props = (requestConfirmTool.inputSchema as { properties: Record<string, unknown> })
      .properties;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(["proposalType", "wording", "summary", "draftSettings"]),
    );
  });
});
