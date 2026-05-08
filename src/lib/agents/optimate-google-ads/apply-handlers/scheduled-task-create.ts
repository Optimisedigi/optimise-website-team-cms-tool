/**
 * Apply handler: scheduled-task-create
 *
 * Creates a new `scheduled-agent-tasks` row from a propose_scheduled_task
 * approval. Stamps `createdBy` from `ctx.userId` (the human clicking Apply,
 * which equals the proposing user in v1 because only the proposer can
 * approve their own scheduling). Computes `nextRunAt` from schedule + tz.
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { CronExpressionParser } from "cron-parser";
import { resolveClientId } from "./_helpers";

export const applyScheduledTaskCreate: ApplyHandler = async (
  payload,
  ctx,
): Promise<ApplyHandlerResult> => {
  const { payload: pl, userId } = ctx;

  const auditId = payload.auditId as string | number | undefined;
  if (!auditId) throw new Error("scheduled-task-create: payload missing auditId");

  const title = String(payload.title ?? "").trim();
  if (!title) throw new Error("scheduled-task-create: payload missing title");

  const promptText = String(payload.prompt ?? "").trim();
  if (!promptText) throw new Error("scheduled-task-create: payload missing prompt");

  const schedule = String(payload.schedule ?? "").trim();
  if (!schedule) throw new Error("scheduled-task-create: payload missing schedule");

  const timezone = String(payload.timezone ?? "Australia/Brisbane").trim();

  // Compute next run.
  let nextRunAt: string;
  try {
    const it = CronExpressionParser.parse(schedule, { tz: timezone });
    nextRunAt = it.next().toDate().toISOString();
  } catch (err) {
    throw new Error(`scheduled-task-create: invalid schedule: ${(err as Error).message}`);
  }

  // Resolve client from the audit (denormalised onto the row).
  const auditDoc = (await pl.findByID({
    collection: "google-ads-audits",
    id: auditId,
    overrideAccess: true,
    depth: 0,
  })) as unknown as Record<string, unknown>;
  if (!auditDoc) throw new Error(`scheduled-task-create: audit #${auditId} not found`);
  const clientId = await resolveClientId(pl, auditDoc);
  if (!clientId) {
    throw new Error("scheduled-task-create: could not resolve client from audit");
  }

  // Resolve recipient: proposed value, or fall back to the user's CMS email.
  let recipientEmail = String(payload.recipientEmail ?? "").trim();
  if (!recipientEmail) {
    const userDoc = (await pl.findByID({
      collection: "users",
      id: userId,
      overrideAccess: true,
    })) as { email?: string };
    recipientEmail = userDoc.email ?? "";
  }
  if (!recipientEmail) {
    throw new Error("scheduled-task-create: no recipientEmail and user has no email on file");
  }

  const created = (await pl.create({
    collection: "scheduled-agent-tasks" as never,
    data: {
      title,
      agentName: "optimate-google-ads",
      prompt: promptText,
      audit: auditId,
      client: clientId,
      createdBy: userId,
      recipientEmail,
      schedule,
      timezone,
      nextRunAt,
      isActive: true,
    } as never,
    overrideAccess: true,
  })) as { id: number };

  return {
    message: `Scheduled task #${created.id} ("${title}") created. Next run: ${nextRunAt}.`,
    detail: { taskId: created.id, nextRunAt, schedule, timezone },
  };
};
