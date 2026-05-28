import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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

const mockCheckPinWithLockout = vi.fn();
vi.mock("@/lib/pin-auth", () => ({
  checkPinWithLockout: (...args: unknown[]) => mockCheckPinWithLockout(...args),
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async () => ({ url: "https://blob.test/signed.pdf" })),
}));

vi.mock("@/lib/contract-pdf", () => ({
  generateContractPdf: vi.fn(async () => Buffer.from("pdf")),
}));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(async () => undefined),
}));

vi.mock("@/lib/contract-email", () => ({
  generateCompletionEmail: vi.fn(() => "<p>complete</p>"),
}));

vi.mock("@/lib/contract-to-client-sync", () => ({
  syncContractToClient: vi.fn(async () => undefined),
}));

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("public PIN/token auth regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BREVO_API_KEY;
  });

  it("rejects client hub invalid PIN without returning audit data", async () => {
    const { POST } = await import("@/app/(frontend)/api/client-hub/verify/route");
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: 1, name: "Acme", slug: "acme", clientPin: "1234" }] })
      .mockResolvedValueOnce({ docs: [{ id: 2, businessName: "Prospect", proposalPin: "5678" }] });
    mockCheckPinWithLockout.mockResolvedValueOnce({ ok: false, status: 401, message: "Incorrect PIN" });

    const res = await POST(jsonRequest("http://localhost/api/client-hub/verify", { pin: "0000" }, { "x-forwarded-for": "1.2.3.4" }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "Incorrect PIN" });
    expect(mockCheckPinWithLockout).toHaveBeenCalledWith("client-hub:1.2.3.4", "0000", "");
    expect(mockPayload.find).toHaveBeenCalledTimes(2);
  });

  it("returns safe client hub data for valid client PIN and strips sensitive audit fields", async () => {
    const { POST } = await import("@/app/(frontend)/api/client-hub/verify/route");
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: 1, name: "Acme", slug: "acme", clientPin: "1234", googleAdsCustomerId: "111" }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ id: 10, title: "SEO", reportPassword: "secret", customerEmail: "lead@test", visitorIp: "ip", visitorFingerprint: "fp" }] })
      .mockResolvedValueOnce({ docs: [{ id: 11, customerEmail: "lead@test", visitorIp: "ip", visitorFingerprint: "fp", score: 80 }] })
      .mockResolvedValueOnce({ docs: [{ id: 12, keyword: "seo" }] })
      .mockResolvedValueOnce({ docs: [{ slug: "gads", presentationPin: "9999", businessName: "Acme", overallScore: 90, createdAt: "2026-01-01" }] });
    mockCheckPinWithLockout.mockResolvedValueOnce({ ok: true });

    const res = await POST(jsonRequest("http://localhost/api/client-hub/verify", { pin: "1234" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.audit).not.toHaveProperty("reportPassword");
    expect(json.audit).not.toHaveProperty("customerEmail");
    expect(json.audit).not.toHaveProperty("visitorIp");
    expect(json.croAudit).not.toHaveProperty("visitorFingerprint");
    expect(json.googleAdsDashboard).toEqual({ slug: "acme", url: "/google-dashboard/acme" });
  });

  it("maps client hub lockout to 429 before returning matched audit data", async () => {
    const { POST } = await import("@/app/(frontend)/api/client-hub/verify/route");
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: 1, name: "Acme", clientPin: "1234" }] })
      .mockResolvedValueOnce({ docs: [] });
    mockCheckPinWithLockout.mockResolvedValueOnce({ ok: false, status: 429, message: "Too many incorrect attempts" });

    const res = await POST(jsonRequest("http://localhost/api/client-hub/verify", { pin: "1234" }));

    expect(res.status).toBe(429);
    expect(mockPayload.find).toHaveBeenCalledTimes(2);
  });

  it("rejects negative keyword build with invalid PIN and does not leak NLB data", async () => {
    const { GET } = await import("@/app/(frontend)/api/negative-keyword-build/route");
    mockPayload.find.mockResolvedValueOnce({ docs: [{ id: 7, slug: "audit", presentationPin: "1234", negativeListBuilderPublished: true, negativeListBuilder: { totalWasteIdentified: 999 } }] });
    mockCheckPinWithLockout.mockResolvedValueOnce({ ok: false, status: 401, message: "Incorrect PIN" });

    const res = await GET(new NextRequest("http://localhost/api/negative-keyword-build?slug=audit&pin=0000"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Incorrect PIN" });
    expect(JSON.stringify(json)).not.toContain("totalWasteIdentified");
    expect(mockPayload.find).toHaveBeenCalledTimes(1);
  });

  it("returns filtered negative keyword build data for a valid PIN", async () => {
    const { GET } = await import("@/app/(frontend)/api/negative-keyword-build/route");
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: 7, slug: "audit", businessName: "Acme", presentationPin: "1234", negativeListBuilderPublished: true, client: 1, negativeListBuilder: { status: "ready", universalNegatives: [{ name: "Jobs", keywords: [{ keyword: "free" }, { keyword: "removed", removed: true }] }], accountWideNegatives: [], campaignSpecificNegatives: [{ campaignName: "Brand", keywords: [{ keyword: "cheap" }, { keyword: "old", removed: true }] }] } }] })
      .mockResolvedValueOnce({ docs: [{ name: "Existing", scope: "account", campaigns: [], keywords: [{ keyword: "x", matchType: "exact", internalId: "hidden" }], isActive: true }] });
    mockCheckPinWithLockout.mockResolvedValueOnce({ ok: true });

    const res = await GET(new NextRequest("http://localhost/api/negative-keyword-build?slug=audit&pin=1234"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.accountWideKeywords).toHaveLength(1);
    expect(json.campaignSpecificKeywords[0].keywords).toEqual([{ keyword: "cheap" }]);
    expect(json.existingNegativeKeywordLists[0].keywords).toEqual([{ keyword: "x", matchType: "exact" }]);
  });

  it("rejects invalid contractor portal tokens", async () => {
    const { GET } = await import("@/app/(frontend)/api/contractor/[token]/route");

    const res = await GET(new NextRequest("http://localhost/api/contractor/short"), { params: Promise.resolve({ token: "short" }) });

    expect(res.status).toBe(401);
    expect(mockPayload.find).not.toHaveBeenCalled();
  });

  it("returns contractor portal rows without money fields for a valid token", async () => {
    const { GET } = await import("@/app/(frontend)/api/contractor/[token]/route");
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: 5, name: "Sam", isActive: true, defaultWeeklyHours: 16, hourlyRate: 200 }] })
      .mockResolvedValueOnce({ docs: [{ weekCommencing: "2026-05-25", hours: 8, status: "draft", notes: "done", amount: 1600 }] });

    const res = await GET(new NextRequest("http://localhost/api/contractor/abcdefghijklmnop?weeks=1"), { params: Promise.resolve({ token: "abcdefghijklmnop" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(JSON.stringify(json)).not.toContain("hourlyRate");
    expect(JSON.stringify(json)).not.toContain("amount");
    expect(json.contractor).toEqual({ name: "Sam", defaultWeeklyHours: 16 });
  });

  it("rejects invalid contract signing tokens without contract data", async () => {
    const { GET } = await import("@/app/(frontend)/api/contracts/sign/[token]/route");
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 0, docs: [] });

    const res = await GET(new NextRequest("http://localhost/api/contracts/sign/bad"), { params: Promise.resolve({ token: "bad" }) });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Invalid or expired signing link" });
  });

  it("returns contract signing data for a valid sent token without CC email leakage", async () => {
    const { GET } = await import("@/app/(frontend)/api/contracts/sign/[token]/route");
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 1, docs: [{ status: "sent", contractTitle: "Agreement", clientName: "Acme", clientEmail: "signer@test.com, cc@test.com", scopeOfWork: { root: { children: [{ type: "paragraph", children: [{ text: "Work" }] }] } } }] });

    const res = await GET(new NextRequest("http://localhost/api/contracts/sign/good"), { params: Promise.resolve({ token: "good" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.contractTitle).toBe("Agreement");
    expect(json.clientEmail).toBe("signer@test.com");
    expect(JSON.stringify(json)).not.toContain("cc@test.com");
  });
});
