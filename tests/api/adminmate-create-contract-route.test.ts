import { beforeEach, describe, expect, it, vi } from "vitest";

const payload = { auth: vi.fn(), find: vi.fn(), findByID: vi.fn(), create: vi.fn() };
vi.mock("payload", () => ({
  getPayload: vi.fn(async () => payload),
  createLocalReq: vi.fn(async ({ user }: { user: unknown }) => ({ user })),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

const template = {
  id: 10,
  isTemplate: true,
  contractTitle: "Google Ads Management Agreement",
  scopeOfWork: { root: { children: [] } },
  monthlyRetainer: 1500,
  currency: "AUD",
  agencySignerName: "Peter Tu",
};
const staged = {
  templateId: "10",
  clientId: "1",
  contractTitle: "Google Ads - Acme Corp",
  clientName: "Acme Corp",
  clientContactName: "Jane Doe",
  clientEmail: "jane@acme.com",
  clientBusinessAddress: "1 Main St, Sydney",
  contractDate: "2026-09-16",
  contractStartDate: "2026-10-01",
  monthlyRetainer: 2000,
  setupFee: 500,
};
const request = (body: unknown = staged) => new Request("http://localhost/api/optimate/adminmate/create-contract", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("AdminMate create-contract route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    payload.auth.mockResolvedValue({ user: { id: 7, role: "admin" } });
    payload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    payload.findByID.mockImplementation(async ({ collection, id }: { collection: string; id: string | number }) => {
      if (collection === "contracts" && Number(id) === 10) return template;
      if (collection === "clients" && Number(id) === 1) return { id: 1, name: "Acme Corp" };
      throw new Error("not found");
    });
    payload.create.mockImplementation(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => ({ id: collection === "clients" ? 55 : 77, ...data }));
  });

  it("denies unauthenticated and non-admin users", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/create-contract/route");
    payload.auth.mockResolvedValueOnce({ user: null });
    expect((await POST(request())).status).toBe(401);
    payload.auth.mockResolvedValueOnce({ user: { id: 2, role: "staff" } });
    expect((await POST(request())).status).toBe(403);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload, a missing template, or a non-template source", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/create-contract/route");
    expect((await POST(request({ clientId: "1" }))).status).toBe(400);
    expect((await POST(request({ ...staged, templateId: "99" }))).status).toBe(404);
    payload.findByID.mockResolvedValueOnce({ ...template, isTemplate: false });
    expect((await POST(request())).status).toBe(404);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("clones the template, overlays the staged details and links the client", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/create-contract/route");
    const response = await POST(request({ ...staged, status: "completed", signingToken: "x", isTemplate: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 77, clientId: 1, adminUrl: "/admin/collections/contracts/77" });
    const call = payload.create.mock.calls[0][0] as { collection: string; data: Record<string, unknown>; overrideAccess: boolean };
    expect(call.collection).toBe("contracts");
    expect(call.overrideAccess).toBe(false);
    expect(call.data).toMatchObject({
      client: 1,
      contractTitle: "Google Ads - Acme Corp",
      clientName: "Acme Corp",
      clientEmail: "jane@acme.com",
      clientBusinessAddress: "1 Main St, Sydney",
      contractStartDate: "2026-10-01",
      monthlyRetainer: 2000,
      setupFee: 500,
      currency: "AUD",
      scopeOfWork: template.scopeOfWork,
      agencySignerName: "Peter Tu",
      status: "draft",
      isTemplate: false,
    });
    expect(call.data.signingToken).toBeUndefined();
  });

  it("creates a new client first and aborts on slug conflict", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/create-contract/route");
    const withNew = { ...staged, clientId: undefined, newClient: { name: "New Co", contactEmail: "sam@newco.com" } };
    payload.find.mockResolvedValueOnce({ totalDocs: 1, docs: [{ name: "New Co" }] });
    expect((await POST(request(withNew))).status).toBe(409);
    expect(payload.create).not.toHaveBeenCalled();

    const response = await POST(request(withNew));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 77, clientId: 55, clientCreated: { id: 55, slug: "new-co" } });
    expect(payload.create.mock.calls[0][0].collection).toBe("clients");
    expect(payload.create.mock.calls[1][0].data.client).toBe(55);
  });
});
