import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

const mockPayload = {
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

import { GET, POST } from "@/app/(frontend)/api/dashboard/keyword-selections/route";

// ─── Helpers ───────────────────────────────────────────────────
// Must match the fallback in validateDashboardToken (verify/route.ts)
const COOKIE_SECRET =
  process.env.PAYLOAD_SECRET || process.env.INTERNAL_API_KEY || "dashboard-fallback-secret";

function signToken(slug: string): string {
  const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
  const payload = `${slug}:${expiresAt}`;
  const sig = crypto.createHmac("sha256", COOKIE_SECRET).update(payload).digest("hex");
  return `${payload}:${sig}`;
}

// ─── GET Tests ──────────────────────────────────────────────────
describe("GET /api/dashboard/keyword-selections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without valid token", async () => {
    const req = new NextRequest(
      "http://localhost:3001/api/dashboard/keyword-selections?slug=acme&clientId=1",
      { method: "GET" }
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns existing pending session keywords", async () => {
    vi.mocked(mockPayload.find).mockResolvedValueOnce({
      docs: [{
        id: 5,
        title: "Session 1",
        keywords: [
          { keyword: "bad term", matchType: "exact" },
          { keyword: "waste spend", matchType: "broad" },
        ],
      }],
    });

    const token = signToken("acme");
    const req = new NextRequest(
      `http://localhost:3001/api/dashboard/keyword-selections?slug=acme&clientId=1`,
      { headers: { cookie: `dashboard_token=${token}` }, method: "GET" }
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.keywords).toEqual(["bad term", "waste spend"]);
    expect(body.sessionId).toBe(5);
    expect(body.title).toBe("Session 1");
  });

  it("returns empty keywords when no pending session exists", async () => {
    vi.mocked(mockPayload.find).mockResolvedValueOnce({ docs: [] });

    const token = signToken("acme");
    const req = new NextRequest(
      `http://localhost:3001/api/dashboard/keyword-selections?slug=acme&clientId=1`,
      { headers: { cookie: `dashboard_token=${token}` }, method: "GET" }
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.keywords).toEqual([]);
    expect(body.sessionId).toBeUndefined();
  });
});

// ─── POST Tests ──────────────────────────────────────────────────
describe("POST /api/dashboard/keyword-selections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when required fields are missing", async () => {
    const token = signToken("acme");
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `dashboard_token=${token}` },
      body: JSON.stringify({ clientId: "1", slug: "acme" }), // missing selectedTerms
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when selectedTerms is not an array", async () => {
    const token = signToken("acme");
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `dashboard_token=${token}` },
      body: JSON.stringify({ clientId: "1", slug: "acme", selectedTerms: "not-an-array" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 without valid token", async () => {
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "1", slug: "acme", selectedTerms: ["kw1"] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates a new session with correct keyword structure", async () => {
    // Route looks up the latest Google Ads audit for the client — mock it.
    vi.mocked(mockPayload.find).mockResolvedValueOnce({
      docs: [{ id: 55 }],
      totalDocs: 1,
      hasNextPage: false,
      hasPrevPage: false,
    } as any);
    vi.mocked(mockPayload.create).mockResolvedValueOnce({ id: 99 });

    const token = signToken("acme");
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `dashboard_token=${token}` },
      body: JSON.stringify({
        clientId: "1",
        slug: "acme",
        selectedTerms: ["negative term", "waste spend"],
        title: "My review",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);
    expect(body.sessionId).toBe(99);

    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "keyword-deep-dive-sessions",
        data: expect.objectContaining({
          client: "1",
          status: "pending",
          // Route resolves this server-side from the latest audit for the client.
          googleAdsAudit: 55,
          title: "My review",
          keywords: expect.arrayContaining([
            expect.objectContaining({ keyword: "negative term", matchType: "exact", flaggedForRemoval: false }),
            expect.objectContaining({ keyword: "waste spend", matchType: "exact", flaggedForRemoval: false }),
          ]),
        }),
      })
    );
  });

  it("does not include flaggedForRemoval in created keywords", async () => {
    vi.mocked(mockPayload.create).mockResolvedValueOnce({ id: 99 });

    const token = signToken("acme");
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `dashboard_token=${token}` },
      body: JSON.stringify({ clientId: "1", slug: "acme", selectedTerms: ["kw"] }),
    });
    await POST(req);

    const call = mockPayload.create.mock.calls[0][0];
    const keywords = call.data.keywords;
    expect(keywords[0].flaggedForRemoval).toBe(false);
  });

  it("skips terms that already exist in a prior submit (case-insensitive)", async () => {
    // Three find() calls happen in order: latest audit, prior submits, NKLs.
    vi.mocked(mockPayload.find)
      .mockResolvedValueOnce({ docs: [{ id: 55 }], totalDocs: 1 } as any)
      .mockResolvedValueOnce({
        docs: [
          { id: 1, keywords: [{ keyword: "AG Cylinders" }, { keyword: "old waste" }] },
        ],
        totalDocs: 1,
      } as any)
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 } as any);
    vi.mocked(mockPayload.create).mockResolvedValueOnce({ id: 99 });

    const token = signToken("acme");
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `dashboard_token=${token}` },
      body: JSON.stringify({
        clientId: "1",
        slug: "acme",
        // "ag cylinders" already exists (different case), "new term" doesn't.
        selectedTerms: ["ag cylinders", "new term"],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.skipped).toBe(1);

    const created = mockPayload.create.mock.calls[0][0].data.keywords;
    expect(created).toHaveLength(1);
    expect(created[0].keyword).toBe("new term");
  });

  it("skips terms that already exist in a Negative Keyword List", async () => {
    vi.mocked(mockPayload.find)
      .mockResolvedValueOnce({ docs: [{ id: 55 }], totalDocs: 1 } as any)
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 } as any)
      .mockResolvedValueOnce({
        docs: [
          { id: 10, keywords: [{ keyword: "already negated" }] },
        ],
        totalDocs: 1,
      } as any);
    vi.mocked(mockPayload.create).mockResolvedValueOnce({ id: 99 });

    const token = signToken("acme");
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `dashboard_token=${token}` },
      body: JSON.stringify({
        clientId: "1",
        slug: "acme",
        selectedTerms: ["already negated", "fresh keyword"],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.count).toBe(1);
    expect(body.skipped).toBe(1);
    expect(mockPayload.create.mock.calls[0][0].data.keywords[0].keyword).toBe(
      "fresh keyword",
    );
  });

  it("returns success without creating a submit when all terms are duplicates", async () => {
    vi.mocked(mockPayload.find)
      .mockResolvedValueOnce({ docs: [{ id: 55 }], totalDocs: 1 } as any)
      .mockResolvedValueOnce({
        docs: [{ id: 1, keywords: [{ keyword: "dup1" }, { keyword: "dup2" }] }],
        totalDocs: 1,
      } as any)
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 } as any);

    const token = signToken("acme");
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `dashboard_token=${token}` },
      body: JSON.stringify({
        clientId: "1",
        slug: "acme",
        selectedTerms: ["dup1", "dup2"],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.count).toBe(0);
    expect(body.skipped).toBe(2);
    expect(body.sessionId).toBeNull();
    expect(body.message).toMatch(/already saved|nothing new/i);
    // Crucially: no create call was made.
    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("deduplicates within the submitted batch itself", async () => {
    vi.mocked(mockPayload.find)
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 } as any)
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 } as any)
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 } as any);
    vi.mocked(mockPayload.create).mockResolvedValueOnce({ id: 99 });

    const token = signToken("acme");
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `dashboard_token=${token}` },
      body: JSON.stringify({
        clientId: "1",
        slug: "acme",
        // Same term twice (different case + whitespace).
        selectedTerms: ["foo bar", " Foo Bar ", "foo bar", "unique"],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.count).toBe(2);
    expect(body.skipped).toBe(2);
    const keywords = mockPayload.create.mock.calls[0][0].data.keywords;
    expect(keywords).toHaveLength(2);
    expect(keywords.map((k: any) => k.keyword)).toEqual(["foo bar", "unique"]);
  });
});
