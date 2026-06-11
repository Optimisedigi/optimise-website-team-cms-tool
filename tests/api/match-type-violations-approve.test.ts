import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

interface MockPayload {
  findByID: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  auth: ReturnType<typeof vi.fn>;
}

const mockPayload: MockPayload = {
  findByID: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  auth: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(() => Promise.resolve()),
}));

import { POST as approve } from "@/app/(frontend)/api/match-type-violations/[id]/approve/route";

const CANDIDATE = {
  id: 11,
  client: 3,
  searchTerm: "seo agency",
  triggeringKeyword: "google agency",
  violationType: "exact_close_variant",
  recommendedKeyword: "seo",
  recommendedMatchType: "phrase",
  nearestKeyword: "google agency",
  adGroupName: "search_google-ads-services_exact",
  campaignName: "search_google-ads-services_nsw",
  status: "pending",
};

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/match-type-violations/11/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
  mockPayload.update.mockResolvedValue({});
});

describe("approve route — routing", () => {
  it("routing:existing assigns to the chosen list and uses the recommended phrase negative", async () => {
    mockPayload.findByID
      .mockResolvedValueOnce(CANDIDATE) // candidate
      .mockResolvedValueOnce({ id: 99, name: "Shared NSW/QLD/VIC", keywords: [] }); // list

    const res = await approve(req({ routing: { mode: "existing", listId: 99 } }), {
      params: Promise.resolve({ id: "11" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.listId).toBe(99);
    expect(json.createdList).toBe(false);

    const listUpdate = mockPayload.update.mock.calls.find(
      (c) => c[0].collection === "negative-keyword-lists",
    );
    expect(listUpdate?.[0].data.keywords).toEqual([
      expect.objectContaining({ keyword: "seo", matchType: "phrase" }),
    ]);
  });

  it("coerces a string routing.listId (from the UI <select>) to a number for the relationship update", async () => {
    mockPayload.findByID
      .mockResolvedValueOnce(CANDIDATE) // candidate
      .mockResolvedValueOnce({ id: 99, name: "Shared NSW/QLD/VIC", keywords: [] }); // list

    // The Match Type Variance <select> always emits the chosen list id as a
    // string. The candidate's `assignedListId` relationship rejects a string
    // against an integer-keyed collection, so it must be normalised to a number.
    const res = await approve(req({ routing: { mode: "existing", listId: "99" } }), {
      params: Promise.resolve({ id: "11" }),
    });

    expect(res.status).toBe(200);
    const candidateUpdate = mockPayload.update.mock.calls.find(
      (c) => c[0].collection === "match-type-violation-candidates",
    );
    expect(candidateUpdate?.[0].data.assignedListId).toBe(99);
    expect(typeof candidateUpdate?.[0].data.assignedListId).toBe("number");
  });

  it("routing:auto matches an existing ad-group list", async () => {
    mockPayload.findByID
      .mockResolvedValueOnce(CANDIDATE) // candidate
      .mockResolvedValueOnce({ id: 42, name: "Services Exact", keywords: [] }); // resolved list
    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 42,
          scope: "ad_group",
          adGroupName: "search_google-ads-services_exact",
          isActive: true,
        },
      ],
    });

    const res = await approve(req({ routing: { mode: "auto" } }), {
      params: Promise.resolve({ id: "11" }),
    });
    const json = await res.json();

    expect(json.listId).toBe(42);
    expect(json.createdList).toBe(false);
    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("routing:auto creates a new ad-group list when none matches", async () => {
    mockPayload.findByID
      .mockResolvedValueOnce(CANDIDATE) // candidate
      .mockResolvedValueOnce({ id: 77, name: "search_google-ads-services_exact", keywords: [] }); // created list re-read
    mockPayload.find.mockResolvedValueOnce({ docs: [] });
    mockPayload.create.mockResolvedValueOnce({ id: 77 });

    const res = await approve(req({ routing: { mode: "auto" } }), {
      params: Promise.resolve({ id: "11" }),
    });
    const json = await res.json();

    expect(json.createdList).toBe(true);
    expect(json.listId).toBe(77);
    const created = mockPayload.create.mock.calls[0][0];
    expect(created.collection).toBe("negative-keyword-lists");
    expect(created.data).toMatchObject({
      scope: "ad_group",
      adGroupName: "search_google-ads-services_exact",
      source: "match_type",
    });
  });

  it("rejects when neither assignedListId nor routing is supplied", async () => {
    const res = await approve(req({}), { params: Promise.resolve({ id: "11" }) });
    expect(res.status).toBe(400);
  });

  it("honours an agency keyword/matchType override", async () => {
    mockPayload.findByID
      .mockResolvedValueOnce(CANDIDATE)
      .mockResolvedValueOnce({ id: 99, name: "Shared", keywords: [] });

    await approve(
      req({ routing: { mode: "existing", listId: 99 }, keyword: "ppc", matchType: "phrase" }),
      { params: Promise.resolve({ id: "11" }) },
    );

    const listUpdate = mockPayload.update.mock.calls.find(
      (c) => c[0].collection === "negative-keyword-lists",
    );
    expect(listUpdate?.[0].data.keywords).toEqual([
      expect.objectContaining({ keyword: "ppc", matchType: "phrase" }),
    ]);
  });
});
