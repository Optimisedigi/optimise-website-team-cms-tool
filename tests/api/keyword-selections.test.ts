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

  it("returns existing deep-dive list keywords", async () => {
    // First find() = deep-dive list. Second find() = real (synced) NKLs
    // — empty here so all deep-dive selections fall into the pending bucket.
    vi.mocked(mockPayload.find)
      .mockResolvedValueOnce({
        docs: [{
          id: 5,
          keywords: [
            { keyword: "bad term", matchType: "exact" },
            { keyword: "waste spend", matchType: "broad" },
          ],
        }],
      })
      .mockResolvedValueOnce({ docs: [] });

    const token = signToken("acme");
    const req = new NextRequest(
      `http://localhost:3001/api/dashboard/keyword-selections?slug=acme&clientId=1`,
      { headers: { cookie: `dashboard_token=${token}` }, method: "GET" }
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.keywords).toEqual(["bad term", "waste spend"]);
    expect(body.pendingSelections).toEqual(["bad term", "waste spend"]);
    expect(body.addedSelections).toEqual([]);
    expect(body.addedNegatives).toEqual([]);
    expect(body.listId).toBe(5);
  });

  it("splits deep-dive selections into pending vs added when terms appear in synced NKLs", async () => {
    // Deep-dive list has both "bad term" (still pending) and "already added"
    // (already in a synced NKL). The second find() returns one synced NKL
    // containing "already added" — so it should land in addedSelections.
    vi.mocked(mockPayload.find)
      .mockResolvedValueOnce({
        docs: [{
          id: 5,
          keywords: [
            { keyword: "bad term", matchType: "exact" },
            { keyword: "already added", matchType: "exact" },
          ],
        }],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 11, keywords: [{ keyword: "already added" }, { keyword: "another negative" }] }],
      });

    const token = signToken("acme");
    const req = new NextRequest(
      `http://localhost:3001/api/dashboard/keyword-selections?slug=acme&clientId=1`,
      { headers: { cookie: `dashboard_token=${token}` }, method: "GET" }
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pendingSelections).toEqual(["bad term"]);
    expect(body.addedSelections).toEqual(["already added"]);
    // addedNegatives includes every keyword in synced NKLs, not just deep-dive ones.
    expect(body.addedNegatives.sort()).toEqual(["already added", "another negative"].sort());
    // Legacy `keywords` field still mirrors pendingSelections.
    expect(body.keywords).toEqual(["bad term"]);
  });

  it("queries negative-keyword-lists with source=deep_dive", async () => {
    vi.mocked(mockPayload.find)
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    const token = signToken("acme");
    const req = new NextRequest(
      `http://localhost:3001/api/dashboard/keyword-selections?slug=acme&clientId=42`,
      { headers: { cookie: `dashboard_token=${token}` }, method: "GET" }
    );
    await GET(req);

    expect(mockPayload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "negative-keyword-lists",
        where: expect.objectContaining({
          and: expect.arrayContaining([
            { client: { equals: "42" } },
            { source: { equals: "deep_dive" } },
          ]),
        }),
      })
    );
  });

  it("returns empty keywords when no deep-dive list exists", async () => {
    vi.mocked(mockPayload.find)
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    const token = signToken("acme");
    const req = new NextRequest(
      `http://localhost:3001/api/dashboard/keyword-selections?slug=acme&clientId=1`,
      { headers: { cookie: `dashboard_token=${token}` }, method: "GET" }
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.keywords).toEqual([]);
    expect(body.pendingSelections).toEqual([]);
    expect(body.addedSelections).toEqual([]);
    expect(body.addedNegatives).toEqual([]);
    expect(body.listId).toBeNull();
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

  it("creates a new deep-dive list when none exists", async () => {
    // First find() (in POST) returns no existing list.
    vi.mocked(mockPayload.find).mockResolvedValueOnce({ docs: [] });
    vi.mocked(mockPayload.create).mockResolvedValueOnce({ id: 99 });

    const token = signToken("acme");
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `dashboard_token=${token}` },
      body: JSON.stringify({
        clientId: "1",
        slug: "acme",
        selectedTerms: ["negative term", "waste spend"],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);

    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "negative-keyword-lists",
        data: expect.objectContaining({
          client: 1,
          name: "Deep Dive Selections",
          scope: "account",
          source: "deep_dive",
          isActive: true,
          keywords: expect.arrayContaining([
            expect.objectContaining({ keyword: "negative term", matchType: "exact", flaggedForRemoval: false }),
            expect.objectContaining({ keyword: "waste spend", matchType: "exact", flaggedForRemoval: false }),
          ]),
        }),
      })
    );
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("updates the existing deep-dive list, replacing keywords", async () => {
    vi.mocked(mockPayload.find).mockResolvedValueOnce({
      docs: [{ id: 7, keywords: [{ keyword: "old1" }, { keyword: "old2" }] }],
    });
    vi.mocked(mockPayload.update).mockResolvedValueOnce({ id: 7 });

    const token = signToken("acme");
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `dashboard_token=${token}` },
      body: JSON.stringify({
        clientId: "1",
        slug: "acme",
        selectedTerms: ["fresh1", "fresh2", "fresh3"],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.count).toBe(3);

    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "negative-keyword-lists",
        id: 7,
        data: expect.objectContaining({
          keywords: [
            { keyword: "fresh1", matchType: "exact", flaggedForRemoval: false },
            { keyword: "fresh2", matchType: "exact", flaggedForRemoval: false },
            { keyword: "fresh3", matchType: "exact", flaggedForRemoval: false },
          ],
        }),
      })
    );
    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("deduplicates within the submitted batch (case + whitespace insensitive)", async () => {
    vi.mocked(mockPayload.find).mockResolvedValueOnce({ docs: [] });
    vi.mocked(mockPayload.create).mockResolvedValueOnce({ id: 99 });

    const token = signToken("acme");
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `dashboard_token=${token}` },
      body: JSON.stringify({
        clientId: "1",
        slug: "acme",
        selectedTerms: ["foo bar", " Foo Bar ", "foo bar", "unique"],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.count).toBe(2);
    const keywords = mockPayload.create.mock.calls[0][0].data.keywords;
    expect(keywords).toHaveLength(2);
    expect(keywords.map((k: { keyword: string }) => k.keyword)).toEqual(["foo bar", "unique"]);
  });

  it("scopes find-or-create to the correct client AND source=deep_dive", async () => {
    vi.mocked(mockPayload.find).mockResolvedValueOnce({ docs: [] });
    vi.mocked(mockPayload.create).mockResolvedValueOnce({ id: 99 });

    const token = signToken("acme");
    const req = new NextRequest("http://localhost:3001/api/dashboard/keyword-selections", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `dashboard_token=${token}` },
      body: JSON.stringify({
        clientId: "42",
        slug: "acme",
        selectedTerms: ["x"],
      }),
    });
    await POST(req);

    expect(mockPayload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "negative-keyword-lists",
        where: expect.objectContaining({
          and: expect.arrayContaining([
            { client: { equals: "42" } },
            { source: { equals: "deep_dive" } },
          ]),
        }),
      })
    );
  });
});
