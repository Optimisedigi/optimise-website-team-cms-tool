import type { Payload } from "payload";
import { relationshipId } from "@/lib/relationship-id";

/**
 * Team Tasks "Notifications" tab: the signed-in user's team-task mention
 * notifications, grouped one row per task, plus the "mark this task's
 * mentions read" step that runs when they reply or dismiss it.
 */

export type TeamTaskMentionRow = {
  id: number | string;
  title?: string | null;
  body?: string | null;
  readAt?: string | null;
  createdAt?: string | null;
  relatedTeamTask?: unknown;
};

export type TeamTaskInboxTask = {
  id: number | string;
  title?: string | null;
  status?: string | null;
  client?: unknown;
  assignedTo?: unknown;
};

export type TeamTaskInboxItem = {
  taskId: string;
  taskTitle: string;
  taskMissing: boolean;
  status: string | null;
  clientName: string | null;
  assignedName: string | null;
  unreadCount: number;
  mentionCount: number;
  latestExcerpt: string;
  latestAt: string | null;
  /** Oldest unread mention time: comments from then on are new to the user. */
  unreadSince: string | null;
};

const MENTION_PREFIX = /^Mentioned in:\s*/i;

/** Pure grouping step, newest mention first; unread tasks sort above read ones. */
export function groupTeamTaskMentions(
  rows: TeamTaskMentionRow[],
  tasks: TeamTaskInboxTask[],
  clientNames: Map<string, string>,
  userNames: Map<string, string>,
): TeamTaskInboxItem[] {
  const taskById = new Map(tasks.map((task) => [String(task.id), task]));
  const items = new Map<string, TeamTaskInboxItem>();

  for (const row of rows) {
    const id = relationshipId(row.relatedTeamTask);
    if (id == null) continue;
    const taskId = String(id);
    const unread = !row.readAt;
    const createdAt = row.createdAt || null;
    let item = items.get(taskId);
    if (!item) {
      const task = taskById.get(taskId);
      const clientId = relationshipId(task?.client);
      const assignedId = relationshipId(task?.assignedTo);
      item = {
        taskId,
        taskTitle: task?.title || (row.title || "").replace(MENTION_PREFIX, "") || "Team task",
        taskMissing: !task,
        status: task?.status || null,
        clientName: clientId == null ? null : clientNames.get(String(clientId)) || null,
        assignedName: assignedId == null ? null : userNames.get(String(assignedId)) || null,
        unreadCount: 0,
        mentionCount: 0,
        latestExcerpt: row.body || "",
        latestAt: createdAt,
        unreadSince: null,
      };
      items.set(taskId, item);
    }
    item.mentionCount += 1;
    if (createdAt && (!item.latestAt || createdAt > item.latestAt)) {
      item.latestAt = createdAt;
      item.latestExcerpt = row.body || "";
    }
    if (unread) {
      item.unreadCount += 1;
      if (createdAt && (!item.unreadSince || createdAt < item.unreadSince)) item.unreadSince = createdAt;
    }
  }

  return Array.from(items.values()).sort((a, b) => {
    if ((a.unreadCount > 0) !== (b.unreadCount > 0)) return a.unreadCount > 0 ? -1 : 1;
    const byTime = (b.latestAt || "").localeCompare(a.latestAt || "");
    return byTime || a.taskId.localeCompare(b.taskId);
  });
}

/** Loads the user's team-task mentions (unread only unless `includeRead`) grouped by task. */
export async function loadTeamTaskInbox(
  payload: Payload,
  userId: number | string,
  options: { includeRead?: boolean } = {},
): Promise<TeamTaskInboxItem[]> {
  const result = await payload.find({
    collection: "notifications" as never,
    where: {
      and: [
        { recipient: { equals: userId } },
        { kind: { equals: "team-task-mention" } },
        ...(options.includeRead ? [] : [{ readAt: { exists: false } }]),
      ],
    } as never,
    sort: ["-createdAt", "-id"],
    limit: 300,
    depth: 0,
    overrideAccess: true,
    select: { title: true, body: true, readAt: true, createdAt: true, relatedTeamTask: true } as never,
  });
  const rows = result.docs as unknown as TeamTaskMentionRow[];

  const taskIds = Array.from(new Set(
    rows.map((row) => relationshipId(row.relatedTeamTask)).filter((id): id is number | string => id != null),
  ));
  if (!taskIds.length) return [];

  const tasksResult = await payload.find({
    collection: "team-tasks" as never,
    where: { id: { in: taskIds } } as never,
    limit: taskIds.length,
    depth: 0,
    overrideAccess: true,
    select: { title: true, status: true, client: true, assignedTo: true } as never,
  });
  const tasks = tasksResult.docs as unknown as TeamTaskInboxTask[];

  const clientIds = Array.from(new Set(
    tasks.map((task) => relationshipId(task.client)).filter((id): id is number | string => id != null),
  ));
  const userIds = Array.from(new Set(
    tasks.map((task) => relationshipId(task.assignedTo)).filter((id): id is number | string => id != null),
  ));
  const [clientsResult, usersResult] = await Promise.all([
    clientIds.length
      ? payload.find({
        collection: "clients",
        where: { id: { in: clientIds } } as never,
        limit: clientIds.length,
        depth: 0,
        overrideAccess: true,
        select: { name: true } as never,
      })
      : { docs: [] },
    userIds.length
      ? payload.find({
        collection: "users",
        where: { id: { in: userIds } } as never,
        limit: userIds.length,
        depth: 0,
        overrideAccess: true,
        select: { name: true, email: true } as never,
      })
      : { docs: [] },
  ]);

  const clientNames = new Map(
    (clientsResult.docs as Array<{ id: number | string; name?: string | null }>)
      .map((client) => [String(client.id), client.name || ""] as const),
  );
  const userNames = new Map(
    (usersResult.docs as Array<{ id: number | string; name?: string | null; email?: string | null }>)
      .map((user) => [String(user.id), user.name || user.email || ""] as const),
  );

  return groupTeamTaskMentions(rows, tasks, clientNames, userNames);
}

/** Marks every unread team-task mention for this user on this task as read. Returns how many changed. */
export async function markTeamTaskMentionsRead(
  payload: Payload,
  userId: number | string,
  taskId: number | string,
): Promise<number> {
  const unread = await payload.find({
    collection: "notifications" as never,
    where: {
      and: [
        { recipient: { equals: userId } },
        { kind: { equals: "team-task-mention" } },
        { relatedTeamTask: { equals: taskId } },
        { readAt: { exists: false } },
      ],
    } as never,
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  const readAt = new Date().toISOString();
  for (const row of unread.docs as Array<{ id: number | string }>) {
    await payload.update({
      collection: "notifications" as never,
      id: row.id,
      overrideAccess: true,
      data: { readAt } as never,
    });
  }
  return unread.docs.length;
}
