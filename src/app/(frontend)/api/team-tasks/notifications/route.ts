import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import { loadTeamTaskInbox, markTeamTaskMentionsRead } from "@/lib/team-task-inbox";

/**
 * GET /api/team-tasks/notifications
 *
 * The signed-in user's team-task mention notifications, one row per task.
 * Unread only by default; `?include=read` also returns already-read mentions.
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user || !userHasFeature(user, "team-tasks")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const includeRead = new URL(req.url).searchParams.get("include") === "read";
    const items = await loadTeamTaskInbox(payload, user.id, { includeRead });
    const unreadTasks = items.filter((item) => item.unreadCount > 0).length;
    return NextResponse.json({ items, unreadTasks });
  } catch (error) {
    console.error("[team-tasks/notifications] GET error:", error);
    return NextResponse.json({ error: "Failed to load task notifications" }, { status: 500 });
  }
}

/**
 * POST /api/team-tasks/notifications  { taskId }
 *
 * Marks the signed-in user's unread mentions on one task as read.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user || !userHasFeature(user, "team-tasks")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null) as { taskId?: unknown } | null;
    const taskId = body?.taskId;
    if ((typeof taskId !== "string" && typeof taskId !== "number") || String(taskId).trim() === "") {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const marked = await markTeamTaskMentionsRead(payload, user.id, taskId);
    return NextResponse.json({ ok: true, marked });
  } catch (error) {
    console.error("[team-tasks/notifications] POST error:", error);
    return NextResponse.json({ error: "Failed to mark task notifications read" }, { status: 500 });
  }
}
