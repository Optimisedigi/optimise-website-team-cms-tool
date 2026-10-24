import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TeamTaskInbox from "@/components/TeamTaskInbox";

const item = (taskId: string, title: string, clientName: string) => ({
  taskId, taskTitle: title, taskMissing: false, status: "in_progress", clientName, assignedName: "Lorenzo",
  unreadCount: 1, mentionCount: 1, latestExcerpt: `@Peter about ${title}`, latestAt: "2026-10-24T09:00:00.000Z", unreadSince: "2026-10-24T09:00:00.000Z",
});

function response(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("TeamTaskInbox", () => {
  it("lists task mentions with clients, replies, and moves on to the next task", async () => {
    let inbox = [item("1", "Blog images", "Acme Plumbing"), item("2", "Meta titles", "Bright Dental")];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/team-tasks/notifications")) return response({ items: inbox, unreadTasks: inbox.length });
      if (url.endsWith("/detail")) {
        return response({
          comments: [{ id: 5, body: "@Peter can you check?", author: { id: 2, name: "Lorenzo" }, createdAt: "2026-10-24T08:59:59.000Z" }],
          users: [{ id: 1, name: "Peter" }, { id: 2, name: "Lorenzo" }],
          currentUser: { id: 1, name: "Peter" },
        });
      }
      if (url.endsWith("/comments") && init?.method === "POST") {
        inbox = inbox.filter((row) => row.taskId !== "1");
        return response({ comment: { id: 6, body: "Done", author: { id: 1, name: "Peter" }, createdAt: "2026-10-24T10:00:00.000Z" } });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onUnreadChange = vi.fn();
    const onOpenTask = vi.fn();

    render(<TeamTaskInbox mobile={false} onOpenTask={onOpenTask} onUnreadChange={onUnreadChange} />);

    expect(await screen.findByRole("heading", { name: "Blog images" })).toBeInTheDocument();
    expect(screen.getByText("Client: Acme Plumbing")).toBeInTheDocument();
    expect(await screen.findByText("New")).toBeInTheDocument();
    expect(onUnreadChange).toHaveBeenLastCalledWith(2);

    fireEvent.click(screen.getByRole("button", { name: "Open task" }));
    expect(onOpenTask).toHaveBeenCalledWith("1");

    fireEvent.change(screen.getByPlaceholderText(/Write a comment/), { target: { value: "Done" } });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));

    expect(await screen.findByRole("heading", { name: "Meta titles" })).toBeInTheDocument();
    expect(onUnreadChange).toHaveBeenLastCalledWith(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/team-tasks/1/comments", expect.objectContaining({ method: "POST", body: JSON.stringify({ body: "Done" }) }));
  });

  it("marks a task read without replying", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/team-tasks/notifications" && init?.method === "POST") return response({ ok: true, marked: 1 });
      if (url.startsWith("/api/team-tasks/notifications")) return response({ items: [item("1", "Blog images", "Acme Plumbing")], unreadTasks: 1 });
      return response({ comments: [], users: [], currentUser: { id: 1, name: "Peter" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TeamTaskInbox mobile={false} onOpenTask={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark as read" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/team-tasks/notifications", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ taskId: "1" }),
    })));
  });
});
