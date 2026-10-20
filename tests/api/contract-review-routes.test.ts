import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const mockSendBrevoEmail = vi.fn();

vi.mock("payload", () => ({ getPayload: vi.fn(() => Promise.resolve(mockPayload)) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("@/lib/activity-log", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/brevo-email", () => ({ sendBrevoEmail: (...args: unknown[]) => mockSendBrevoEmail(...args) }));

const TOKEN = "b".repeat(64);
const staff = { id: 3, role: "specialist", featureAccess: ["contracts"], permissionProfiles: [] };

function contract(overrides: Record<string, unknown> = {}) {
  return {
    id: 16,
    status: "draft",
    contractTitle: "Growth Agreement",
    clientName: "Acme Pty Ltd",
    clientEmail: "signer@example.com",
    contractDate: "2026-10-20",
    accountManagerName: "Grace Hopper",
    accountManagerEmail: "grace@acme.test",
    agencyContactName: "Peter Tu",
    agencyContactEmail: "peter@optimisedigital.online",
    reviewToken: TOKEN,
    reviewTokenExpiresAt: "2999-01-01T00:00:00.000Z",
    deletedAt: null,
    isTemplate: false,
    ...overrides,
  };
}

function req(url: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
}

const tokenParams = (token = TOKEN) => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockSendBrevoEmail.mockResolvedValue({ ok: true });
});

describe("POST /api/contracts/[id]/review-link", () => {
  const load = () => import("@/app/(frontend)/api/contracts/[id]/review-link/route");
  const params = { params: Promise.resolve({ id: "16" }) };

  it("rejects anonymous users and users without Contracts access", async () => {
    const { POST } = await load();
    mockPayload.auth.mockResolvedValueOnce({ user: null });
    expect((await POST(req("/api/contracts/16/review-link", "POST", {}), params)).status).toBe(401);

    mockPayload.auth.mockResolvedValueOnce({ user: { id: 4, role: "specialist", featureAccess: ["blog-posts"] } });
    expect((await POST(req("/api/contracts/16/review-link", "POST", {}), params)).status).toBe(403);
    expect(mockPayload.findByID).not.toHaveBeenCalled();
  });

  it("refuses contracts that are no longer drafts", async () => {
    const { POST } = await load();
    mockPayload.auth.mockResolvedValue({ user: staff });
    mockPayload.findByID.mockResolvedValue(contract({ status: "sent" }));
    const res = await POST(req("/api/contracts/16/review-link", "POST", {}), params);
    expect(res.status).toBe(400);
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("reuses a live link when emailing, and sends it to the account manager", async () => {
    const { POST } = await load();
    mockPayload.auth.mockResolvedValue({ user: staff });
    mockPayload.findByID.mockResolvedValue(contract());
    const res = await POST(req("/api/contracts/16/review-link", "POST", { email: true }), params);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.reviewUrl).toMatch(new RegExp(`/contracts/review/${TOKEN}$`));
    expect(json.sentTo).toBe("grace@acme.test");
    expect(mockPayload.update.mock.calls[0]?.[0].data.reviewToken).toBe(TOKEN);
    expect(mockSendBrevoEmail.mock.calls[0]?.[0].to).toEqual([{ email: "grace@acme.test", name: "Grace Hopper" }]);
  });

  it("issues a fresh 256-bit token when regenerating", async () => {
    const { POST } = await load();
    mockPayload.auth.mockResolvedValue({ user: staff });
    mockPayload.findByID.mockResolvedValue(contract());
    await POST(req("/api/contracts/16/review-link", "POST", { regenerate: true }), params);
    const newToken = mockPayload.update.mock.calls[0]?.[0].data.reviewToken;
    expect(newToken).toMatch(/^[a-f0-9]{64}$/);
    expect(newToken).not.toBe(TOKEN);
    expect(mockSendBrevoEmail).not.toHaveBeenCalled();
  });

  it("requires a saved account manager email before emailing", async () => {
    const { POST } = await load();
    mockPayload.auth.mockResolvedValue({ user: staff });
    mockPayload.findByID.mockResolvedValue(contract({ accountManagerEmail: "" }));
    const res = await POST(req("/api/contracts/16/review-link", "POST", { email: true }), params);
    expect(res.status).toBe(400);
    expect(mockSendBrevoEmail).not.toHaveBeenCalled();
  });
});

describe("GET /api/contracts/review/[token]", () => {
  const load = () => import("@/app/(frontend)/api/contracts/review/[token]/route");

  it("rejects malformed tokens without querying the database", async () => {
    const { GET } = await load();
    const res = await GET(req("/api/contracts/review/x"), tokenParams("not-a-token"));
    expect(res.status).toBe(404);
    expect(mockPayload.find).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", contract({ reviewTokenExpiresAt: "2000-01-01T00:00:00.000Z" }), 410],
    ["sent for signing", contract({ status: "sent" }), 410],
    ["trashed", contract({ deletedAt: "2026-10-01T00:00:00.000Z" }), 404],
  ])("closes review when the contract is %s", async (_label, doc, status) => {
    const { GET } = await load();
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 1, docs: [doc] });
    const res = await GET(req(`/api/contracts/review/${TOKEN}`), tokenParams());
    expect(res.status).toBe(status);
  });

  it("returns the draft and its comments without internal fields", async () => {
    const { GET } = await load();
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 1, docs: [contract()] })
      .mockResolvedValueOnce({
        docs: [{ id: 1, contract: 16, quote: "14 days", occurrence: 0, section: "Payment Terms", comment: "30?", emailedAt: null, resolved: true, createdAt: "2026-10-20T01:00:00.000Z" }],
      });
    const res = await GET(req(`/api/contracts/review/${TOKEN}`), tokenParams());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.contract.contractTitle).toBe("Growth Agreement");
    expect(json.contract).not.toHaveProperty("reviewToken");
    expect(json.comments).toEqual([
      { id: "1", quote: "14 days", occurrence: 0, section: "Payment Terms", comment: "30?", createdAt: "2026-10-20T01:00:00.000Z", sent: false },
    ]);
  });
});

describe("POST /api/contracts/review/[token]/comments", () => {
  const load = () => import("@/app/(frontend)/api/contracts/review/[token]/comments/route");

  it("saves a valid comment against the token's contract only", async () => {
    const { POST } = await load();
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 1, docs: [contract()] });
    mockPayload.count.mockResolvedValueOnce({ totalDocs: 0 });
    mockPayload.create.mockImplementationOnce(async ({ data }) => ({ id: 7, createdAt: "t", ...data }));
    const res = await POST(
      req(`/api/contracts/review/${TOKEN}/comments`, "POST", { quote: "14 days", comment: "30?", section: "Payment Terms", occurrence: 0, contract: 99 }),
      tokenParams(),
    );
    expect(res.status).toBe(201);
    expect(mockPayload.create.mock.calls[0]?.[0].data).toMatchObject({ contract: 16, authorName: "Grace Hopper", comment: "30?" });
  });

  it("rejects invalid input and enforces the per-contract cap", async () => {
    const { POST } = await load();
    mockPayload.find.mockResolvedValue({ totalDocs: 1, docs: [contract()] });
    expect((await POST(req(`/api/contracts/review/${TOKEN}/comments`, "POST", { quote: "", comment: "x" }), tokenParams())).status).toBe(400);

    mockPayload.count.mockResolvedValueOnce({ totalDocs: 200 });
    expect((await POST(req(`/api/contracts/review/${TOKEN}/comments`, "POST", { quote: "a", comment: "b" }), tokenParams())).status).toBe(429);
    expect(mockPayload.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/contracts/review/[token]/comments/[commentId]", () => {
  const load = () => import("@/app/(frontend)/api/contracts/review/[token]/comments/[commentId]/route");
  const params = (commentId: string) => ({ params: Promise.resolve({ token: TOKEN, commentId }) });

  it("only finds comments on the token's own contract", async () => {
    const { DELETE } = await load();
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 1, docs: [contract()] })
      .mockResolvedValueOnce({ totalDocs: 0, docs: [] });
    const res = await DELETE(req("/x", "DELETE"), params("5"));
    expect(res.status).toBe(404);
    expect(mockPayload.find.mock.calls[1]?.[0].where).toEqual({
      and: [{ id: { equals: "5" } }, { contract: { equals: 16 } }],
    });
    expect(mockPayload.delete).not.toHaveBeenCalled();
  });

  it("keeps comments that were already emailed", async () => {
    const { DELETE } = await load();
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 1, docs: [contract()] })
      .mockResolvedValueOnce({ totalDocs: 1, docs: [{ id: 5, emailedAt: "2026-10-20T00:00:00.000Z" }] });
    expect((await DELETE(req("/x", "DELETE"), params("5"))).status).toBe(409);
    expect(mockPayload.delete).not.toHaveBeenCalled();
  });
});

describe("POST /api/contracts/review/[token]/send", () => {
  const load = () => import("@/app/(frontend)/api/contracts/review/[token]/send/route");
  const pending = [
    { id: 1, quote: "14 days", section: "Payment Terms", comment: "<b>30?</b>" },
    { id: 2, quote: "Monthly", section: "Pricing", comment: "Quarterly?" },
  ];

  it("emails unsent comments to the agency contact as one summary, then marks them sent", async () => {
    const { POST } = await load();
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 1, docs: [contract()] })
      .mockResolvedValueOnce({ docs: pending });
    const res = await POST(req("/x", "POST"), tokenParams());

    expect(res.status).toBe(200);
    expect(mockSendBrevoEmail).toHaveBeenCalledTimes(1);
    const email = mockSendBrevoEmail.mock.calls[0]?.[0];
    expect(email.to).toEqual([{ email: "peter@optimisedigital.online", name: "Peter Tu" }]);
    expect(email.replyTo).toEqual({ email: "grace@acme.test", name: "Grace Hopper" });
    expect(email.htmlContent).toContain("&lt;b&gt;30?&lt;/b&gt;");
    expect(email.htmlContent).not.toContain("<b>30?</b>");
    expect(mockPayload.update.mock.calls[0]?.[0].where).toEqual({ id: { in: [1, 2] } });
  });

  it("leaves comments unsent when the email fails, so it can be retried", async () => {
    const { POST } = await load();
    mockSendBrevoEmail.mockResolvedValueOnce({ ok: false, code: "unauthorized" });
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 1, docs: [contract()] })
      .mockResolvedValueOnce({ docs: pending });
    const res = await POST(req("/x", "POST"), tokenParams());
    expect(res.status).toBe(502);
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("does nothing when there is nothing new to send", async () => {
    const { POST } = await load();
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 1, docs: [contract()] })
      .mockResolvedValueOnce({ docs: [] });
    expect((await POST(req("/x", "POST"), tokenParams())).status).toBe(400);
    expect(mockSendBrevoEmail).not.toHaveBeenCalled();
  });
});
