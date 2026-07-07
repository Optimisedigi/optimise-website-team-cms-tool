import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

function getRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/contractor-time-entries/grid");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return new NextRequest(url, { method: "GET" });
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/contractor-time-entries/grid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/contractor-time-entries/grid", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ownUser = { id: 42, role: "specialist", name: "Sam Specialist", email: "sam@example.com" };
const adminUser = { id: 1, role: "admin", name: "Admin", email: "admin@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("contractor time entries grid RBAC", () => {
  it("GET scopes non-admin users to their own entries and returns only themselves as selectable user", async () => {
    const { GET } = await import("@/app/(frontend)/api/contractor-time-entries/grid/route");
    mockPayload.auth.mockResolvedValue({ user: ownUser });
    mockPayload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 10,
            user: 42,
            weekCommencing: "2026-07-06T00:00:00.000Z",
            hours: 8,
            status: "draft",
            clientAllocations: [{ client: 5, hours: 8 }],
          },
        ],
      })
      .mockResolvedValueOnce({ docs: [{ id: 5, name: "Acme", isActive: true }] })
      .mockResolvedValueOnce({ docs: [ownUser] });

    const res = await GET(getRequest({ month: "2026-07", user: "999" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.entries).toEqual([
      expect.objectContaining({ id: 10, user: 42 }),
    ]);
    expect(body.users).toEqual([{ id: 42, name: "Sam Specialist", email: "sam@example.com" }]);
    expect(mockPayload.find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: "contractor-time-entries",
        where: {
          and: expect.arrayContaining([{ user: { equals: 42 } }]),
        },
        overrideAccess: true,
      }),
    );
  });

  it("POST forces non-admin-created rows onto the authenticated user", async () => {
    const { POST } = await import("@/app/(frontend)/api/contractor-time-entries/grid/route");
    mockPayload.auth.mockResolvedValue({ user: ownUser });
    mockPayload.create.mockResolvedValue({
      id: 11,
      user: 42,
      weekCommencing: "2026-07-06T00:00:00.000Z",
      hours: 4,
      status: "draft",
      clientAllocations: [],
    });

    const res = await POST(postRequest({ user: 999, weekCommencing: "2026-07-06", hours: 4 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.entry.user).toBe(42);
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "contractor-time-entries",
        data: expect.objectContaining({ user: 42, hours: 4 }),
        overrideAccess: true,
      }),
    );
  });

  it("PATCH blocks non-admin users from editing another user's row", async () => {
    const { PATCH } = await import("@/app/(frontend)/api/contractor-time-entries/grid/route");
    mockPayload.auth.mockResolvedValue({ user: ownUser });
    mockPayload.findByID.mockResolvedValue({ id: 99, user: 777, status: "draft" });

    const res = await PATCH(patchRequest({ id: 99, hours: 12 }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("GET lets admins see all rows and select users who have logged time", async () => {
    const { GET } = await import("@/app/(frontend)/api/contractor-time-entries/grid/route");
    mockPayload.auth.mockResolvedValue({ user: adminUser });
    mockPayload.find
      .mockResolvedValueOnce({
        docs: [
          { id: 20, user: 42, weekCommencing: "2026-07-06T00:00:00.000Z", hours: 2, status: "draft", clientAllocations: [] },
          { id: 21, user: 77, weekCommencing: "2026-07-13T00:00:00.000Z", hours: 3, status: "draft", clientAllocations: [] },
        ],
      })
      .mockResolvedValueOnce({ docs: [{ id: 5, name: "Acme", isActive: true }] })
      .mockResolvedValueOnce({ docs: [{ user: 42 }, { user: 77 }, { user: 42 }] })
      .mockResolvedValueOnce({
        docs: [
          { id: 42, name: "Sam Specialist", email: "sam@example.com" },
          { id: 77, name: "Mia Manager", email: "mia@example.com" },
        ],
      });

    const res = await GET(getRequest({ month: "2026-07" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.isAdmin).toBe(true);
    expect(body.entries.map((entry: any) => entry.user)).toEqual([42, 77]);
    expect(body.users).toEqual([
      { id: 42, name: "Sam Specialist", email: "sam@example.com" },
      { id: 77, name: "Mia Manager", email: "mia@example.com" },
    ]);
    expect(mockPayload.find).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        collection: "contractor-time-entries",
        where: { user: { exists: true } },
        select: { user: true },
        overrideAccess: true,
      }),
    );
    expect(mockPayload.find).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        collection: "users",
        where: { id: { in: ["42", "77"] } },
        overrideAccess: true,
      }),
    );
  });
});
