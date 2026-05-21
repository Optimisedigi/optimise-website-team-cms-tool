/**
 * Tests for the partial-update path on
 * `PATCH /api/client-discovery-briefings/by-scope`.
 *
 * The route accepts `requirePin` and/or `hiddenSections`. We mock the
 * payload client so the assertions focus on the route's branching:
 *
 *   - Body validation (must contain at least one valid field).
 *   - `hiddenSections` is merged into existing `data` without clobbering
 *     other questionnaire fields.
 *   - Auto-create when no briefing exists yet (the panel can flip the
 *     toggle before the form has saved anything).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

import { PATCH } from "@/app/(frontend)/api/client-discovery-briefings/by-scope/route";

function patchReq(
  query: { scope: string; id: string | number },
  body: unknown,
): NextRequest {
  const url = `http://localhost/api/client-discovery-briefings/by-scope?scope=${query.scope}&id=${query.id}`;
  return new NextRequest(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/client-discovery-briefings/by-scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Authenticated admin by default; per-test overrides clear this where
    // they're testing 401 paths.
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
    // No briefing rows by default; per-test overrides set them up.
    mockPayload.find.mockResolvedValue({ docs: [] });
    // Parent doc with no PIN configured; tests overriding the PIN replace it.
    mockPayload.findByID.mockResolvedValue({ id: 9, clientPin: "" });
  });

  it("returns 401 when no user is on the request", async () => {
    mockPayload.auth.mockResolvedValueOnce({ user: null });
    const res = await PATCH(
      patchReq({ scope: "client", id: 9 }, { requirePin: true }),
    );
    expect(res.status).toBe(401);
    expect(mockPayload.create).not.toHaveBeenCalled();
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("returns 400 when neither requirePin nor hiddenSections is present", async () => {
    const res = await PATCH(patchReq({ scope: "client", id: 9 }, {}));
    expect(res.status).toBe(400);
    expect(mockPayload.create).not.toHaveBeenCalled();
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("returns 400 when hiddenSections contains a non-string entry", async () => {
    const res = await PATCH(
      patchReq(
        { scope: "client", id: 9 },
        { hiddenSections: ["businessOverview", 7] },
      ),
    );
    expect(res.status).toBe(400);
  });

  it("creates the briefing when none exists and persists requirePin", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [] });
    mockPayload.create.mockResolvedValueOnce({
      id: 1,
      requirePin: true,
      data: {},
    });

    const res = await PATCH(
      patchReq({ scope: "client", id: 9 }, { requirePin: true }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ id: 1, requirePin: true });

    expect(mockPayload.create).toHaveBeenCalledTimes(1);
    const createCall = mockPayload.create.mock.calls[0][0];
    expect(createCall.collection).toBe("client-discovery-briefings");
    expect(createCall.data).toMatchObject({
      requirePin: true,
      client: 9,
    });
  });

  it("merges hiddenSections into existing data without clobbering other fields", async () => {
    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 42,
          requirePin: false,
          data: {
            businessName: "Acme",
            services: [{ name: "SEO", highMargin: true, focus: false }],
            hiddenSections: ["googleAds"],
          },
        },
      ],
    });
    mockPayload.update.mockResolvedValueOnce({
      id: 42,
      requirePin: false,
      data: {
        businessName: "Acme",
        services: [{ name: "SEO", highMargin: true, focus: false }],
        hiddenSections: ["googleAds", "raci"],
      },
    });

    const res = await PATCH(
      patchReq(
        { scope: "client", id: 9 },
        { hiddenSections: ["googleAds", "raci"] },
      ),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hiddenSections).toEqual(["googleAds", "raci"]);

    expect(mockPayload.update).toHaveBeenCalledTimes(1);
    const updateCall = mockPayload.update.mock.calls[0][0];
    expect(updateCall.id).toBe(42);
    // The full `data` was rewritten with hiddenSections merged in — the
    // questionnaire fields (businessName / services) must survive.
    expect(updateCall.data.data).toMatchObject({
      businessName: "Acme",
      services: [{ name: "SEO", highMargin: true, focus: false }],
      hiddenSections: ["googleAds", "raci"],
    });
  });

  it("accepts both fields in one PATCH and persists both", async () => {
    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 7,
          requirePin: false,
          data: { businessName: "X", hiddenSections: [] },
        },
      ],
    });
    mockPayload.update.mockResolvedValueOnce({
      id: 7,
      requirePin: true,
      data: { businessName: "X", hiddenSections: ["timeline"] },
    });

    const res = await PATCH(
      patchReq(
        { scope: "client", id: 9 },
        { requirePin: true, hiddenSections: ["timeline"] },
      ),
    );

    expect(res.status).toBe(200);
    const updateCall = mockPayload.update.mock.calls[0][0];
    expect(updateCall.data.requirePin).toBe(true);
    expect(updateCall.data.data.hiddenSections).toEqual(["timeline"]);
    expect(updateCall.data.data.businessName).toBe("X");
  });
});
