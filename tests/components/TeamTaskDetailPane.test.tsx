import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TeamTaskDetailPane from "@/components/TeamTaskDetailPane";

const initialTask = {
  id: 42,
  title: "Ongoing task",
  dueDate: "2026-07-08T00:00:00.000Z",
  status: "in_progress",
};

function response(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("TeamTaskDetailPane scheduling", () => {
  it("persists a selected date on the existing task without creating a duplicate", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method) {
        return response({
          task: initialTask,
          comments: [],
          users: [],
          currentUser: { id: 1, name: "Admin" },
          canManage: true,
        });
      }

      const patch = JSON.parse(String(init.body));
      return response({ task: { ...initialTask, ...patch, dueDate: "2026-07-16" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TeamTaskDetailPane taskId={42} onClose={vi.fn()} />);
    const dateInput = await screen.findByLabelText("Task date");
    fireEvent.change(dateInput, { target: { value: "2026-07-16" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/team-tasks/42/detail",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ dueDate: "2026-07-16" }),
      }),
    );
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("forwards the existing task by one week without creating a duplicate", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method) {
        return response({
          task: initialTask,
          comments: [],
          users: [],
          currentUser: { id: 1, name: "Admin" },
          canManage: true,
        });
      }

      const patch = JSON.parse(String(init.body));
      return response({ task: { ...initialTask, ...patch } });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TeamTaskDetailPane taskId={42} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Forward to next week" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/team-tasks/42/detail",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ dueDate: "2026-07-15" }),
      }),
    );
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });
  it("renders comments in the newest-first order returned by the detail API", async () => {
    const fetchMock = vi.fn(async () => response({
      task: initialTask,
      comments: [
        { id: 2, body: "Newest update", author: { id: 1, name: "Admin" }, createdAt: "2026-07-21T10:00:00.000Z" },
        { id: 1, body: "Original update", author: { id: 1, name: "Admin" }, createdAt: "2026-07-20T10:00:00.000Z" },
      ],
      users: [],
      currentUser: { id: 1, name: "Admin" },
      canManage: true,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<TeamTaskDetailPane taskId={42} onClose={vi.fn()} />);
    await screen.findByText("Newest update");

    const commentBodies = Array.from(container.querySelectorAll("article div[style*='line-height']"))
      .map((element) => element.textContent);
    expect(commentBodies).toEqual(["Newest update", "Original update"]);
  });
});
