/**
 * Apply handler: scheduled-task-update
 *
 * Pause/resume/edit/delete an existing `scheduled-agent-tasks` row.
 * Re-checks ownership: only the row's `createdBy` user (or, in v1, that
 * same person clicking Apply) can modify it. If schedule or timezone
 * changes, recomputes `nextRunAt`.
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { CronExpressionParser } from "cron-parser";

interface ExistingTask {
  id: number;
  schedule: string;
  timezone: string;
  createdBy: number | { id: number };
}

export const applyScheduledTaskUpdate: ApplyHandler = async (
  payload,
  ctx,
): Promise<ApplyHandlerResult> => {
  const { payload: pl, userId } = ctx;

  const taskId = Number(payload.taskId);
  if (!Number.isFinite(taskId) || taskId <= 0) {
    throw new Error("scheduled-task-update: payload missing taskId");
  }

  const existing = (await pl.findByID({
    collection: "scheduled-agent-tasks" as never,
    id: taskId,
    overrideAccess: true,
    depth: 0,
  })) as unknown as ExistingTask;
  if (!existing) throw new Error(`scheduled-task-update: task #${taskId} not found`);

  const ownerId =
    typeof existing.createdBy === "object"
      ? existing.createdBy.id
      : existing.createdBy;
  if (ownerId !== userId) {
    // Admins should still be able to apply via the queue UI \u2014 we let admin role
    // through. Look up the apply user's role.
    const userDoc = (await pl.findByID({
      collection: "users",
      id: userId,
      overrideAccess: true,
    })) as { role?: string };
    if (userDoc.role !== "admin") {
      throw new Error(
        `scheduled-task-update: task #${taskId} is owned by user #${ownerId}; only the owner or an admin can apply changes.`,
      );
    }
  }

  // Delete path.
  if (payload.delete === true) {
    await pl.delete({
      collection: "scheduled-agent-tasks" as never,
      id: taskId,
      overrideAccess: true,
    });
    return {
      message: `Scheduled task #${taskId} deleted.`,
      detail: { taskId, deleted: true },
    };
  }

  // Build patch.
  const patch: Record<string, unknown> = {};
  if (typeof payload.isActive === "boolean") patch.isActive = payload.isActive;
  if (typeof payload.prompt === "string" && payload.prompt.trim().length > 0) {
    patch.prompt = String(payload.prompt).trim();
  }

  let scheduleChanged = false;
  if (typeof payload.schedule === "string" && payload.schedule.trim().length > 0) {
    patch.schedule = String(payload.schedule).trim();
    scheduleChanged = true;
  }
  if (typeof payload.timezone === "string" && payload.timezone.trim().length > 0) {
    patch.timezone = String(payload.timezone).trim();
    scheduleChanged = true;
  }

  if (scheduleChanged) {
    const schedule = String(patch.schedule ?? existing.schedule);
    const timezone = String(patch.timezone ?? existing.timezone);
    try {
      const it = CronExpressionParser.parse(schedule, { tz: timezone });
      patch.nextRunAt = it.next().toDate().toISOString();
    } catch (err) {
      throw new Error(`scheduled-task-update: invalid schedule: ${(err as Error).message}`);
    }
  }

  if (Object.keys(patch).length === 0) {
    throw new Error(
      "scheduled-task-update: nothing to change (no recognised edit fields and delete is not set)",
    );
  }

  await pl.update({
    collection: "scheduled-agent-tasks" as never,
    id: taskId,
    overrideAccess: true,
    data: patch as never,
  });

  return {
    message: `Scheduled task #${taskId} updated (${Object.keys(patch).join(", ")}).`,
    detail: { taskId, patch },
  };
};
