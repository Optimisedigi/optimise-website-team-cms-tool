import { NextResponse } from "next/server";
import { createLocalReq, getPayload } from "payload";
import config from "@/payload.config";
import { validateStagedTaskList, type TaskMateClient, type TaskMateUser } from "@/lib/agents/taskmate";
import { isAssignableTeamTaskUser, toTeamTaskUserOption } from "@/lib/team-task-users";

export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((user as { role?: string }).role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const [clientsResult, usersResult] = await Promise.all([
    payload.find({
      collection: "clients",
      where: { isActive: { not_equals: false } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
      select: { name: true },
    }),
    payload.find({
      collection: "users",
      sort: "name",
      limit: 500,
      depth: 0,
      overrideAccess: true,
      select: { name: true, email: true, role: true },
    }),
  ]);
  const clients: TaskMateClient[] = clientsResult.docs.flatMap((client) =>
    typeof client.name === "string" && client.name.trim()
      ? [{ id: String(client.id), name: client.name.trim() }]
      : [],
  );
  const users: TaskMateUser[] = usersResult.docs
    .filter(isAssignableTeamTaskUser)
    .map(toTeamTaskUserOption);

  let staged;
  try {
    staged = validateStagedTaskList(body, clients, users);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid task batch" }, { status: 400 });
  }

  let transactionID: string | number | null;
  try {
    transactionID = await payload.db.beginTransaction();
  } catch (error) {
    console.error("[taskmate/assign] transaction unavailable:", error);
    return NextResponse.json({ error: "Could not start a safe task assignment" }, { status: 503 });
  }
  if (transactionID === null) {
    return NextResponse.json({ error: "Could not start a safe task assignment" }, { status: 503 });
  }

  const payloadReq = await createLocalReq({ user }, payload);
  payloadReq.transactionID = transactionID;
  const createdIds: Array<string | number> = [];
  try {
    for (const task of staged.tasks) {
      const created = await payload.create({
        collection: "team-tasks",
        data: {
          title: task.title,
          client: Number(task.clientId),
          assignedTo: task.assignedToId ? Number(task.assignedToId) : null,
          taskType: task.taskType,
          status: "in_progress",
          priority: task.priority,
          dueDate: task.dueDate,
          instructions: task.instructions ?? "",
        },
        depth: 0,
        overrideAccess: true,
        req: payloadReq,
      });
      createdIds.push(created.id);
    }
    await payload.db.commitTransaction(transactionID);
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID).catch(() => undefined);
    console.error("[taskmate/assign] batch rolled back:", error);
    return NextResponse.json({ error: "No tasks were assigned; the batch was rolled back" }, { status: 500 });
  }

  return NextResponse.json({ count: createdIds.length, ids: createdIds });
}
