import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";
import { getGoogleMateInitialTools, getTools } from "@/lib/agents/optimate-google-ads";
import type { Message } from "@/lib/agents/_shared/llm/types";
import { GOOGLE_ADS_CHANGE_PREVIEWS_SCHEMA } from "@/lib/agents/optimate-google-ads/change-previews-schema";
import {
  applyChangePreview,
  changePreviewDb,
  listChangePreviewsForRun,
  type ChangePreviewDb,
} from "@/lib/agents/optimate-google-ads/change-previews";
import { fitRows, googleAdsQuery } from "@/lib/agents/optimate-google-ads/tools/google-ads-query";
import {
  checkMutateOperations,
  createGoogleAdsMutatePreviewTool,
} from "@/lib/agents/optimate-google-ads/tools/google-ads-mutate-preview";

const NOW = new Date("2026-10-20T02:00:00.000Z");
const ctx = {
  agentName: "optimate-google-ads",
  agentRunId: "run-9",
  context: { customerId: "123-456-7890", clientId: 42, auditId: 99, userId: 1 },
  log: () => undefined,
};
const pauseOp = {
  campaignOperation: { update: { resourceName: "customers/1234567890/campaigns/111", status: "PAUSED" }, updateMask: "status" },
};

function userMessage(text: string): Message {
  return { role: "user", content: [{ type: "text", text }] };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("google_ads_query", () => {
  it("rejects anything that is not a SELECT", () => {
    expect(() => googleAdsQuery.validate!({ query: "DELETE FROM campaign" })).toThrow(/SELECT/);
    expect(() => googleAdsQuery.validate!({ query: "SELECT campaign.id FROM campaign", limit: 5000 })).toThrow(/limit/);
  });

  it("queries the selected client's account and reports when rows were cut", async () => {
    vi.stubEnv("INTERNAL_API_KEY", "test-key");
    vi.stubEnv("GROWTH_TOOLS_URL", "https://growth-tools.test");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ rows: [{ campaign: { id: "1" } }], rowCount: 1, truncated: true })));
    vi.stubGlobal("fetch", fetchMock);

    const args = googleAdsQuery.validate!({ query: "SELECT campaign.id FROM campaign", limit: 1 });
    const result = await googleAdsQuery.execute(args, ctx);

    expect(fetchMock).toHaveBeenCalledWith("https://growth-tools.test/api/google-ads/query", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
      limit: 1,
    });
    expect(result).toMatchObject({ ok: true, data: { rowCount: 1, note: expect.stringContaining("row limit reached") } });
  });

  it("keeps leading rows that fit the size budget", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i, name: "x".repeat(40) }));
    const fitted = fitRows(rows, 500);
    expect(fitted.trimmed).toBe(true);
    expect(JSON.stringify(fitted.rows).length).toBeLessThanOrEqual(500);
    expect(fitted.rows[0]).toEqual(rows[0]);
    expect(fitRows(rows.slice(0, 2), 10_000)).toEqual({ rows: rows.slice(0, 2), trimmed: false });
  });
});

describe("google_ads_mutate_preview", () => {
  let client: Client;
  let db: ChangePreviewDb;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("create table users (id integer primary key)");
    await client.execute("insert into users (id) values (1)");
    for (const [, statement] of GOOGLE_ADS_CHANGE_PREVIEWS_SCHEMA) await client.execute(statement);
    db = changePreviewDb({ db: { drizzle: drizzle(client) } } as unknown as Payload);
  });
  afterEach(() => client.close());

  it("refuses malformed operations and account access, link and billing changes", () => {
    expect(checkMutateOperations([])).toMatch(/1 to 100/);
    expect(checkMutateOperations([{ campaign: {} }])).toMatch(/exactly one/);
    expect(checkMutateOperations([{ campaignOperation: {}, adGroupOperation: {} }])).toMatch(/exactly one/);
    expect(checkMutateOperations([{ customerUserAccessOperation: { remove: "x" } }])).toMatch(/not allowed/);
    expect(checkMutateOperations([{ customerClientLinkOperation: { create: {} } }])).toMatch(/not allowed/);
    expect(checkMutateOperations([{ accountBudgetProposalOperation: { create: {} } }])).toMatch(/not allowed/);
    expect(checkMutateOperations([pauseOp])).toBeNull();
  });

  it("validates with Google first, stores the live request, and changes nothing", async () => {
    const send = vi.fn(async () => ({ ok: true, data: { validateOnly: true } }));
    const tool = createGoogleAdsMutatePreviewTool(async () => db, send, () => NOW);

    const result = await tool.execute(tool.validate!({ operations: [pauseOp], summary: "Pause campaign 111" }), ctx);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ customerId: "1234567890", operations: [pauseOp], validateOnly: true });
    expect(result).toMatchObject({ ok: true, data: { previewed: true, applied: false, validatedByGoogle: true } });

    const [card] = await listChangePreviewsForRun(db, "run-9", 1);
    expect(card).toMatchObject({ action: "google_ads_mutate", summary: "Pause campaign 111", details: { operations: [pauseOp] } });

    // Apply live sends the stored request for real, once.
    const live = vi.fn(async () => ({ ok: true, data: { results: [{}] } }));
    expect((await applyChangePreview(db, card!.id, 1, { now: () => NOW, send: live })).status).toBe("applied");
    expect(live).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/google-ads/mutate",
      body: { customerId: "1234567890", operations: [pauseOp], validateOnly: false, confirm: true },
    });
  });

  it("stores nothing when Google rejects the operations", async () => {
    const send = vi.fn(async () => ({ ok: false, error: "Growth Tools 400: invalid field" }));
    const tool = createGoogleAdsMutatePreviewTool(async () => db, send, () => NOW);

    const result = await tool.execute(tool.validate!({ operations: [pauseOp], summary: "Pause campaign 111" }), ctx);

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("nothing was saved") });
    expect(await listChangePreviewsForRun(db, "run-9", 1)).toEqual([]);
  });

  it("refuses without a signed-in user and never calls Google", async () => {
    const send = vi.fn();
    const tool = createGoogleAdsMutatePreviewTool(async () => db, send, () => NOW);

    const result = await tool.execute(tool.validate!({ operations: [pauseOp], summary: "Pause campaign 111" }), {
      ...ctx,
      context: { customerId: "1234567890" },
    });

    expect(result.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("routing", () => {
  it("registers both tools and loads them for live-change and performance requests", () => {
    const names = getTools().map((tool) => tool.name);
    expect(names).toContain("google_ads_query");
    expect(names).toContain("google_ads_mutate_preview");

    const pause = getGoogleMateInitialTools([userMessage("pause the brand campaign")]).map((tool) => tool.name);
    expect(pause).toContain("google_ads_mutate_preview");
    expect(pause).toContain("google_ads_query");
    expect(getGoogleMateInitialTools([userMessage("campaign performance last week")]).map((tool) => tool.name)).toContain("google_ads_query");
  });

  it("hides the raw change tool when an untrusted email is attached", () => {
    const names = getGoogleMateInitialTools([userMessage("pause the brand campaign")], { restrictExternalContextActions: true }).map((tool) => tool.name);
    expect(names).not.toContain("google_ads_mutate_preview");
    expect(names).toContain("google_ads_query");
  });
});
