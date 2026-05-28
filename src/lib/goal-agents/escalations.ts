/**
 * Bell-notification fan-out for goal-run escalations.
 *
 * When a goal agent transitions a run into a state that needs human attention
 * (currently: `pending_approval` and `failed`), every user gets a per-recipient
 * `goal-run-escalation` notification row so the bell lights up across the team.
 *
 * The notification body summarises the reason (or the new status), and the URL
 * deep-links into the goal-runs admin row. When the run leaves the escalated
 * state, every related row (matched by `relatedGoalRun`) is deleted in one shot
 * so the bell clears for everyone on their next poll without per-user dismissal
 * bookkeeping.
 *
 * Patterned after `src/lib/agent-approval-notifications.ts` — see that module
 * for the original design notes; this is the goal-agents equivalent.
 */

import type { Payload } from "payload";

const NOTIFICATIONS = "notifications" as never;
const USERS = "users" as never;

export interface EscalationInput {
  payload: Payload;
  goalRunId: number;
  goal: string;
  clientId: number;
  toStatus: "pending_approval" | "failed";
  reason?: string;
}

/**
 * Create a `goal-run-escalation` notification for every user.
 *
 * Best-effort: a per-user create failure is logged and skipped so one bad
 * row never aborts the broadcast. Returns the number of notifications that
 * were created successfully (failures are excluded from the count).
 */
export async function fanOutGoalRunEscalation(
  input: EscalationInput,
): Promise<number> {
  const { payload, goalRunId, goal, clientId, toStatus, reason } = input;

  const title = `Goal run needs attention: ${goal}`;
  const body = reason ?? `Status: ${toStatus}`;
  const url = `/admin/collections/goal-runs/${goalRunId}`;

  const users = await payload.find({
    collection: USERS,
    where: {} as never,
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  let created = 0;
  for (const u of users.docs) {
    const recipientId = (u as { id: number | string }).id;
    try {
      await payload.create({
        collection: NOTIFICATIONS,
        overrideAccess: true,
        data: {
          recipient: recipientId,
          kind: "goal-run-escalation",
          title,
          body,
          url,
          relatedGoalRun: goalRunId,
          relatedClient: clientId,
        } as never,
      });
      created++;
    } catch (err) {
      payload.logger?.error?.({
        msg: "goal-run-escalation notification create failed",
        recipientId,
        goalRunId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return created;
}

/**
 * Delete every per-user `goal-run-escalation` notification tied to the
 * given goal-run row. Called when the run leaves an escalated state so
 * the bell clears everywhere on the next poll.
 *
 * Returns the number of rows removed (best-effort; 0 on lookup failure).
 */
export async function clearGoalRunEscalations(
  payload: Payload,
  goalRunId: number,
): Promise<number> {
  try {
    const result = await payload.delete({
      collection: NOTIFICATIONS,
      where: {
        and: [
          { kind: { equals: "goal-run-escalation" } },
          { relatedGoalRun: { equals: goalRunId } },
        ],
      } as never,
      overrideAccess: true,
    });
    const docs = (result as { docs?: unknown[] }).docs;
    return Array.isArray(docs) ? docs.length : 0;
  } catch (err) {
    payload.logger?.error?.({
      msg: "goal-run-escalation notification cleanup failed",
      goalRunId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
