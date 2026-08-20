import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tenant binding for GET /api/dashboard/hubspot-post-click.
 *
 * `customerId` is a query parameter, so it is caller-controlled. A valid
 * dashboard token proves only *who is asking*, never *which ad account they own*
 * — so the route must reject any customer id that is not the one on the client
 * record the slug resolves to. Without that check, any client holding a token
 * for their own dashboard could name Away's customer id and read Away's HubSpot
 * lead PII (names, emails, companies).
 *
 * Every test below grants a valid token on purpose: the binding is what is under
 * test, not authentication.
 */

// Hoisted so the route module sees a configured service at import time; without
// it the handler short-circuits on 503 and the binding assertions prove nothing.
vi.hoisted(() => {
  process.env.GROWTH_TOOLS_URL = "http://growth-tools.test";
  process.env.INTERNAL_API_KEY = "test-internal-key";
});

const payloadMock = {
  find: vi.fn(),
  auth: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => payloadMock),
}));

vi.mock("@/payload.config", () => ({ default: {} }));

const validateDashboardToken = vi.fn();
vi.mock("@/app/(frontend)/api/dashboard/verify/route", () => ({
  validateDashboardToken: (...args: unknown[]) => validateDashboardToken(...args),
}));

import { GET } from "@/app/(frontend)/api/dashboard/hubspot-post-click/route";

const AWAY_CUSTOMER_ID = "3425353766";
const OTHER_CUSTOMER_ID = "1111111111";

function request(slug: string, customerId: string) {
  // A fresh range per call keeps the module-level response cache from serving
  // one test's payload to another.
  const range = `this_month_${Math.random().toString(36).slice(2)}`;
  return new NextRequest(
    `http://localhost/api/dashboard/hubspot-post-click?slug=${slug}&customerId=${customerId}&range=${range}`,
  );
}

/**
 * The client record for `away-digital-teams`, owning Away's ad account.
 * Takes the id explicitly rather than defaulting it — an omitted argument would
 * hit the default and silently stub the *valid* id in the fail-closed test.
 */
function stubAwayClient(googleAdsCustomerId: string | undefined) {
  payloadMock.find.mockImplementation(async ({ collection }: { collection: string }) => {
    if (collection === "clients") return { docs: [{ id: 6, slug: "away-digital-teams", googleAdsCustomerId }] };
    return { docs: [] };
  });
}

describe("hubspot post-click customer id binding", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    validateDashboardToken.mockReturnValue(true);
    stubAwayClient(AWAY_CUSTOMER_ID);
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ leads: [] }), { status: 200, headers: { "content-type": "application/json" } }),
    );
  });

  it("rejects a customer id the client does not own, even with a valid token", async () => {
    const res = await GET(request("away-digital-teams", OTHER_CUSTOMER_ID));

    expect(res.status).toBe(403);
  });

  it("does not reach the lead service when the customer id is rejected", async () => {
    // The real damage would be the upstream call: a 403 body with the leads
    // already fetched still leaks them through timing and cache side effects.
    await GET(request("away-digital-teams", OTHER_CUSTOMER_ID));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("admits the customer id that is on the client record", async () => {
    const res = await GET(request("away-digital-teams", AWAY_CUSTOMER_ID));

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("ignores dash formatting when comparing the customer id", async () => {
    const res = await GET(request("away-digital-teams", "342-535-3766"));

    expect(res.status).toBe(200);
  });

  it("fails closed when the client record carries no ad account", async () => {
    stubAwayClient(undefined);

    const res = await GET(request("away-digital-teams", AWAY_CUSTOMER_ID));

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses the reassigned legacy slug outright", async () => {
    // `away-digital` belongs to a different client now. It must not resolve to
    // Away even when the caller names Away's real customer id.
    const res = await GET(request("away-digital", AWAY_CUSTOMER_ID));

    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
