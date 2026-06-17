import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";

const TASK_SELECT = {
  title: true,
  client: true,
  taskType: true,
  status: true,
  priority: true,
  assignedTo: true,
  dueDate: true,
  completedAt: true,
  instructions: true,
  staffNotes: true,
  reviewNotes: true,
  sheetWeek: true,
  updatedAt: true,
  createdAt: true,
} as const;

function relationshipId(value: unknown) {
  if (value == null || value === "") return undefined;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function isAssignableUser(user: { email?: string | null; name?: string | null }) {
  return user.email !== "admin@optimise.digital" && user.name !== "Admin User";
}

async function getAuthedPayload() {
  const payload = await getPayload({ config });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  return { payload, user };
}

export async function GET(req: NextRequest) {
  try {
    const { payload, user } = await getAuthedPayload();
    if (!user || !userHasFeature(user, "team-tasks")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "open";
    const client = searchParams.get("client") || "";
    const weekStart = searchParams.get("weekStart") || "";

    const and: any[] = [];
    if (status === "open") {
      and.push({ status: { not_equals: "completed" } }, { status: { not_equals: "task_postponed" } });
    } else if (status !== "all") {
      and.push({ status: { equals: status } });
    }
    if (client) and.push({ client: { equals: client } });
    if (weekStart && weekStart !== "all") {
      const start = new Date(`${weekStart}T00:00:00.000Z`);
      if (!Number.isNaN(start.getTime())) {
        const beforeStart = new Date(start);
        beforeStart.setUTCDate(beforeStart.getUTCDate() - 1);
        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 7);
        and.push({ dueDate: { greater_than: beforeStart.toISOString() } }, { dueDate: { less_than: end.toISOString() } });
      }
    }

    const [tasksResult, clientsResult, usersResult] = await Promise.all([
      payload.find({
        collection: "team-tasks" as any,
        where: and.length ? { and } : undefined,
        sort: "dueDate",
        limit: 500,
        depth: 0,
        select: TASK_SELECT as any,
      }),
      payload.find({
        collection: "clients",
        where: { isActive: { not_equals: false } },
        sort: "name",
        limit: 500,
        depth: 0,
        select: { name: true, slug: true } as any,
        overrideAccess: true,
      }),
      payload.find({
        collection: "users",
        sort: "name",
        limit: 500,
        depth: 0,
        select: { name: true, email: true, role: true } as any,
        overrideAccess: true,
      }),
    ]);

    return NextResponse.json({
      tasks: tasksResult.docs,
      clients: clientsResult.docs.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })),
      users: usersResult.docs.filter(isAssignableUser).map((u: any) => ({ id: u.id, name: u.name || u.email, email: u.email, role: u.role })),
      canManage: user.role === "admin" || user.role === "manager",
    });
  } catch (error) {
    console.error("[team-tasks/grid] GET error:", error);
    return NextResponse.json({ error: "Failed to load team tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { payload, user } = await getAuthedPayload();
    if (!user || !userHasFeature(user, "team-tasks")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const task = await payload.create({
      collection: "team-tasks" as any,
      overrideAccess: true,
      data: {
        title: body.title || "New task",
        client: relationshipId(body.client),
        taskType: body.taskType || "other",
        status: body.status || "in_progress",
        priority: body.priority || "normal",
        assignedTo: relationshipId(body.assignedTo),
        dueDate: body.dueDate || undefined,
        instructions: body.instructions || "",
        sheetWeek: body.sheetWeek || "",
      } as any,
      depth: 0,
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("[team-tasks/grid] POST error:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { payload, user } = await getAuthedPayload();
    if (!user || !userHasFeature(user, "team-tasks")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Missing task id" }, { status: 400 });

    await payload.findByID({ collection: "team-tasks" as any, id: body.id, depth: 0 });

    const allowed = [
      "title",
      "client",
      "taskType",
      "status",
      "priority",
      "assignedTo",
      "dueDate",
      "instructions",
      "staffNotes",
      "reviewNotes",
      "sheetWeek",
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      if (key === "client" || key === "assignedTo") data[key] = relationshipId(body[key]) ?? null;
      else data[key] = body[key] || null;
    }

    const task = await payload.update({
      collection: "team-tasks" as any,
      id: body.id,
      data: data as any,
      depth: 0,
      overrideAccess: true,
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("[team-tasks/grid] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { payload, user } = await getAuthedPayload();
    if (!user || !userHasFeature(user, "team-tasks") || (user.role !== "admin" && user.role !== "manager")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing task id" }, { status: 400 });

    await payload.delete({ collection: "team-tasks" as any, id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[team-tasks/grid] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
