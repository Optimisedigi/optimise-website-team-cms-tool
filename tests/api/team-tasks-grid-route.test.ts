import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  auth: vi.fn(),
  delete: vi.fn(),
  findByID: vi.fn(),
  update: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

vi.mock("@/lib/access", () => ({
  userHasFeature: vi.fn(() => true),
}));

function patchRequest(data: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/team-tasks/grid", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

describe("team tasks grid PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload.auth.mockResolvedValue({
      user: { id: 1, role: "admin", name: "Admin", email: "admin@example.com" },
    });
    mockPayload.findByID.mockResolvedValue({ id: 42 });
  });

  it("persists client, task type, and title edits to an existing row", async () => {
    const task = {
      id: 42,
      title: "New task",
      client: null as number | null,
      taskType: "blog_post",
    };
    mockPayload.update.mockImplementation(async ({ data }: { data: Partial<typeof task> }) => {
      Object.assign(task, data);
      return { ...task };
    });

    const { PATCH } = await import("@/app/(frontend)/api/team-tasks/grid/route");
    for (const update of [
      { client: "7" },
      { taskType: "seo" },
      { title: "Publish weekly landing page" },
    ]) {
      const response = await PATCH(patchRequest({ id: task.id, ...update }));
      expect(response.status).toBe(200);
    }

    expect(task).toMatchObject({
      client: 7,
      taskType: "seo",
      title: "Publish weekly landing page",
    });
    expect(mockPayload.findByID).toHaveBeenCalledTimes(3);
    expect(mockPayload.update).toHaveBeenCalledTimes(3);
    expect(mockPayload.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      collection: "team-tasks",
      id: 42,
      data: { client: 7 },
      overrideAccess: true,
    }));
  });

  it("lets a team-task user delete only an untouched placeholder week", async () => {
    mockPayload.auth.mockResolvedValue({
      user: { id: 2, role: "staff", name: "Team member", email: "team@example.com" },
    });
    mockPayload.findByID.mockResolvedValue({
      id: 42,
      title: "New task",
      client: null,
      taskType: "blog_post",
      status: "in_progress",
      priority: "normal",
      assignedTo: null,
      instructions: "",
      staffNotes: "",
      reviewNotes: "",
    });
    mockPayload.delete.mockResolvedValue({ id: 42 });

    const { DELETE } = await import("@/app/(frontend)/api/team-tasks/grid/route");
    const response = await DELETE(new NextRequest("http://localhost/api/team-tasks/grid?id=42", { method: "DELETE" }));

    expect(response.status).toBe(200);
    expect(mockPayload.delete).toHaveBeenCalledWith({
      collection: "team-tasks",
      id: "42",
      overrideAccess: true,
    });
  });

  it("refuses to let a team-task user delete a populated task", async () => {
    mockPayload.auth.mockResolvedValue({
      user: { id: 2, role: "staff", name: "Team member", email: "team@example.com" },
    });
    mockPayload.findByID.mockResolvedValue({
      id: 42,
      title: "Publish weekly landing page",
      client: 7,
      taskType: "seo",
      status: "in_progress",
      priority: "normal",
    });

    const { DELETE } = await import("@/app/(frontend)/api/team-tasks/grid/route");
    const response = await DELETE(new NextRequest("http://localhost/api/team-tasks/grid?id=42", { method: "DELETE" }));

    expect(response.status).toBe(403);
    expect(mockPayload.delete).not.toHaveBeenCalled();
  });
});
