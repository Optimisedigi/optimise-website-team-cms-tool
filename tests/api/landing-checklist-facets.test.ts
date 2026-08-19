import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The readiness checklist is reported as a column on every facet table, not as
 * a panel of its own.
 *
 * It is a `form_submit` narrowed by form id rather than an event type, so the
 * count cannot be derived from the row's own conversions — it needs its own
 * predicate in the same GROUP BY. These tests pin that the market and device
 * facets carry it, that it counts distinct sessions, and that the SQL scopes
 * it to the checklist form rather than to form submits in general.
 */

/**
 * Drizzle's `sql.raw()` returns an SQL object whose text lives in
 * `queryChunks[].value[]`, not a plain string — stringifying it yields
 * "[object Object]", which would match every facet and assign rows at random.
 */
type SqlStatement =
  | string
  | { queryChunks?: { value?: unknown[] }[] }
  | undefined;

const drizzleRun = vi.fn(
  async (_statement?: SqlStatement) => ({ rows: [] as Record<string, unknown>[] })
);
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

/** The client, property and experiment lookups the report makes before querying events. */
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

/**
 * Facets run as raw SQL through one shared helper, so the mock answers by
 * matching the bucket expression rather than by call order — an ordering
 * assumption would silently mis-assign rows the day a facet is added.
 */
function sqlText(statement?: SqlStatement): string {
  if (typeof statement === "string") return statement;
  const chunks = statement?.queryChunks ?? [];
  return chunks
    .flatMap((chunk) => (Array.isArray(chunk?.value) ? chunk.value : []))
    .filter((part): part is string => typeof part === "string")
    .join("");
}

function mockFacets(byBucket: Record<string, Record<string, unknown>[]>) {
  drizzleRun.mockImplementation(async (statement?: SqlStatement) => {
    const sql = sqlText(statement);
    // The per-bucket timing query groups by `bucket, session_id` and shares the
    // same bucket expression, so it has to be excluded explicitly or it would
    // be answered with session-count rows and silently skew the medians.
    const isTiming = sql.includes("GROUP BY bucket, session_id");
    for (const [needle, rows] of Object.entries(byBucket)) {
      if (!isTiming && sql.includes(needle) && sql.includes("GROUP BY bucket")) return { rows };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  payloadMock.find.mockReset();
  drizzleRun.mockReset();
  drizzleRun.mockResolvedValue({ rows: [] });
});

describe("checklist sign-ups on the market and device facets", () => {
  it("reports checklist sessions per market", async () => {
    mockLookups();
    mockFacets({
      "`market`": [
        { bucket: "AU", sessions: 1298, conversions: 74, checklist: 2 },
        { bucket: "US", sessions: 781, conversions: 36, checklist: 1 },
      ],
    });

    const body = await (await GET(request())).json();

    // No page_dwell rows are seeded, so the time column is null — "nobody was
    // measured", which the table renders as a dash rather than 0s.
    expect(body.markets).toEqual([
      {
        key: "AU",
        sessions: 1298,
        conversions: 74,
        conversionRate: 74 / 1298,
        checklistSessions: 2,
        medianActiveSeconds: null,
      },
      {
        key: "US",
        sessions: 781,
        conversions: 36,
        conversionRate: 36 / 781,
        checklistSessions: 1,
        medianActiveSeconds: null,
      },
    ]);
  });

  it("reports the median active seconds per market, not the mean", async () => {
    mockLookups();
    drizzleRun.mockImplementation(async (statement?: SqlStatement) => {
      const sql = sqlText(statement);
      if (sql.includes("GROUP BY bucket, session_id") && sql.includes("`market`")) {
        // Four AU sessions. The mean is skewed by one tab left open for an
        // hour; the median ignores it and reports the typical visit.
        return {
          rows: [
            { bucket: "AU", session_ms: 10_000 },
            { bucket: "AU", session_ms: 20_000 },
            { bucket: "AU", session_ms: 30_000 },
            { bucket: "AU", session_ms: 3_600_000 },
          ],
        };
      }
      if (sql.includes("`market`") && sql.includes("GROUP BY bucket")) {
        return { rows: [{ bucket: "AU", sessions: 4, conversions: 1, checklist: 0 }] };
      }
      return { rows: [] };
    });

    const body = await (await GET(request())).json();

    // Lower of the two middle values (20s), not the 917s mean.
    expect(body.markets[0].medianActiveSeconds).toBe(20);
  });

  it("reports checklist sessions per device", async () => {
    mockLookups();
    mockFacets({
      "`device_class`": [
        { bucket: "mobile", sessions: 1286, conversions: 53, checklist: 2 },
        { bucket: "desktop", sessions: 644, conversions: 53, checklist: 1 },
        // A device nobody used the checklist on must read 0, not absent: the
        // column has to reconcile down the table.
        { bucket: "tablet", sessions: 149, conversions: 4, checklist: 0 },
      ],
    });

    const body = await (await GET(request())).json();

    expect(body.devices.map((row: { key: string; checklistSessions: number }) => [row.key, row.checklistSessions])).toEqual([
      ["mobile", 2],
      ["desktop", 1],
      ["tablet", 0],
    ]);
  });

  it("counts checklist sign-ups on distinct sessions, scoped to the checklist form", async () => {
    mockLookups();
    mockFacets({ "`market`": [{ bucket: "AU", sessions: 10, conversions: 1, checklist: 1 }] });

    await GET(request());

    const marketSql = drizzleRun.mock.calls
      .map((call) => sqlText(call[0]))
      .find((sql) => sql.includes("`market`") && sql.includes("GROUP BY bucket"));

    expect(marketSql).toBeDefined();
    // Distinct sessions, or a visitor who downloads twice counts twice.
    expect(marketSql).toContain("COUNT(DISTINCT CASE WHEN");
    // Narrowed to the one form: counting every form_submit would report leads
    // as checklist sign-ups.
    expect(marketSql).toContain("'$.form_id'");
    expect(marketSql).toContain("readiness-checklist");
  });

  it("defaults the count to zero rather than dropping the field", async () => {
    mockLookups();
    // An older row shape with no checklist column must still render a number.
    mockFacets({ "`market`": [{ bucket: "AU", sessions: 10, conversions: 1 }] });

    const body = await (await GET(request())).json();
    expect(body.markets[0].checklistSessions).toBe(0);
  });

  it("does not truncate the paid timing scan, which would truncate by bucket", async () => {
    mockLookups();
    mockFacets({});

    await GET(request());

    const timingSql = drizzleRun.mock.calls
      .map((call) => sqlText(call[0]))
      .find((sql) => sql.includes("SUM(ms) AS session_ms"));

    expect(timingSql).toBeDefined();
    // A LIMIT here cuts in grouping-key order rather than evenly, so the pages
    // latest in the alphabet lose every session and report "not measured"
    // despite having data, while the survivors' medians come from a partial set.
    expect(timingSql).not.toMatch(/LIMIT/i);
  });

  it("keeps the page facet free of the column it does not show", async () => {
    mockLookups();
    mockFacets({ "`page_id`": [{ bucket: "offshore-teams-au", sessions: 10, conversions: 1 }] });

    const body = await (await GET(request())).json();
    expect(body.pages[0]).not.toHaveProperty("checklistSessions");
  });
});
