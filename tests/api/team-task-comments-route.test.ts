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

describe("team task comments route — replying clears your mentions", () => {
  it("marks the author's unread mentions on that task as read after posting", async () => {
    const update = vi.fn().mockResolvedValue({});
    const create = vi.fn().mockResolvedValue({ id: 99, body: "On it" });
    Object.assign(mockPayload, { update, create });
    mockPayload.findByID.mockResolvedValue({ id: 42, title: "Blog images" });
    mockPayload.find.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === "notifications") return { docs: [{ id: 7 }, { id: 8 }] };
      return { docs: [] };
    });

    const { POST } = await import("@/app/(frontend)/api/team-tasks/[id]/comments/route");
    const response = await POST(
      new NextRequest("http://localhost/api/team-tasks/42/comments", { method: "POST", body: JSON.stringify({ body: "On it" }) }),
      { params: Promise.resolve({ id: "42" }) },
    );

    expect(response.status).toBe(200);
    expect(mockPayload.find).toHaveBeenCalledWith(expect.objectContaining({
      collection: "notifications",
      where: { and: [
        { recipient: { equals: 1 } },
        { kind: { equals: "team-task-mention" } },
        { relatedTeamTask: { equals: "42" } },
        { readAt: { exists: false } },
      ] },
    }));
    expect(update.mock.calls.map(([args]) => args.id)).toEqual([7, 8]);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ collection: "notifications", data: { readAt: expect.any(String) } }));
  });
});
