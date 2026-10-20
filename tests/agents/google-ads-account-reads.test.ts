import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGoogleMateInitialTools } from "@/lib/agents/optimate-google-ads";
import type { Message } from "@/lib/agents/_shared/llm/types";
import {
  createGetChangeHistoryTool,
  fitForModel,
  getAudience,
  getBudgetAudit,
  getConversionActions,
  getKeywordReport,
  getQualitySnapshot,
} from "@/lib/agents/optimate-google-ads/tools/google-ads-account-reads";

const ctx = {
  agentName: "optimate-google-ads",
  agentRunId: "run-reads",
  context: { customerId: "123-456-7890", userId: 1 },
  log: () => undefined,
};
let fetchMock: ReturnType<typeof vi.fn>;

function call(index = 0): { url: string; method: string; body: unknown } {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined };
}

function userMessage(text: string): Message {
  return { role: "user", content: [{ type: "text", text }] };
}

beforeEach(() => {
  vi.stubEnv("INTERNAL_API_KEY", "test-key");
  vi.stubEnv("GROWTH_TOOLS_URL", "https://gt.test");
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [1, 2] })));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("account read tools", () => {
  it("call the right Growth Tools routes with the selected client's customer ID", async () => {
    await getConversionActions.execute({}, ctx);
    await getKeywordReport.execute(getKeywordReport.validate!({ campaignId: "111" }), ctx);
    await getQualitySnapshot.execute({}, ctx);
    await getBudgetAudit.execute({}, ctx);

    expect(call(0)).toEqual({ url: "https://gt.test/api/google-ads/conversion-actions/1234567890", method: "GET", body: undefined });
    expect(call(1)).toEqual({ url: "https://gt.test/api/google-ads/report/keywords", method: "POST", body: { customerId: "1234567890", campaignId: "111" } });
    expect(call(2)).toMatchObject({ url: "https://gt.test/api/google-ads/quality-snapshot", body: { customerId: "1234567890" } });
    expect(call(3)).toMatchObject({ url: "https://gt.test/api/google-ads/audit/budget", body: { customerId: "1234567890" } });
  });

  it("returns the result and never sends a customer ID the model supplied", async () => {
    const result = await getKeywordReport.execute(getKeywordReport.validate!({ customerId: "999" } as never), ctx);
    expect(result).toEqual({ ok: true, data: { result: { items: [1, 2] } } });
    expect(call().body).toEqual({ customerId: "1234567890" });
  });

  it("rejects non-numeric IDs before calling Growth Tools", () => {
    expect(() => getKeywordReport.validate!({ adGroupId: "1 OR 1=1" })).toThrow(/numeric/);
    expect(() => getAudience.validate!({ userListId: "../x" })).toThrow(/numeric/);
    expect(() => getAudience.validate!({})).toThrow(/required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads an audience and its usage", async () => {
    const result = await getAudience.execute(getAudience.validate!({ userListId: "555" }), ctx);
    expect(call(0).url).toBe("https://gt.test/api/google-ads/audiences/555?customerId=1234567890");
    expect(call(1).url).toBe("https://gt.test/api/google-ads/audiences/555/usage?customerId=1234567890");
    expect(result).toMatchObject({ ok: true, data: { audience: { result: { items: [1, 2] } }, usage: { result: { items: [1, 2] } } } });
  });
});

describe("get_change_history", () => {
  const tool = createGetChangeHistoryTool(() => new Date("2026-10-20T05:00:00.000Z"));

  it("defaults to the last 7 days and sends the date window", async () => {
    const args = tool.validate!({});
    expect(args).toEqual({ startDay: "2026-10-14", endDay: "2026-10-20" });
    await tool.execute(args, ctx);
    expect(call().url).toBe("https://gt.test/api/google-ads/change-events?customerId=1234567890&startDay=2026-10-14&endDay=2026-10-20");
  });

  it("accepts an explicit range within Google's 30 days and rejects anything else", () => {
    expect(tool.validate!({ startDay: "2026-10-01", endDay: "2026-10-10" })).toEqual({ startDay: "2026-10-01", endDay: "2026-10-10" });
    expect(() => tool.validate!({ days: 31 })).toThrow(/1 to 30/);
    expect(() => tool.validate!({ startDay: "2026-09-01" })).toThrow(/30 days/);
    expect(() => tool.validate!({ startDay: "2026-10-18", endDay: "2026-10-21" })).toThrow(/future/);
    expect(() => tool.validate!({ startDay: "2026-10-12", endDay: "2026-10-10" })).toThrow(/on or before/);
    expect(() => tool.validate!({ startDay: "20/10/2026" })).toThrow(/YYYY-MM-DD/);
  });
});

describe("fitForModel", () => {
  it("trims the largest array of an oversized result and says so", () => {
    const big = { customerId: "1", events: Array.from({ length: 200 }, (_, i) => ({ i, text: "x".repeat(50) })) };
    const fitted = fitForModel(big, 2000);
    expect(JSON.stringify(fitted.data).length).toBeLessThanOrEqual(2000);
    expect(fitted.note).toMatch(/events: first \d+ of 200/);
    expect(fitForModel({ a: 1 })).toEqual({ data: { a: 1 } });
  });
});

describe("routing", () => {
  const names = (text: string) => getGoogleMateInitialTools([userMessage(text)]).map((tool) => tool.name);

  it("loads the account details tools for their questions only", () => {
    expect(names("what changed in the account this week?")).toContain("get_change_history");
    expect(names("which conversion actions are primary?")).toContain("get_conversion_actions");
    expect(names("show me quality scores")).toContain("get_quality_snapshot");
    expect(names("how much did we spend last month")).not.toContain("get_change_history");
  });
});
