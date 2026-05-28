import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const afterCallbacks: Array<() => Promise<void> | void> = [];

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => Promise<void> | void) => {
      afterCallbacks.push(callback);
    },
  };
});

const mockCheckPinWithLockout = vi.fn();
vi.mock("@/lib/pin-auth", () => ({
  checkPinWithLockout: (...args: unknown[]) => mockCheckPinWithLockout(...args),
}));

vi.mock("@/lib/screenshots", () => ({
  captureAndUploadScreenshot: vi.fn(async () => "https://blob.test/screenshot.png"),
}));

vi.mock("@/lib/scrapling-service", () => ({
  checkMetaAdsViaScrapling: vi.fn(async () => ({ hasMetaAds: false, ads: [] })),
  extractSocialLinks: vi.fn(async () => ({ facebook: null, instagram: null, linkedin: null })),
}));

vi.mock("@/lib/blob-upload", () => ({
  uploadScreenshotToBlob: vi.fn(async () => "https://blob.test/uploaded.png"),
}));

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runAfterCallbacks(): Promise<void> {
  const callbacks = afterCallbacks.splice(0);
  await Promise.all(callbacks.map((callback) => callback()));
}

describe("critical agency flows — E2E route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    process.env.GROWTH_TOOLS_URL = "https://growth-tools.test";
    process.env.INTERNAL_API_KEY = "internal-test-key";
  });

  it("protects partner decks with the client PIN and only grants access to configured presentations", async () => {
    const { POST } = await import("@/app/(frontend)/api/audit-auth/route");
    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 42,
          clientPin: "1234",
          presentations: [{ deckSlug: "google-ads-audit" }],
        },
      ],
    });
    mockCheckPinWithLockout.mockResolvedValueOnce({ ok: true });

    const res = await POST(
      jsonRequest("http://localhost/api/audit-auth", {
        slug: "acme/google-ads-audit",
        password: "1234",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockPayload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "clients",
        where: { slug: { equals: "acme" } },
        select: { clientPin: true, presentations: true },
      }),
    );
    expect(mockCheckPinWithLockout).toHaveBeenCalledWith(
      "audit-auth:acme/google-ads-audit",
      "1234",
      "1234",
    );
  });

  it("burns a PIN attempt without revealing whether an unconfigured partner deck exists", async () => {
    const { POST } = await import("@/app/(frontend)/api/audit-auth/route");
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 42, clientPin: "1234", presentations: [{ deckSlug: "safe-deck" }] }],
    });
    mockCheckPinWithLockout.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "Incorrect PIN",
    });

    const res = await POST(
      jsonRequest("http://localhost/api/audit-auth", {
        slug: "acme/secret-deck",
        password: "0000",
      }),
    );

    expect(res.status).toBe(401);
    expect(mockCheckPinWithLockout).toHaveBeenCalledWith(
      "audit-auth:acme/secret-deck",
      "0000",
      "",
    );
  });

  it("starts the proposal audit pipeline, fans out to growth tools, persists records, and links them back", async () => {
    const { POST } = await import("@/app/(frontend)/api/proposals/[id]/run-audits/route");
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: "admin" } });
    mockPayload.findByID.mockResolvedValue({
      id: 99,
      websiteUrl: "https://example.com",
      businessType: "Dental clinic",
      conversionGoal: "bookings",
      targetLocation: "au:Sydney",
      keywordCategories: [{ categoryName: "Core", keywords: "dentist sydney\nteeth whitening" }],
      competitors: [],
    });
    let nextId = 1000;
    mockPayload.create.mockImplementation(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => ({
      id: ++nextId,
      collection,
      ...data,
    }));
    mockPayload.update.mockResolvedValue({});

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/seo-audits")) {
        return Response.json({ websiteUrl: "https://example.com", businessType: "Dental clinic", overallScore: 82 });
      }
      if (url.endsWith("/api/audits")) {
        return Response.json({ websiteUrl: "https://example.com", conversionGoal: "bookings", overallScore: 76 });
      }
      if (url.endsWith("/api/track-keywords")) {
        return Response.json({ keywords: [{ keyword: "dentist sydney", position: 4, search_volume: 900, opportunity: "high" }] });
      }
      if (url.endsWith("/api/competitor-analysis")) {
        return Response.json({ yourProfile: { domain: "example.com" }, competitors: [] });
      }
      if (url.endsWith("/api/content-research")) {
        return Response.json({ keyword: "dentist sydney", ideas: ["Implants guide"] });
      }
      if (url.endsWith("/api/traffic")) {
        return Response.json({ averageMonthlyVisits: 1200 });
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      new NextRequest("http://localhost/api/proposals/99/run-audits", { method: "POST" }),
      { params: Promise.resolve({ id: "99" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, status: "running" });
    await runAfterCallbacks();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://growth-tools.test/api/seo-audits",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({ collection: "seo-audits" }));
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({ collection: "cro-audits" }));
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({ collection: "keyword-snapshots" }));
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({ collection: "competitor-analyses" }));
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({ collection: "content-researches" }));
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "client-proposals",
        id: "99",
        data: expect.objectContaining({ auditStatus: "completed", auditCompletedAt: expect.any(String) }),
      }),
    );
  });

  it("rejects proposal audit runs for missing users, unknown proposals, and incomplete proposal inputs", async () => {
    const { POST } = await import("@/app/(frontend)/api/proposals/[id]/run-audits/route");

    mockPayload.auth.mockResolvedValueOnce({ user: null });
    const unauthorized = await POST(
      new NextRequest("http://localhost/api/proposals/99/run-audits", { method: "POST" }),
      { params: Promise.resolve({ id: "99" }) },
    );
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({ error: "Unauthorized" });

    mockPayload.auth.mockResolvedValueOnce({ user: { id: 1, role: "admin" } });
    mockPayload.findByID.mockRejectedValueOnce(new Error("not found"));
    const notFound = await POST(
      new NextRequest("http://localhost/api/proposals/not-a-real-id/run-audits", { method: "POST" }),
      { params: Promise.resolve({ id: "not-a-real-id" }) },
    );
    expect(notFound.status).toBe(404);
    await expect(notFound.json()).resolves.toEqual({ error: "Proposal not found", detail: "not found" });

    mockPayload.auth.mockResolvedValueOnce({ user: { id: 1, role: "admin" } });
    mockPayload.findByID.mockResolvedValueOnce({
      id: 100,
      websiteUrl: "https://example.com",
      businessType: "Dental clinic",
      keywords: "   ",
    });
    const incomplete = await POST(
      new NextRequest("http://localhost/api/proposals/100/run-audits", { method: "POST" }),
      { params: Promise.resolve({ id: "100" }) },
    );
    expect(incomplete.status).toBe(400);
    await expect(incomplete.json()).resolves.toEqual({
      error: "Missing required fields: websiteUrl, businessType, keywords",
    });
    expect(afterCallbacks).toHaveLength(0);
  });

  it("marks proposal audit runs failed when all Growth Tools calls fail", async () => {
    const { POST } = await import("@/app/(frontend)/api/proposals/[id]/run-audits/route");
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: "admin" } });
    mockPayload.findByID.mockResolvedValue({
      id: 101,
      websiteUrl: "https://example.com",
      businessType: "Dental clinic",
      conversionGoal: "bookings",
      targetLocation: "au:Sydney",
      keywords: "dentist sydney",
      competitors: [],
    });
    mockPayload.update.mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "upstream down" }, { status: 503 })));

    const res = await POST(
      new NextRequest("http://localhost/api/proposals/101/run-audits", { method: "POST" }),
      { params: Promise.resolve({ id: "101" }) },
    );

    expect(res.status).toBe(200);
    await runAfterCallbacks();
    expect(mockPayload.create).not.toHaveBeenCalled();
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "client-proposals",
        id: "101",
        data: expect.objectContaining({
          auditStatus: "failed",
          auditProgress: "Failed|100",
          auditCompletedAt: expect.any(String),
          auditError: expect.stringContaining("SEO audit failed: 503"),
        }),
      }),
    );
  });

  it("triggers Google Ads audits, normalizes inputs, and persists running-to-completed transitions", async () => {
    const { POST } = await import("@/app/(frontend)/api/google-ads-audits/[id]/run-audit/route");
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: "admin" } });
    mockPayload.findByID.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === "clients") return { id: 7, brandKeywords: "Acme\nAcme Dental" };
      return {
        id: 222,
        customerId: "123-456-7890",
        businessName: "Acme Dental",
        monthlySpend: 5000,
        conversionObjectives: "Calls\nForms",
        client: 7,
        actionItems: [],
      };
    });
    mockPayload.update.mockResolvedValue({});
    const fetchMock = vi.fn(async () => Response.json({
      raw: { account: "raw" },
      scored: {
        overallScore: 88,
        steps: [{ step: 1, name: "Tracking", score: 90, findings: ["Good"], recommendations: ["Improve"] }],
        quickWins: ["Add negatives"],
      },
      emailHtml: "<p>Audit</p>",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      new NextRequest("http://localhost/api/google-ads-audits/222/run-audit", { method: "POST" }),
      { params: Promise.resolve({ id: "222" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, status: "running" });
    await runAfterCallbacks();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://growth-tools.test/api/google-ads/comprehensive-audit",
      expect.objectContaining({ method: "POST" }),
    );
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toEqual(expect.objectContaining({
      customerId: "1234567890",
      brandTerms: ["Acme", "Acme Dental"],
      conversionObjectives: ["Calls", "Forms"],
      monthlySpend: 5000,
    }));
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "google-ads-audits",
        id: "222",
        data: expect.objectContaining({ auditStatus: "running", auditProgress: "Starting audit|0" }),
      }),
    );
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "google-ads-audits",
        id: "222",
        data: expect.objectContaining({
          rawData: { account: "raw" },
          overallScore: 88,
          auditProgress: "Storing results|90",
        }),
      }),
    );
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "google-ads-audits",
        id: "222",
        data: expect.objectContaining({
          auditStatus: "completed",
          auditProgress: "Complete|100",
          auditCompletedAt: expect.any(String),
        }),
      }),
    );
  });

  it("rejects invalid Google Ads audit triggers and marks upstream failures on the audit", async () => {
    const { POST } = await import("@/app/(frontend)/api/google-ads-audits/[id]/run-audit/route");

    mockPayload.auth.mockResolvedValueOnce({ user: { id: 1, role: "admin" } });
    mockPayload.findByID.mockRejectedValueOnce(new Error("missing"));
    const missing = await POST(
      new NextRequest("http://localhost/api/google-ads-audits/missing/run-audit", { method: "POST" }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(missing.status).toBe(404);

    mockPayload.auth.mockResolvedValueOnce({ user: { id: 1, role: "admin" } });
    mockPayload.findByID.mockResolvedValueOnce({ id: 223, customerId: "" });
    const invalid = await POST(
      new NextRequest("http://localhost/api/google-ads-audits/223/run-audit", { method: "POST" }),
      { params: Promise.resolve({ id: "223" }) },
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "Missing required field: customerId" });

    mockPayload.auth.mockResolvedValueOnce({ user: { id: 1, role: "admin" } });
    mockPayload.findByID.mockResolvedValueOnce({
      id: 224,
      customerId: "123-456-7890",
      actionItems: [],
    });
    mockPayload.update.mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));
    const upstreamFailure = await POST(
      new NextRequest("http://localhost/api/google-ads-audits/224/run-audit", { method: "POST" }),
      { params: Promise.resolve({ id: "224" }) },
    );
    expect(upstreamFailure.status).toBe(200);
    await runAfterCallbacks();
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "google-ads-audits",
        id: "224",
        data: expect.objectContaining({
          auditStatus: "failed",
          auditProgress: "Failed|100",
          auditError: "Growth tools audit failed (502): bad gateway",
        }),
      }),
    );
  });
});
