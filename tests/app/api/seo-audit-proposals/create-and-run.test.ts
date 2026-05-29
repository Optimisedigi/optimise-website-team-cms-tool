import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module mocks (before SUT import) ──────────────────────────────────────
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

function makeReq(body: unknown): any {
  return {
    headers: new Headers(),
    json: async () => body,
  };
}

describe("POST /api/seo-audit-proposals/create-and-run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
  });

  it("rejects unauthenticated requests", async () => {
    mockPayload.auth.mockResolvedValueOnce({ user: null });
    const { POST } = await import("@/app/(frontend)/api/seo-audit-proposals/create-and-run/route");
    const res = await POST(makeReq({ proposalId: 5 }));
    expect(res.status).toBe(401);
  });

  it("requires proposalId or clientId", async () => {
    const { POST } = await import("@/app/(frontend)/api/seo-audit-proposals/create-and-run/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("creates a record from a proposal, snapshotting inputs incl. AOV + conversion rate", async () => {
    mockPayload.findByID.mockResolvedValueOnce({
      id: 5,
      websiteUrl: "https://acme.com/",
      gscSiteUrl: "sc-domain:acme.com",
      businessType: "services",
      targetLocation: "au:sydney",
      averageOrderValue: 1200,
      leadConversionRate: 3, // percentage
    });
    mockPayload.find.mockResolvedValueOnce({ docs: [] }); // no existing record
    mockPayload.create.mockResolvedValueOnce({ id: 42 });

    const { POST } = await import("@/app/(frontend)/api/seo-audit-proposals/create-and-run/route");
    const res = await POST(makeReq({ proposalId: 5 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.id).toBe(42);
    expect(mockPayload.create).toHaveBeenCalledOnce();
    const createArg = mockPayload.create.mock.calls[0][0];
    expect(createArg.collection).toBe("seo-audit-proposals");
    expect(createArg.data).toMatchObject({
      proposal: 5,
      websiteUrl: "https://acme.com/",
      gscSiteUrl: "sc-domain:acme.com",
      businessType: "services",
      location: "au:sydney",
      averageOrderValue: 1200,
      conversionRate: 3,
      status: "pending",
    });
  });

  it("reuses an existing record for the same proposal instead of creating", async () => {
    mockPayload.findByID.mockResolvedValueOnce({
      id: 5,
      websiteUrl: "https://acme.com/",
      gscSiteUrl: "sc-domain:acme.com",
    });
    mockPayload.find.mockResolvedValueOnce({ docs: [{ id: 99 }] });
    mockPayload.update.mockResolvedValueOnce({ id: 99 });

    const { POST } = await import("@/app/(frontend)/api/seo-audit-proposals/create-and-run/route");
    const res = await POST(makeReq({ proposalId: 5 }));
    const json = await res.json();

    expect(json.id).toBe(99);
    expect(mockPayload.create).not.toHaveBeenCalled();
    expect(mockPayload.update).toHaveBeenCalledOnce();
  });

  it("pulls brand keywords from a client when run in client mode", async () => {
    mockPayload.findByID.mockResolvedValueOnce({
      id: 7,
      websiteUrl: "https://swanson.com/",
      gscSiteUrl: "https://swanson.com/",
      businessType: "trades",
      brandKeywords: "swanson\nswanson industries",
      averageOrderValue: 5000,
      leadConversionRate: 2.5,
    });
    mockPayload.find.mockResolvedValueOnce({ docs: [] });
    mockPayload.create.mockResolvedValueOnce({ id: 50 });

    const { POST } = await import("@/app/(frontend)/api/seo-audit-proposals/create-and-run/route");
    const res = await POST(makeReq({ clientId: 7 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.id).toBe(50);
    const createArg = mockPayload.create.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      client: 7,
      brandKeywords: "swanson\nswanson industries",
      averageOrderValue: 5000,
      conversionRate: 2.5,
    });
  });

  it("rejects when the source doc lacks website or GSC", async () => {
    mockPayload.findByID.mockResolvedValueOnce({ id: 5, websiteUrl: "https://acme.com/" }); // no gscSiteUrl
    const { POST } = await import("@/app/(frontend)/api/seo-audit-proposals/create-and-run/route");
    const res = await POST(makeReq({ proposalId: 5 }));
    expect(res.status).toBe(400);
  });
});
