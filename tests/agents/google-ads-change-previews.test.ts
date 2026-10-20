import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";
import { GOOGLE_ADS_CHANGE_PREVIEWS_SCHEMA } from "@/lib/agents/optimate-google-ads/change-previews-schema";
import {
  applyChangePreview,
  cancelChangePreview,
  changePreviewDb,
  createChangePreview,
  listChangePreviewsForRun,
  type ApplyDeps,
  type ChangePreviewDb,
} from "@/lib/agents/optimate-google-ads/change-previews";
import { createExecuteGoogleAdsActionTool } from "@/lib/agents/optimate-google-ads/tools/execute-google-ads-action";

// A real in-memory SQLite database with the migration's own SQL, so the
// conditional pending -> applying claim is exercised, not mocked.
let client: Client;
let db: ChangePreviewDb;

const NOW = new Date("2026-10-20T02:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

function deps(send: ApplyDeps["send"], now = NOW): ApplyDeps {
  return { now: () => now, send };
}
const sentOk = () => vi.fn(async () => ({ ok: true, data: { changed: 1 } }));

async function preview(overrides: Partial<{ ownerId: number; runId: string; now: Date }> = {}) {
  return createChangePreview(db, {
    ownerId: overrides.ownerId ?? 1,
    customerId: "1234567890",
    agentRunId: overrides.runId ?? "run-1",
    action: "campaign_status_update",
    method: "POST",
    path: "/api/google-ads/campaigns/status",
    requestBody: { campaignId: "111", status: "PAUSED", customerId: "1234567890", agentRunId: "run-1", source: "optimax" },
    summary: "Pause Brand",
    now: overrides.now ?? NOW,
  });
}

async function statusOf(id: number) {
  const res = await client.execute({ sql: "select status, last_error, result from google_ads_change_previews where id = ?", args: [id] });
  return res.rows[0] as unknown as { status: string; last_error: string | null; result: string | null } | undefined;
}

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.execute("create table users (id integer primary key)");
  await client.execute("insert into users (id) values (1), (2)");
  for (const [, statement] of GOOGLE_ADS_CHANGE_PREVIEWS_SCHEMA) await client.execute(statement);
  db = changePreviewDb({ db: { drizzle: drizzle(client) } } as unknown as Payload);
});

afterEach(() => {
  client.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Google Ads change previews", () => {
  it("lists a run's previews without logging metadata", async () => {
    const { id } = await preview();
    await preview({ runId: "other-run" });

    const listed = await listChangePreviewsForRun(db, "run-1", 1);

    expect(listed).toEqual([
      {
        id,
        status: "pending",
        action: "campaign_status_update",
        summary: "Pause Brand",
        details: { campaignId: "111", status: "PAUSED" },
        expiresAt: minutes(60).toISOString(),
      },
    ]);
    expect(await listChangePreviewsForRun(db, "run-1", 2)).toEqual([]);
  });

  it("sends the stored request once, then refuses a second apply", async () => {
    const { id } = await preview();
    const send = sentOk();

    expect(await applyChangePreview(db, id, 1, deps(send))).toEqual({ status: "applied", result: { changed: 1 } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/google-ads/campaigns/status",
      body: { campaignId: "111", status: "PAUSED", customerId: "1234567890", agentRunId: "run-1", source: "optimax" },
    });
    expect((await statusOf(id))?.status).toBe("applied");

    const again = await applyChangePreview(db, id, 1, deps(send));
    expect(again).toEqual({ status: "unavailable", reason: "This change was already applied." });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never sends a change for a user it was not prepared for", async () => {
    const { id } = await preview({ ownerId: 1 });
    const send = sentOk();

    const outcome = await applyChangePreview(db, id, 2, deps(send));

    expect(outcome).toEqual({ status: "unavailable", reason: "This change was not found." });
    expect(send).not.toHaveBeenCalled();
    expect((await statusOf(id))?.status).toBe("pending");
  });

  it("refuses an expired preview", async () => {
    const { id } = await preview();
    const send = sentOk();

    const outcome = await applyChangePreview(db, id, 1, deps(send, minutes(61)));

    expect(outcome.status).toBe("unavailable");
    expect(send).not.toHaveBeenCalled();
  });

  it("records a Growth Tools failure and does not resend it", async () => {
    const { id } = await preview();
    const send = vi.fn(async () => ({ ok: false, error: "Growth Tools 500" }));

    expect(await applyChangePreview(db, id, 1, deps(send))).toEqual({ status: "failed", error: "Growth Tools 500" });
    expect(await statusOf(id)).toMatchObject({ status: "failed", last_error: "Growth Tools 500" });
    expect((await applyChangePreview(db, id, 1, deps(send))).status).toBe("unavailable");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("cancels only a pending preview owned by the user", async () => {
    const { id } = await preview();

    expect(await cancelChangePreview(db, id, 2, NOW)).toBe(false);
    expect(await cancelChangePreview(db, id, 1, NOW)).toBe(true);
    expect(await cancelChangePreview(db, id, 1, NOW)).toBe(false);
    expect((await applyChangePreview(db, id, 1, deps(sentOk()))).status).toBe("unavailable");
  });
});

describe("execute_google_ads_action", () => {
  const ctx = {
    agentName: "optimate-google-ads",
    agentRunId: "run-7",
    context: { customerId: "123-456-7890", clientId: 42, auditId: 99, userId: 1 },
    log: () => undefined,
  };

  it("stores a preview with selected-client context and changes nothing live", async () => {
    vi.stubEnv("INTERNAL_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const tool = createExecuteGoogleAdsActionTool(async () => db, () => NOW);

    const args = tool.validate!({
      action: "campaign_status_update",
      payload: { campaignId: "111", status: "PAUSED", customerId: "999-999-9999" },
      summary: "Pause underperforming campaign",
    });
    const result = await tool.execute(args, ctx);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, data: { previewed: true, applied: false, action: "campaign_status_update" } });
    const row = (await client.execute("select owner_id, customer_id, method, path, request_body, agent_run_id from google_ads_change_previews")).rows[0];
    expect(row).toMatchObject({
      owner_id: 1,
      customer_id: "1234567890",
      method: "POST",
      path: "/api/google-ads/campaigns/status",
      agent_run_id: "run-7",
    });
    // The context customer ID wins over one the model put in the payload.
    expect(JSON.parse(String(row?.request_body))).toEqual({
      campaignId: "111",
      status: "PAUSED",
      customerId: "1234567890",
      action: "campaign_status_update",
      summary: "Pause underperforming campaign",
      agentRunId: "run-7",
      clientId: 42,
      auditId: 99,
      userId: 1,
      source: "optimax",
    });
  });

  it("refuses to prepare a change without a signed-in user", async () => {
    const tool = createExecuteGoogleAdsActionTool(async () => db, () => NOW);
    const args = tool.validate!({ action: "keyword_pause", payload: { keywordId: "5" } });

    const result = await tool.execute(args, { ...ctx, context: { customerId: "1234567890" } });

    expect(result.ok).toBe(false);
    expect((await client.execute("select count(*) as n from google_ads_change_previews")).rows[0]?.n).toBe(0);
  });
});
