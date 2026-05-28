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

const mockCheckPinWithLockout = vi.fn();
vi.mock("@/lib/pin-auth", () => ({
  checkPinWithLockout: (...args: unknown[]) => mockCheckPinWithLockout(...args),
}));

function postRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const builderData = {
  status: "client_review",
  universalNegatives: [
    {
      name: "Jobs",
      keywords: [
        { phrase: "careers", matchType: "PHRASE", removed: false },
        { phrase: "agency removed", matchType: "EXACT", removed: true },
      ],
    },
  ],
  accountWideNegatives: [
    {
      name: "Research",
      keywords: [{ phrase: "free template", matchType: "EXACT", removed: false }],
    },
  ],
  campaignSpecificNegatives: [
    {
      campaignName: "Brand",
      keywords: [
        { phrase: "cheap", matchType: "PHRASE", removed: false },
        { phrase: "old", matchType: "EXACT", removed: true },
      ],
    },
  ],
  clientNotes: "",
};

describe("negative keyword build public review regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("requires slug and PIN before looking up client review data", async () => {
    const { GET } = await import("@/app/(frontend)/api/negative-keyword-build/route");

    const res = await GET(new NextRequest("http://localhost/api/negative-keyword-build?slug=audit"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "slug and pin are required" });
    expect(mockPayload.find).not.toHaveBeenCalled();
    expect(mockCheckPinWithLockout).not.toHaveBeenCalled();
  });

  it("blocks unpublished client review pages before checking the PIN", async () => {
    const { GET } = await import("@/app/(frontend)/api/negative-keyword-build/route");
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 7, slug: "audit", presentationPin: "1234", negativeListBuilderPublished: false, negativeListBuilder: builderData }],
    });

    const res = await GET(new NextRequest("http://localhost/api/negative-keyword-build?slug=audit&pin=1234"));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Negative keyword list is not published" });
    expect(mockCheckPinWithLockout).not.toHaveBeenCalled();
  });

  it("returns only non-removed review keywords and preserves match types for a valid PIN", async () => {
    const { GET } = await import("@/app/(frontend)/api/negative-keyword-build/route");
    mockPayload.find
      .mockResolvedValueOnce({
        docs: [{
          id: 7,
          slug: "audit",
          businessName: "Acme",
          presentationPin: "1234",
          negativeListBuilderPublished: true,
          client: 55,
          negativeListBuilder: builderData,
        }],
      })
      .mockResolvedValueOnce({
        docs: [{
          name: "Existing",
          scope: "account",
          campaigns: [],
          keywords: [
            { keyword: "competitor", matchType: "phrase", secret: "hidden" },
            { keyword: "jobs", matchType: "exact" },
          ],
          isActive: true,
        }],
      });
    mockCheckPinWithLockout.mockResolvedValueOnce({ ok: true });

    const res = await GET(new NextRequest("http://localhost/api/negative-keyword-build?slug=audit&pin=1234"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockCheckPinWithLockout).toHaveBeenCalledWith("nkb:7", "1234", "1234");
    expect(json.accountWideKeywords).toEqual([
      expect.objectContaining({ phrase: "careers", matchType: "PHRASE", sourceSection: "universal", sourceCategoryName: "Jobs" }),
      expect.objectContaining({ phrase: "free template", matchType: "EXACT", sourceSection: "accountWide", sourceCategoryName: "Research" }),
    ]);
    expect(JSON.stringify(json)).not.toContain("agency removed");
    expect(json.campaignSpecificKeywords).toEqual([
      { campaignName: "Brand", keywords: [expect.objectContaining({ phrase: "cheap", matchType: "PHRASE" })] },
    ]);
    expect(json.existingNegativeKeywordLists[0].keywords).toEqual([
      { keyword: "competitor", matchType: "phrase" },
      { keyword: "jobs", matchType: "exact" },
    ]);
    expect(JSON.stringify(json)).not.toContain("hidden");
  });

  it("rejects client save-edits with an invalid PIN and does not update NLB data", async () => {
    const { POST } = await import("@/app/(frontend)/api/negative-keyword-build-comments/route");
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 7, slug: "audit", presentationPin: "1234", negativeListBuilderPublished: true, negativeListBuilder: builderData }],
    });
    mockCheckPinWithLockout.mockResolvedValueOnce({ ok: false, status: 401, message: "Incorrect PIN" });

    const res = await POST(postRequest("http://localhost/api/negative-keyword-build-comments", {
      slug: "audit",
      pin: "0000",
      action: "save-edits",
      accountWideKeywords: [{ phrase: "leaked", matchType: "EXACT" }],
    }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Incorrect PIN" });
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("saves client comments, removals, notes, and match-type edits back to source categories", async () => {
    const { POST } = await import("@/app/(frontend)/api/negative-keyword-build-comments/route");
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 7, slug: "audit", presentationPin: "1234", negativeListBuilderPublished: true, negativeListBuilder: builderData }],
    });
    mockCheckPinWithLockout.mockResolvedValueOnce({ ok: true });
    mockPayload.update.mockResolvedValueOnce({ id: 7 });

    const res = await POST(postRequest("http://localhost/api/negative-keyword-build-comments", {
      slug: "audit",
      pin: "1234",
      action: "save-edits",
      clientNotes: "Please exclude only low-intent traffic.",
      accountWideKeywords: [
        {
          originalPhrase: "careers",
          phrase: "job careers",
          matchType: "EXACT",
          clientRemoved: true,
          clientComment: "Too broad",
          sourceSection: "universal",
          sourceCategoryName: "Jobs",
        },
        {
          phrase: "free template",
          matchType: "PHRASE",
          clientRemoved: false,
          clientComment: "Keep as phrase",
          sourceSection: "accountWide",
          sourceCategoryName: "Research",
        },
      ],
      campaignSpecificKeywords: [
        {
          campaignName: "Brand",
          keywords: [{ phrase: "cheap", matchType: "EXACT", clientComment: "exact only", originalPhrase: "cheap" }],
        },
      ],
    }));

    expect(res.status).toBe(200);
    const update = mockPayload.update.mock.calls[0][0];
    expect(update.collection).toBe("google-ads-audits");
    expect(update.id).toBe(7);
    expect(update.data.negativeListBuilder.clientNotes).toBe("Please exclude only low-intent traffic.");
    expect(update.data.negativeListBuilder.universalNegatives[0].keywords[0]).toMatchObject({
      phrase: "job careers",
      matchType: "EXACT",
      clientRemoved: true,
      clientComment: "Too broad",
      removed: false,
    });
    expect(update.data.negativeListBuilder.accountWideNegatives[0].keywords[0]).toMatchObject({
      phrase: "free template",
      matchType: "PHRASE",
      clientRemoved: false,
      clientComment: "Keep as phrase",
    });
    expect(update.data.negativeListBuilder.campaignSpecificNegatives[0].keywords[0]).toEqual({
      phrase: "cheap",
      matchType: "EXACT",
      clientComment: "exact only",
    });
  });

  it("submits client approval, records timestamp, and notifies account managers when configured", async () => {
    const { POST } = await import("@/app/(frontend)/api/negative-keyword-build-comments/route");
    process.env.POSTMARK_API_KEY = "postmark-key";
    mockPayload.find.mockResolvedValueOnce({
      docs: [{
        id: 7,
        slug: "audit",
        businessName: "Acme",
        presentationPin: "1234",
        negativeListBuilderPublished: true,
        client: 55,
        negativeListBuilder: builderData,
      }],
    });
    mockPayload.findByID.mockResolvedValueOnce({ accountManagers: [{ email: "manager@test.com" }, { email: "" }] });
    mockPayload.update.mockResolvedValueOnce({ id: 7 });
    mockCheckPinWithLockout.mockResolvedValueOnce({ ok: true });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await POST(postRequest("http://localhost/api/negative-keyword-build-comments", {
      slug: "audit",
      pin: "1234",
      action: "submit-approval",
      clientNotes: "Approved with edits",
    }));

    expect(res.status).toBe(200);
    const updatedNlb = mockPayload.update.mock.calls[0][0].data.negativeListBuilder;
    expect(updatedNlb.status).toBe("client_approved");
    expect(updatedNlb.clientNotes).toBe("Approved with edits");
    expect(typeof updatedNlb.clientApprovedAt).toBe("string");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.postmarkapp.com/email",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("manager@test.com"),
      }),
    );
    delete process.env.POSTMARK_API_KEY;
  });
});
