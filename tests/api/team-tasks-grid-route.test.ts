import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  auth: vi.fn(),
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
});
