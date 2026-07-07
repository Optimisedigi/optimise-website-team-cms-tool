import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractorTimeEntries } from "@/collections/ContractorTimeEntries";

const mockPayload = {
  findByID: vi.fn(),
};

const mockReq = (user: any) => ({
  user,
  payload: mockPayload,
});

function accessResult(name: "read" | "create" | "update", user: any) {
  const access = ContractorTimeEntries.access?.[name];
  expect(typeof access).toBe("function");
  return (access as any)({ req: mockReq(user) });
}

function beforeChangeHook() {
  const hook = ContractorTimeEntries.hooks?.beforeChange?.[0];
  expect(typeof hook).toBe("function");
  return hook as any;
}

describe("ContractorTimeEntries access", () => {
  it("allows admins to read and update every time entry", () => {
    const admin = { id: 1, role: "admin", email: "admin@example.com" };

    expect(accessResult("read", admin)).toBe(true);
    expect(accessResult("update", admin)).toBe(true);
  });

  it("scopes non-admin reads and updates to their own user id", () => {
    const specialist = { id: 42, role: "specialist", email: "specialist@example.com" };

    expect(accessResult("read", specialist)).toEqual({ user: { equals: 42 } });
    expect(accessResult("update", specialist)).toEqual({ user: { equals: 42 } });
  });

  it("allows managers/specialists to create time entries but blocks unauthenticated users", () => {
    expect(accessResult("create", { id: 7, role: "manager" })).toBe(true);
    expect(accessResult("create", { id: 8, role: "specialist" })).toBe(true);
    expect(accessResult("create", null)).toBe(false);
  });
});

describe("ContractorTimeEntries beforeChange hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload.findByID.mockResolvedValue({ id: 100, hourlyRate: 125 });
  });

  it("forces non-admin entries onto the current user even when another user is supplied", async () => {
    const data = { user: 999, hours: 8, status: "draft" };

    const result = await beforeChangeHook()({
      data,
      req: mockReq({ id: 42, role: "specialist" }),
      originalDoc: {},
      operation: "create",
    });

    expect(result.user).toBe(42);
  });

  it("does not overwrite admin-selected users", async () => {
    const data = { user: 55, hours: 8, status: "draft" };

    const result = await beforeChangeHook()({
      data,
      req: mockReq({ id: 1, role: "admin" }),
      originalDoc: {},
      operation: "create",
    });

    expect(result.user).toBe(55);
  });
});
