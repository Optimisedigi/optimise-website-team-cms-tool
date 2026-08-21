import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const payload = { auth: vi.fn(), find: vi.fn() };
vi.mock("payload", () => ({ getPayload: vi.fn(async () => payload) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/access", () => ({ userHasFeature: vi.fn(() => true) }));

describe("team tasks grid admin flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    payload.find.mockResolvedValue({ docs: [] });
  });

  it.each([
    ["admin", true],
    ["manager", false],
  ])("returns isAdmin=%s only for administrators", async (role, expected) => {
    payload.auth.mockResolvedValue({ user: { id: 1, role } });
    const { GET } = await import("@/app/(frontend)/api/team-tasks/grid/route");
    const response = await GET(new NextRequest("http://localhost/api/team-tasks/grid?status=all&weekStart=all"));
    expect(response.status).toBe(200);
    expect((await response.json()).isAdmin).toBe(expected);
  });
});
