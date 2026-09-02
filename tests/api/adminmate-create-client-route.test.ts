import { beforeEach, describe, expect, it, vi } from "vitest";

const payload = { auth: vi.fn(), find: vi.fn(), create: vi.fn() };
vi.mock("payload", () => ({
  getPayload: vi.fn(async () => payload),
  createLocalReq: vi.fn(async ({ user }: { user: unknown }) => ({ user })),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

const staged = {
  name: "Acme Corp",
  slug: "acme-corp",
  websiteUrl: "https://acmecorp.com",
  services: ["google_ads", "seo"],
  contactName: "Jane Doe",
  contactEmail: "jane@acme.com",
  monthlyRetainer: 2000,
  isActive: true,
  notes: "VIP — invoice via accounts@",
};
const request = (body: unknown = staged) => new Request("http://localhost/api/optimate/adminmate/create-client", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("AdminMate create-client route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    payload.auth.mockResolvedValue({ user: { id: 7, role: "admin" } });
    payload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    payload.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 11, ...data }));
  });

  it("denies unauthenticated and non-admin users", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/create-client/route");
    payload.auth.mockResolvedValueOnce({ user: null });
    expect((await POST(request())).status).toBe(401);
    payload.auth.mockResolvedValueOnce({ user: { id: 2, role: "staff" } });
    expect((await POST(request())).status).toBe(403);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid staged client before writing", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/create-client/route");
    expect((await POST(request({ slug: "acme" }))).status).toBe(400);
    expect((await POST(request({ ...staged, services: ["hacking"] }))).status).toBe(400);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("reports a slug conflict instead of creating a duplicate", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/create-client/route");
    payload.find.mockResolvedValueOnce({ totalDocs: 1, docs: [{ name: "Acme Corp" }] });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("creates the client with only allowlisted fields", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/create-client/route");
    const response = await POST(request({ ...staged, clientPin: "1234", ga4RefreshToken: "secret", isAgency: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 11, slug: "acme-corp" });
    const data = payload.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ name: "Acme Corp", slug: "acme-corp", monthlyRetainer: 2000, isActive: true, clientPulse: { notes: "VIP — invoice via accounts@" } });
    expect(data.clientPin).toBeUndefined();
    expect(data.ga4RefreshToken).toBeUndefined();
    expect(data.isAgency).toBeUndefined();
  });
});
