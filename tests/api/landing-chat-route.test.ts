import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/dashboard/landing-chat: auth like its siblings, the layout clamp,
 * the filters reaching the SQL, and the paid split.
 */

const drizzleRun = vi.fn(async (_statement?: unknown) => ({ rows: [] as Record<string, unknown>[] }));
const payloadMock = {
  find: vi.fn(),
  auth: vi.fn(async () => ({ user: null as unknown })),
  db: { drizzle: { run: drizzleRun } },
};

vi.mock("payload", () => ({ getPayload: vi.fn(async () => payloadMock) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/app/(frontend)/api/dashboard/verify/route", () => ({
  validateDashboardToken: (token: string | undefined, slug: string) =>
    token === "valid-token" && slug === "away-digital-teams",
}));

import { GET } from "@/app/(frontend)/api/dashboard/landing-chat/route";

const CUTOVER = "2026-09-24T16:12:36.000Z";

function request(params: string, cookie: string | null = "dashboard_token=valid-token") {
  return new NextRequest(`http://localhost/api/dashboard/landing-chat?${params}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

const sqlText = (statement: unknown): string => {
  const chunks = (statement as { queryChunks?: { value?: unknown[] }[] } | undefined)?.queryChunks ?? [];
  return chunks
    .flatMap((chunk) => (Array.isArray(chunk?.value) ? chunk.value : []))
    .filter((part): part is string => typeof part === "string")
    .join("");
};

function mockClient(slug = "away-digital-teams") {
  payloadMock.find
    .mockResolvedValueOnce({ docs: [{ id: 42, slug }] })
    .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T00:00:00.000Z"));
  payloadMock.find.mockReset();
  payloadMock.auth.mockReset();
  payloadMock.auth.mockResolvedValue({ user: null });
  drizzleRun.mockReset();
  drizzleRun.mockResolvedValue({ rows: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/dashboard/landing-chat", () => {
  it("rejects a caller with neither a PIN token nor an admin session", async () => {
    const res = await GET(request("slug=away-digital-teams", null));
    expect(res.status).toBe(401);
    expect(drizzleRun).not.toHaveBeenCalled();
  });

  it("rejects a token minted for another client", async () => {
    const res = await GET(request("slug=other-client"));
    expect(res.status).toBe(401);
  });

  it("allows an admin session without a PIN token", async () => {
    payloadMock.auth.mockResolvedValue({ user: { id: 1 } });
    mockClient("other-client");
    const res = await GET(request("slug=other-client", null));
    expect(res.status).toBe(200);
  });

  it("clamps Away to the current layout and passes the filters to the query", async () => {
    mockClient();
    const res = await GET(
      request("slug=away-digital-teams&start=2026-09-20&end=2026-09-26&page=offshore-teams-au&market=AU&device=mobile"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.layout).toBe("current");
    expect(body.layoutSince).toBe(CUTOVER);
    const statement = sqlText(drizzleRun.mock.calls[0][0]);
    expect(statement).toContain(`\`occurred_at\` >= '${CUTOVER}'`);
    expect(statement).toContain("`client_id` = 42");
    expect(statement).toContain("`page_id` IN ('offshore-teams-au')");
    expect(statement).toContain("`market` = 'AU'");
    expect(statement).toContain("`device_class` = 'mobile'");
  });

  it("drops filter values that are not plain ids", async () => {
    mockClient();
    await GET(request("slug=away-digital-teams&page=x'%20OR%201=1--"));
    expect(sqlText(drizzleRun.mock.calls[0][0])).not.toContain("OR 1=1");
  });

  it("skips the event query for an empty layout window", async () => {
    mockClient();
    const res = await GET(request("slug=away-digital-teams&start=2026-08-01&end=2026-08-31"));
    const body = await res.json();
    expect(body.layoutEmpty).toBe(true);
    expect(body.all.funnel[0].sessions).toBe(0);
    // Only the tracking-since lookup runs.
    expect(drizzleRun).toHaveBeenCalledTimes(1);
    expect(sqlText(drizzleRun.mock.calls[0][0])).toContain("MIN(`occurred_at`)");
  });

  it("summarises all sessions and, separately, sessions from Google Ads", async () => {
    mockClient();
    drizzleRun
      .mockResolvedValueOnce({
        rows: [
          { session_id: "paid", event_type: "chat_open", occurred_at: "2026-09-25T00:00:00.000Z", paid: 0, trigger_kind: "auto" },
          { session_id: "paid", event_type: "chat_start", occurred_at: "2026-09-25T00:00:01.000Z", paid: 1 },
          { session_id: "free", event_type: "chat_open", occurred_at: "2026-09-25T00:00:02.000Z", paid: 0, trigger_kind: "button" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ first_open: "2026-09-25T00:00:00.000Z" }] });

    const body = await (await GET(request("slug=away-digital-teams&start=2026-09-20&end=2026-09-26"))).json();

    expect(body.all.funnel[0].sessions).toBe(2);
    expect(body.paid.funnel[0].sessions).toBe(1);
    expect(body.paid.openedBy.auto).toEqual({ sessions: 1, started: 1 });
    expect(body.trackingSince).toBe("2026-09-25T00:00:00.000Z");
  });

  it("leaves other clients unclamped", async () => {
    payloadMock.auth.mockResolvedValue({ user: { id: 1 } });
    mockClient("other-client");
    const body = await (await GET(request("slug=other-client&start=2026-09-20&end=2026-09-26", null))).json();
    expect(body.layout).toBeNull();
    expect(sqlText(drizzleRun.mock.calls[0][0])).toContain("`occurred_at` >= '2026-09-19T14:00:00.000Z'");
  });
});
