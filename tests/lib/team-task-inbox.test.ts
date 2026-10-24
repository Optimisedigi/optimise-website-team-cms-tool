import { describe, expect, it } from "vitest";
import { groupTeamTaskMentions } from "@/lib/team-task-inbox";

describe("groupTeamTaskMentions", () => {
  const tasks = [
    { id: 1, title: "Blog images", status: "in_progress", client: 10, assignedTo: 5 },
    { id: 2, title: "Meta titles", status: "completed", client: null, assignedTo: null },
  ];
  const clients = new Map([["10", "Acme Plumbing"]]);
  const users = new Map([["5", "Lorenzo"]]);

  it("groups mentions per task with client, counts and the newest excerpt; unread tasks first", () => {
    const items = groupTeamTaskMentions([
      { id: 1, body: "newest on 2 (read)", readAt: "2026-10-20T00:00:00Z", createdAt: "2026-10-22T00:00:00Z", relatedTeamTask: 2 },
      { id: 2, body: "second on 1", readAt: null, createdAt: "2026-10-21T00:00:00Z", relatedTeamTask: 1 },
      { id: 3, body: "first on 1", readAt: null, createdAt: "2026-10-19T00:00:00Z", relatedTeamTask: { id: 1 } },
    ], tasks, clients, users);

    expect(items.map((item) => item.taskId)).toEqual(["1", "2"]);
    expect(items[0]).toMatchObject({
      taskTitle: "Blog images",
      clientName: "Acme Plumbing",
      assignedName: "Lorenzo",
      unreadCount: 2,
      mentionCount: 2,
      latestExcerpt: "second on 1",
      unreadSince: "2026-10-19T00:00:00Z",
      taskMissing: false,
    });
    expect(items[1]).toMatchObject({ unreadCount: 0, clientName: null, unreadSince: null });
  });

  it("keeps mentions on deleted tasks, titled from the notification", () => {
    const [item] = groupTeamTaskMentions([
      { id: 9, title: "Mentioned in: Old task", body: "hi", readAt: null, createdAt: "2026-10-22T00:00:00Z", relatedTeamTask: 77 },
    ], tasks, clients, users);
    expect(item).toMatchObject({ taskId: "77", taskTitle: "Old task", taskMissing: true });
  });
});
