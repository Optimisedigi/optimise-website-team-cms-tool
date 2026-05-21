/**
 * Tests for the `POST /api/discovery-auth` endpoint.
 *
 * The endpoint resolves the parent record via `resolveScopedBriefing` and
 * delegates rate-limited PIN comparison to `checkPinWithLockout`. We mock
 * `resolveScopedBriefing` and `checkPinWithLockout` so the test focuses on
 * the route's branching logic (body parsing, expected-PIN derivation,
 * status code mapping) rather than database wiring.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

const mockResolveScopedBriefing = vi.fn();
vi.mock("@/lib/discovery-briefing/route-utils", () => ({
  resolveScopedBriefing: (...args: unknown[]) =>
    mockResolveScopedBriefing(...args),
}));

const mockCheckPinWithLockout = vi.fn();
vi.mock("@/lib/pin-auth", () => ({
  checkPinWithLockout: (...args: unknown[]) =>
    mockCheckPinWithLockout(...args),
}));

import { POST } from "@/app/(frontend)/api/discovery-auth/route";

function postBody(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/discovery-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/discovery-auth", () => {
  beforeEach(() => {
    mockResolveScopedBriefing.mockReset();
    mockCheckPinWithLockout.mockReset();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/discovery-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing or wrong type", async () => {
    const cases: unknown[] = [
      {},
      { scope: "client", slug: "x", briefingId: "001" }, // missing password
      { scope: "neither", slug: "x", briefingId: "001", password: "1234" },
      { scope: "client", slug: 1, briefingId: "001", password: "1234" },
      { scope: "client", slug: "x", briefingId: "001", password: "" },
    ];
    for (const body of cases) {
      const res = await POST(postBody(body));
      expect(res.status).toBe(400);
    }
    // No DB work should have happened.
    expect(mockResolveScopedBriefing).not.toHaveBeenCalled();
    expect(mockCheckPinWithLockout).not.toHaveBeenCalled();
  });

  it("uses the resolved pinToMatch when requirePin is on", async () => {
    mockResolveScopedBriefing.mockResolvedValueOnce({
      ok: true,
      requirePin: true,
      pinToMatch: "1234",
      // Other fields irrelevant for this branch.
      parent: { id: 1 },
      briefing: { id: 2 },
      initialState: {},
      paddedBriefingId: "002",
      canonicalUrl: "/client/x/discovery/002",
      scopeLabel: "X",
      availableDecks: [],
    });
    mockCheckPinWithLockout.mockResolvedValueOnce({ ok: true });

    const res = await POST(
      postBody({
        scope: "client",
        slug: "x",
        briefingId: "002",
        password: "1234",
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });

    expect(mockCheckPinWithLockout).toHaveBeenCalledTimes(1);
    const [bucketKey, submitted, expected] =
      mockCheckPinWithLockout.mock.calls[0];
    expect(bucketKey).toBe("discovery-auth:client:x:002");
    expect(submitted).toBe("1234");
    expect(expected).toBe("1234");
  });

  it("falls back to an empty expected PIN when requirePin is off (still burns an attempt)", async () => {
    // requirePin off → endpoint deliberately passes "" so the lockout still
    // accrues. Page-level admin bypass is what actually short-circuits
    // legitimate access — this endpoint stays defensive.
    mockResolveScopedBriefing.mockResolvedValueOnce({
      ok: true,
      requirePin: false,
      pinToMatch: "9999",
      parent: { id: 1 },
      briefing: { id: 2 },
      initialState: {},
      paddedBriefingId: "002",
      canonicalUrl: "/client/x/discovery/002",
      scopeLabel: "X",
      availableDecks: [],
    });
    mockCheckPinWithLockout.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "Incorrect PIN",
    });

    const res = await POST(
      postBody({
        scope: "client",
        slug: "x",
        briefingId: "002",
        password: "1234",
      }),
    );

    expect(res.status).toBe(401);
    expect(mockCheckPinWithLockout).toHaveBeenCalledWith(
      "discovery-auth:client:x:002",
      "1234",
      "",
    );
  });

  it("uses an empty expected PIN when the parent could not be resolved", async () => {
    mockResolveScopedBriefing.mockResolvedValueOnce({
      ok: false,
      kind: "notFound",
    });
    mockCheckPinWithLockout.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "Incorrect PIN",
    });

    const res = await POST(
      postBody({
        scope: "proposal",
        slug: "ghost",
        briefingId: "000",
        password: "0000",
      }),
    );

    expect(res.status).toBe(401);
    expect(mockCheckPinWithLockout).toHaveBeenCalledWith(
      "discovery-auth:proposal:ghost:000",
      "0000",
      "",
    );
  });

  it("returns 429 with the lockout message when the bucket is locked", async () => {
    mockResolveScopedBriefing.mockResolvedValueOnce({
      ok: true,
      requirePin: true,
      pinToMatch: "1234",
      parent: { id: 1 },
      briefing: { id: 2 },
      initialState: {},
      paddedBriefingId: "002",
      canonicalUrl: "/client/x/discovery/002",
      scopeLabel: "X",
      availableDecks: [],
    });
    mockCheckPinWithLockout.mockResolvedValueOnce({
      ok: false,
      status: 429,
      message: "Too many incorrect attempts. Please try again in 15 minutes.",
    });

    const res = await POST(
      postBody({
        scope: "client",
        slug: "x",
        briefingId: "002",
        password: "9999",
      }),
    );

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain("Too many incorrect attempts");
  });
});
