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
});
