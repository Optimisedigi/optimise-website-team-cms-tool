import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Away pages were rebuilt in place, so the report splits their history at
 * the layout cutover. This is a read-time clamp: these tests pin that the event
 * scan and the SQL facets both use the clamped window, that an empty window
 * still returns a report, and that other clients are untouched.
 */

const drizzleRun = vi.fn(async (_statement?: unknown) => ({ rows: [] as Record<string, unknown>[] }));
const payloadMock = {
  find: vi.fn(),
  auth: vi.fn(async () => ({ user: null })),
  db: { drizzle: { run: drizzleRun } },
};

vi.mock("payload", () => ({ getPayload: vi.fn(async () => payloadMock) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/app/(frontend)/api/dashboard/verify/route", () => ({
  validateDashboardToken: (token: string | undefined) => token === "valid-token",
}));

import { GET } from "@/app/(frontend)/api/dashboard/landing-experiments/route";

const CUTOVER = "2026-09-24T16:12:36.000Z";

function request(params: string) {
  return new NextRequest(`http://localhost/api/dashboard/landing-experiments?${params}`, {
    headers: { cookie: "dashboard_token=valid-token" },
  });
}

function mockLookups(slug: string) {
  payloadMock.find
    .mockResolvedValueOnce({ docs: [{ id: 42, slug }] })
    .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] })
    .mockResolvedValueOnce({ docs: [] })
    .mockResolvedValueOnce({ docs: [], hasNextPage: false });
}

function scanWindow() {
  const scan = payloadMock.find.mock.calls[3][0];
  expect(scan.collection).toBe("landing-events");
  return scan.where.occurredAt as { greater_than_equal: string; less_than: string };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T00:00:00.000Z"));
  payloadMock.find.mockReset();
  drizzleRun.mockReset();
  drizzleRun.mockResolvedValue({ rows: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("landing report layout split", () => {
  it("defaults Away to the current layout, starting at the cutover", async () => {
    mockLookups("away-digital-teams");

    const body = await (await GET(request("slug=away-digital-teams&start=2026-09-20&end=2026-09-26"))).json();

    expect(body.layout).toBe("current");
    expect(body.layoutSince).toBe(CUTOVER);
    expect(body.layoutEmpty).toBe(false);
    expect(scanWindow().greater_than_equal).toBe(CUTOVER);
    expect(scanWindow().less_than).toBe("2026-09-26T14:00:00.000Z");
  });

  it("ends the original layout at the cutover", async () => {
    mockLookups("away-digital-teams");

    const body = await (
      await GET(request("slug=away-digital-teams&start=2026-09-20&end=2026-09-26&layout=original"))
    ).json();

    expect(body.layout).toBe("original");
    expect(body.layoutUntil).toBe(CUTOVER);
    expect(scanWindow()).toEqual({ greater_than_equal: "2026-09-19T14:00:00.000Z", less_than: CUTOVER });
  });

  it("returns an empty report, not an error, when the range predates the layout", async () => {
    mockLookups("away-digital-teams");

    const res = await GET(request("slug=away-digital-teams&start=2026-08-01&end=2026-08-31"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.layoutEmpty).toBe(true);
    const window = scanWindow();
    expect(window.greater_than_equal).toBe(window.less_than);
    expect(body.eventsScanned).toBe(0);
  });

  it("leaves other clients unfiltered and without layout info", async () => {
    mockLookups("other-client");

    const body = await (await GET(request("slug=other-client&start=2026-09-20&end=2026-09-26&layout=original"))).json();

    expect(body.layout).toBeNull();
    expect(body.layoutSince).toBeNull();
    expect(scanWindow()).toEqual({
      greater_than_equal: "2026-09-19T14:00:00.000Z",
      less_than: "2026-09-26T14:00:00.000Z",
    });
  });
});
