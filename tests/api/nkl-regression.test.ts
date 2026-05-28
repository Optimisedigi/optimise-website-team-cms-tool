import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  find: vi.fn(),
  findByID: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  auth: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

function postRequest(url: string, body: unknown = {}): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const importableBuilder = {
  status: "client_approved",
  universalNegatives: [
    {
      name: "Universal",
      approved: true,
      keywords: [
        { phrase: "jobs", matchType: "PHRASE" },
        { phrase: "removed", matchType: "EXACT", removed: true },
        { phrase: "client removed", matchType: "EXACT", clientRemoved: true },
      ],
    },
  ],
  accountWideNegatives: [
    {
      name: "Account",
      approved: true,
      keywords: [{ phrase: "free audit", matchType: "EXACT" }],
    },
  ],
  campaignSpecificNegatives: [
    {
      campaignName: "Brand",
      approved: true,
      keywords: [{ phrase: "cheap", matchType: "PHRASE" }],
    },
  ],
};

describe("negative keyword list admin and agent regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload.auth.mockResolvedValue({ user: { id: 99, email: "admin@test.com" } });
  });

  it("requires an authenticated admin before listing client NKLs", async () => {
    const { GET } = await import("@/app/(frontend)/api/negative-keyword-lists/for-client/route");
    mockPayload.auth.mockResolvedValueOnce({ user: null });

    const res = await GET(new NextRequest("http://localhost/api/negative-keyword-lists/for-client?clientId=55"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockPayload.find).not.toHaveBeenCalled();
  });

  it("returns only active NKL summaries for an authenticated client lookup", async () => {
    const { GET } = await import("@/app/(frontend)/api/negative-keyword-lists/for-client/route");
    mockPayload.find.mockResolvedValueOnce({
      docs: [
        { id: 1, name: "Account", keywordCount: 3, keywords: [{ keyword: "hidden" }] },
        { id: 2, name: "Brand", keywordCount: 1 },
      ],
    });

    const res = await GET(new NextRequest("http://localhost/api/negative-keyword-lists/for-client?clientId=55"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockPayload.find).toHaveBeenCalledWith(expect.objectContaining({
      collection: "negative-keyword-lists",
      where: { client: { equals: "55" }, isActive: { equals: true } },
      user: { id: 99, email: "admin@test.com" },
    }));
    expect(json.nkls).toEqual([
      { id: 1, name: "Account", keywordCount: 3 },
      { id: 2, name: "Brand", keywordCount: 1 },
    ]);
    expect(JSON.stringify(json)).not.toContain("hidden");
  });

  it("blocks unauthenticated builder imports before reading audit or creating lists", async () => {
    const { POST } = await import("@/app/(frontend)/api/google-ads-audits/[id]/negative-list-builder/import-to-cms/route");
    mockPayload.auth.mockResolvedValueOnce({ user: null });

    const res = await POST(postRequest("http://localhost/api/google-ads-audits/7/negative-list-builder/import-to-cms"), {
      params: Promise.resolve({ id: "7" }),
    });

    expect(res.status).toBe(401);
    expect(mockPayload.findByID).not.toHaveBeenCalled();
    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("imports builder keywords idempotently, skips removed keywords, and preserves match types", async () => {
    const { POST } = await import("@/app/(frontend)/api/google-ads-audits/[id]/negative-list-builder/import-to-cms/route");
    mockPayload.findByID.mockResolvedValueOnce({ id: 7, client: { id: 55 }, negativeListBuilder: importableBuilder });
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 0, docs: [] })
      .mockResolvedValueOnce({ totalDocs: 1, docs: [{ id: 20 }] })
      .mockResolvedValueOnce({ totalDocs: 0, docs: [] });
    mockPayload.create.mockResolvedValueOnce({ id: 101 }).mockResolvedValueOnce({ id: 102 });

    const res = await POST(postRequest("http://localhost/api/google-ads-audits/7/negative-list-builder/import-to-cms"), {
      params: Promise.resolve({ id: "7" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      created: ["Universal Negatives (Builder)", "Brand - Negatives (Builder)"],
      skipped: ["Account-Wide Negatives (Builder)"],
      total: 3,
    });
    expect(mockPayload.create).toHaveBeenCalledTimes(2);
    expect(mockPayload.create.mock.calls[0][0].data).toMatchObject({
      client: 55,
      name: "Universal Negatives (Builder)",
      scope: "account",
      keywords: [{ keyword: "jobs", matchType: "phrase", flaggedForRemoval: false }],
    });
    expect(mockPayload.create.mock.calls[1][0].data).toMatchObject({
      client: 55,
      name: "Brand - Negatives (Builder)",
      scope: "campaign",
      campaigns: [{ campaignName: "Brand" }],
      keywords: [{ keyword: "cheap", matchType: "phrase", flaggedForRemoval: false }],
    });
    expect(JSON.stringify(mockPayload.create.mock.calls)).not.toContain("removed");
    expect(JSON.stringify(mockPayload.create.mock.calls)).not.toContain("client removed");
  });

  it("keeps team-review save-edits behind admin auth and preserves submitted match types", async () => {
    const { POST } = await import("@/app/(frontend)/api/google-ads-audits/[id]/negative-list-builder/save-edits/route");
    mockPayload.findByID.mockResolvedValueOnce({ id: 7, negativeListBuilder: { status: "draft", universalNegatives: [] } });
    mockPayload.update.mockResolvedValueOnce({ id: 7 });

    const body = {
      universalNegatives: [{ name: "Jobs", keywords: [{ phrase: "jobs", matchType: "PHRASE" }] }],
      accountWideNegatives: [{ name: "Research", keywords: [{ phrase: "free", matchType: "EXACT" }] }],
      campaignSpecificNegatives: [{ campaignName: "Brand", keywords: [{ phrase: "cheap", matchType: "PHRASE" }] }],
    };

    const res = await POST(postRequest("http://localhost/api/google-ads-audits/7/negative-list-builder/save-edits", body), {
      params: Promise.resolve({ id: "7" }),
    });

    expect(res.status).toBe(200);
    expect(mockPayload.update.mock.calls[0][0].data.negativeListBuilder).toMatchObject(body);
  });

  it("agent NKL create preserves broad, phrase, and exact match types", async () => {
    const { applyNklCreate } = await import("@/lib/agents/optimate-google-ads/apply-handlers/nkl-create");
    mockPayload.findByID.mockResolvedValueOnce({ id: 7, client: 55, customerId: "123" });
    mockPayload.create.mockResolvedValueOnce({ id: 88 });

    const result = await applyNklCreate({
      auditId: 7,
      name: "Agent negatives",
      scope: "campaign",
      campaigns: ["Brand"],
      keywords: [
        { keyword: "jobs", matchType: "phrase" },
        { keyword: "free", matchType: "exact" },
        { keyword: "competitor", matchType: "broad" },
      ],
    }, { payload: mockPayload } as never);

    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: "negative-keyword-lists",
      data: expect.objectContaining({
        client: 55,
        source: "optimate-agent",
        campaigns: [{ campaignName: "Brand" }],
        keywords: [
          { keyword: "jobs", matchType: "phrase" },
          { keyword: "free", matchType: "exact" },
          { keyword: "competitor", matchType: "broad" },
        ],
      }),
      overrideAccess: true,
    }));
    expect(result.detail).toMatchObject({ nklId: 88, clientId: 55, scope: "campaign", keywordCount: 3 });
  });

  it("agent NKL update rejects invalid match types before mutating a list", async () => {
    const { applyNklUpdate } = await import("@/lib/agents/optimate-google-ads/apply-handlers/nkl-update");

    await expect(applyNklUpdate({
      nklId: 88,
      keywords: [{ keyword: "jobs", matchType: "negative_exact" }],
    }, { payload: mockPayload } as never)).rejects.toThrow('nkl-update: keyword[0] invalid matchType "negative_exact"');

    expect(mockPayload.update).not.toHaveBeenCalled();
  });
});
