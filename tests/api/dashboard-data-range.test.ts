/**
 * Regression tests for the dashboard data API range pass-through bug.
 *
 * The Growth Tools `/api/google-ads/dashboard/:slug` endpoint speaks its own
 * range vocabulary: snake_case slugs (`this_month`, `last_30_days`,
 * `last_6_months`, …, `all_time`) plus a literal
 * `custom:YYYY-MM-DD,YYYY-MM-DD` span. The CMS dashboard dropdown sends those
 * exact values, and the CMS route is expected to forward them verbatim.
 *
 * The current implementation pipes the raw query-string range through
 * `resolveRange()`, which only understands the AGENT-side vocabulary
 * (uppercase presets and `YYYY-MM-DD..YYYY-MM-DD` with two dots). Every
 * dashboard slug therefore either gets uppercased the wrong shape or, in the
 * `custom:` case, silently coerced to `LAST_30_DAYS`. These tests pin the
 * correct end-to-end behaviour so the fix can be verified.
 *
 * Mirrors tests/agents/custom-range-passthrough.test.ts: env BEFORE import,
 * mock global fetch, capture the outbound URL.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.GROWTH_TOOLS_URL = "https://growth.test";
process.env.INTERNAL_API_KEY = "test-key";

// Bypass the dashboard cookie check — these tests are about range forwarding,
// not auth. The route imports validateDashboardToken from a relative path
// ("../verify/route"); we mock the resolved alias so any import shape works.
vi.mock("@/app/(frontend)/api/dashboard/verify/route", () => ({
  validateDashboardToken: () => true,
  POST: vi.fn(),
}));

const { GET } = await import("@/app/(frontend)/api/dashboard/data/route");

function mockFetchOnce(payload: unknown = { ok: true }) {
  const captured: { url?: string } = {};
  globalThis.fetch = vi.fn(async (url: unknown) => {
    captured.url = String(url);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return captured;
}

function makeReq(query: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/dashboard/data?slug=foo${query ? `&${query}` : ""}`,
    { headers: { cookie: "dashboard_token=valid" } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── 1. Custom span is forwarded verbatim ─────────────────────────────────────

describe("custom:YYYY-MM-DD,YYYY-MM-DD pass-through", () => {
  it("forwards `custom:2026-05-01,2026-05-10` verbatim to Growth Tools", async () => {
    const captured = mockFetchOnce({ campaigns: [] });

    const res = await GET(makeReq("range=custom:2026-05-01,2026-05-10"));
    expect(res.status).toBe(200);

    const url = captured.url ?? "";
    // URLSearchParams encodes `:` as %3A and `,` as %2C.
    expect(url).toContain("range=custom%3A2026-05-01%2C2026-05-10");
    // The bug: resolveRange() doesn't recognise the `custom:` shape and
    // falls back to LAST_30_DAYS. That must NOT happen.
    expect(url).not.toContain("range=LAST_30_DAYS");
    expect(url).not.toMatch(/range=LAST_/);
  });
});

// ── 2. Every CMS dashboard preset slug round-trips unchanged ────────────────

describe("dashboard preset slugs round-trip unchanged", () => {
  const slugs = [
    "this_month",
    "last_month",
    "last_30_days",
    "last_60_days",
    "last_3_months",
    "last_6_months",
    "this_year",
    "last_year",
    "all_time",
  ] as const;

  for (const slug of slugs) {
    it(`forwards \`${slug}\` as \`range=${slug}\``, async () => {
      const captured = mockFetchOnce({ campaigns: [] });

      const res = await GET(makeReq(`range=${slug}`));
      expect(res.status).toBe(200);

      const url = captured.url ?? "";
      // Slugs are all-lowercase snake_case — URLSearchParams does not encode
      // underscores, so the value appears literally in the query string.
      expect(url).toContain(`range=${slug}`);
      // Must not be uppercased / coerced into the agent vocabulary.
      expect(url).not.toContain(`range=${slug.toUpperCase()}`);
      expect(url).not.toContain("range=CUSTOM");
    });
  }
});

// ── 3. Missing `range` defaults to `last_month` ─────────────────────────────

describe("missing range defaults to last_month", () => {
  it("uses `range=last_month` when no range query param is provided", async () => {
    const captured = mockFetchOnce({ campaigns: [] });

    const res = await GET(makeReq(""));
    expect(res.status).toBe(200);

    const url = captured.url ?? "";
    expect(url).toContain("range=last_month");
    expect(url).not.toContain("range=LAST_MONTH");
    expect(url).not.toContain("range=LAST_30_DAYS");
  });
});

// ── 4. Invalid `custom:` shapes do NOT get forwarded as-is ──────────────────
//
// Pinning the post-fix behaviour: fall back to the route's default
// (`last_month`). Either that, or a 400, is acceptable end-to-end — but the
// one thing that must never happen is the malformed `custom:` string ending
// up in the outbound URL, because Growth Tools' `parseCustomRange` will
// reject it and 400 the whole dashboard load.

describe("invalid custom shapes do not get forwarded", () => {
  const malformed = [
    "custom:notadate,2026-05-10", // start isn't a date
    "custom:2026-05-10", // only one date
    "custom:2026-05-10,2026-04-01", // end before start
  ];

  for (const bad of malformed) {
    it(`does not forward \`${bad}\` verbatim; falls back to \`last_month\``, async () => {
      const captured = mockFetchOnce({ campaigns: [] });

      const res = await GET(makeReq(`range=${encodeURIComponent(bad)}`));

      // Either a 4xx (rejected) or a 200 with the default range — but never
      // a forwarded malformed custom string.
      if (res.status === 200) {
        const url = captured.url ?? "";
        // The bad value must not appear in any encoded form.
        expect(url).not.toContain(encodeURIComponent(bad));
        expect(url).not.toContain(bad);
        // Fallback to the route's documented default.
        expect(url).toContain("range=last_month");
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
        // Either way: fetch should not have been called with the bad value.
        expect(captured.url ?? "").not.toContain(encodeURIComponent(bad));
      }
    });
  }
});
