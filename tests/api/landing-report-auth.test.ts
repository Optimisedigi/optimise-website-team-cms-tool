import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Auth contract for GET /api/dashboard/landing-experiments.
 *
 * Two independent ways in, asserted independently so widening one can never
 * silently weaken the other:
 *  - a valid dashboard token for the requested slug (client PIN flow)
 *  - an authenticated Payload admin session (internal dashboard)
 */

const payloadMock = {
  find: vi.fn(),
  auth: vi.fn(),
  db: { drizzle: { run: vi.fn(async () => ({ rows: [] })) } },
};

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => payloadMock),
}));

vi.mock("@/payload.config", () => ({ default: {} }));

const validateDashboardToken = vi.fn();
vi.mock("@/app/(frontend)/api/dashboard/verify/route", () => ({
  validateDashboardToken: (...args: unknown[]) => validateDashboardToken(...args),
}));

import { GET } from "@/app/(frontend)/api/dashboard/landing-experiments/route";

function request(slug = "away-digital") {
  return new NextRequest(`http://localhost/api/dashboard/landing-experiments?slug=${slug}`);
}

function stubReportData() {
  payloadMock.find.mockImplementation(async ({ collection }: { collection: string }) => {
    if (collection === "clients") return { docs: [{ id: 6, slug: "away-digital" }] };
    if (collection === "landing-experiments") return { docs: [] };
    return { docs: [], hasNextPage: false };
  });
}

describe("landing report auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubReportData();
  });

  it("refuses when there is neither a valid token nor an admin session", async () => {
    validateDashboardToken.mockReturnValue(false);
    payloadMock.auth.mockResolvedValue({ user: null });

    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("admits a valid dashboard token without consulting the admin session", async () => {
    validateDashboardToken.mockReturnValue(true);

    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(payloadMock.auth).not.toHaveBeenCalled();
  });

  it("admits an authenticated Payload admin when the token is invalid", async () => {
    validateDashboardToken.mockReturnValue(false);
    payloadMock.auth.mockResolvedValue({ user: { id: 1, email: "admin@example.com" } });

    const res = await GET(request());
    expect(res.status).toBe(200);
  });

  it("keeps the token scoped to its slug — the token check still receives the requested slug", async () => {
    validateDashboardToken.mockReturnValue(false);
    payloadMock.auth.mockResolvedValue({ user: null });

    await GET(request("some-other-client"));
    expect(validateDashboardToken).toHaveBeenCalledWith(undefined, "some-other-client");
  });
});
