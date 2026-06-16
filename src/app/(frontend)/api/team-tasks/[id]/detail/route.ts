import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";

function relationshipId(value: unknown) {
  if (value == null || value === "") return undefined;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function isAssignableUser(user: { email?: string | null; name?: string | null }) {
  return user.email !== "admin@optimise.digital" && user.name !== "Admin User";
}

async function getAuthedPayload(req: NextRequest) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });
  return { payload, user };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { payload, user } = await getAuthedPayload(req);
    if (!user || !userHasFeature(user, "team-tasks")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [task, commentsResult, usersResult] = await Promise.all([
      payload.findByID({ collection: "team-tasks" as any, id, depth: 0 }),
      payload.find({
        collection: "team-task-comments" as any,
        where: { task: { equals: id } },
        sort: "createdAt",
        depth: 1,
        limit: 200,
      }).catch((error) => {
        console.error("[team-tasks/detail] comments load error:", error);
        return { docs: [] };
      }),
      payload.find({
        collection: "users",
        sort: "name",
        limit: 500,
        depth: 0,
        overrideAccess: true,
        select: { name: true, email: true, role: true } as any,
      }),
    ]);

    return NextResponse.json({
      task,
      comments: commentsResult.docs,
      users: usersResult.docs.filter(isAssignableUser).map((u: any) => ({ id: u.id, name: u.name || u.email, email: u.email, role: u.role })),
      currentUser: { id: user.id, name: user.name || user.email, email: user.email, role: user.role },
      canManage: user.role === "admin" || user.role === "manager",
    });
  } catch (error) {
    console.error("[team-tasks/detail] GET error:", error);
    return NextResponse.json({ error: "Failed to load task detail" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { payload, user } = await getAuthedPayload(req);
    if (!user || !userHasFeature(user, "team-tasks")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    await payload.findByID({ collection: "team-tasks" as any, id, depth: 0 });

    const allowed = [
      "title",
      "client",
      "taskType",
      "status",
      "priority",
      "assignedTo",
      "dueDate",
      "instructions",
      "sourceUrl",
      "relatedLinks",
      "staffNotes",
      "reviewNotes",
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      if (key === "client" || key === "assignedTo") data[key] = relationshipId(body[key]) ?? null;
      else data[key] = body[key] || null;
    }

    const task = await payload.update({
      collection: "team-tasks" as any,
      id,
      data: data as any,
      depth: 0,
      overrideAccess: true,
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("[team-tasks/detail] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update task detail" }, { status: 500 });
  }
}
