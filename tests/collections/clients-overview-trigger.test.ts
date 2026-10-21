// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const schedule = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-overview/schedule", () => ({
  scheduleClientOverviewDraft: (...args: unknown[]) => schedule(...args),
}));
vi.mock("../../src/lib/client-overview/schedule", () => ({
  scheduleClientOverviewDraft: (...args: unknown[]) => schedule(...args),
}));

import { Clients } from "@/collections/Clients";

const firstHook = Clients.hooks?.afterChange?.[0];
const req = { payload: { logger: { info: vi.fn(), warn: vi.fn() } }, user: { id: 1 } };

async function run(operation: "create" | "update", doc: Record<string, unknown>, previousDoc: Record<string, unknown> = {}) {
  schedule.mockClear();
  await firstHook?.({ doc, previousDoc, operation, req, collection: Clients, context: {} } as never);
  return schedule.mock.calls.map((call) => call[2]);
}

describe("Clients afterChange: Who is this client? triggers", () => {
  it("drafts on create", async () => {
    expect(await run("create", { id: 1, name: "Acme", websiteUrl: "acme.com" })).toEqual(["client-created"]);
  });

  it("drafts when a website URL is first added", async () => {
    expect(await run("update", { id: 1, websiteUrl: "acme.com" }, { id: 1, websiteUrl: "" })).toEqual(["website-added"]);
  });

  it("does not draft on other updates", async () => {
    expect(await run("update", { id: 1, websiteUrl: "new.com" }, { id: 1, websiteUrl: "old.com" })).toEqual([]);
    expect(await run("update", { id: 1, websiteUrl: "" }, { id: 1, websiteUrl: "" })).toEqual([]);
  });
});
