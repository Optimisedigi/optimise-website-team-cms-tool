import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The event scan stops at a ceiling so one busy client cannot stall the
 * dashboard. That makes the sort order a correctness question, not a
 * preference: whichever end is read last is the end that gets dropped.
 *
 * Ascending dropped the newest events, so a range that claimed to cover a
 * month could omit today from the headline numbers while the SQL-computed
 * tables below still counted it — the same page disagreeing with itself.
 * These tests pin the descending scan and the ordering logic that depends on
 * it.
 */

const drizzleRun = vi.fn(async () => ({ rows: [] as Record<string, unknown>[] }));
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

function request(params = "slug=away-digital&days=30") {
  return new NextRequest(`http://localhost/api/dashboard/landing-experiments?${params}`, {
    headers: { cookie: "dashboard_token=valid-token" },
  });
}

function mockLookups(docs: Record<string, unknown>[] = []) {
  payloadMock.find
    .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
    .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] })
    .mockResolvedValueOnce({
      docs: [
        {
          experimentId: "landing-hero-v1",
          name: "Hero test",
          status: "running",
          allocationVersion: "1",
          primaryGoal: "booking_complete",
          variants: [{ variantId: "a" }, { variantId: "b" }],
        },
      ],
    })
    .mockResolvedValueOnce({ docs, hasNextPage: false });
}

beforeEach(() => {
  payloadMock.find.mockReset();
  drizzleRun.mockReset();
  drizzleRun.mockResolvedValue({ rows: [] });
});

describe("event scan recency", () => {
  it("reads the newest events first, so a capped scan drops the oldest", async () => {
    mockLookups();

    await GET(request());

    // The 4th find is the event scan; the three before it are the client,
    // property and experiment lookups.
    const scan = payloadMock.find.mock.calls[3][0];
    expect(scan.collection).toBe("landing-events");
    expect(scan.sort).toBe("-occurredAt");
  });

  it("treats the first section_view seen as the exit point", async () => {
    // Delivered newest-first, as the live scan does: the session reached
    // 'faqs' last, then 'how' earlier. The later-arriving (older) row must not
    // overwrite the exit point.
    mockLookups([
      { eventType: "section_view", sessionId: "s1", variantId: "a", properties: { section_id: "faqs" } },
      { eventType: "section_view", sessionId: "s1", variantId: "a", properties: { section_id: "how" } },
    ]);

    const body = await (await GET(request())).json();

    const exits = Object.fromEntries(
      body.sections.map((row: { sectionId: string; exits: number }) => [row.sectionId, row.exits])
    );
    expect(exits.faqs).toBe(1);
    expect(exits.how ?? 0).toBe(0);
  });
});
