import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

function getRequest() {
  return new NextRequest("http://localhost/api/team-tasks/42/comments", { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPayload.auth.mockResolvedValue({
    user: { id: 1, role: "admin", name: "Admin", email: "admin@example.com" },
  });
});

describe("team task comments route", () => {
  it("requests and returns comments newest-first", async () => {
    const newestComment = { id: 2, body: "Newest update", createdAt: "2026-07-21T10:00:00.000Z" };
    const oldestComment = { id: 1, body: "Original update", createdAt: "2026-07-20T10:00:00.000Z" };
    mockPayload.findByID.mockResolvedValue({ id: 42 });
    mockPayload.find.mockResolvedValue({ docs: [newestComment, oldestComment] });

    const { GET } = await import("@/app/(frontend)/api/team-tasks/[id]/comments/route");
    const response = await GET(getRequest(), { params: Promise.resolve({ id: "42" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ comments: [newestComment, oldestComment] });
    expect(mockPayload.find).toHaveBeenCalledWith(expect.objectContaining({
      collection: "team-task-comments",
      where: { task: { equals: "42" } },
      sort: "-createdAt",
    }));
  });
});
