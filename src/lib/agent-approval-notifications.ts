/**
 * Bell-notification fan-out for the agent-approval-queue.
 *
 * When an agent queues a proposal, every CMS user gets a per-recipient
 * `agent-approval-pending` notification row so the bell lights up for reviewers.
 * The notification body names the user who CALLED the agent (looked up
 * via the latest `optimate-chat-turns` row sharing the same agentRunId) so
 * approvers know whose request they're reviewing.
 *
 * When any user approves or rejects, every related row (matched by
 * `relatedApproval`) is removed in one shot. The bell and dropdown clear for
 * everyone because resolved approvals no longer need a notification row.
 */

import type { Payload } from "payload";

const NOTIFICATIONS = "notifications" as never;
const APPROVALS = "agent-approval-queue" as never;
const CHAT_TURNS = "optimate-chat-turns" as never;
const USERS = "users" as never;

const RESOLVED_APPROVAL_STATUSES = new Set(["approved", "rejected", "applied", "failed"]);

interface FanOutInput {
  approvalId: number;
  agentRunId: string;
  agentName: string;
  proposalType: string;
  title: string;
  clientId?: number | string | null;
}

/**
 * Look up the human who initiated the agent run by finding the latest
 * `optimate-chat-turns` row for the agentRunId. Returns null for runs that
 * have no chat turn (e.g. scheduled background runs).
 */
async function lookupCallerEmail(
  payload: Payload,
  agentRunId: string,
): Promise<string | null> {
  try {
    const turns = await payload.find({
      collection: CHAT_TURNS,
      where: { runId: { equals: agentRunId } } as never,
      limit: 1,
      depth: 1,
      sort: "-createdAt",
      overrideAccess: true,
    });
    const turn = turns.docs[0] as { user?: { email?: string } | number | string } | undefined;
    if (!turn) return null;
    const userField = turn.user;
    if (userField && typeof userField === "object" && "email" in userField) {
      return (userField as { email?: string }).email ?? null;
    }
    if (typeof userField === "number" || typeof userField === "string") {
      const u = (await payload.findByID({
        collection: USERS,
        id: userField as never,
        depth: 0,
        overrideAccess: true,
      })) as { email?: string };
      return u.email ?? null;
    }
    return null;
  } catch {
    // Best-effort — never block the queue write on a lookup miss.
    return null;
  }
}

/**
 * Create an `agent-approval-pending` notification for every CMS user. Approve/apply
 * actions are still permission-gated by their routes; the bell is only a queue alert.
 *
 * Best-effort: duplicate rows are skipped, and a per-user create failure is
 * logged so one bad row never aborts the broadcast.
 */
export async function fanOutApprovalNotifications(
  payload: Payload,
  input: FanOutInput,
): Promise<number> {
  const callerEmail = await lookupCallerEmail(payload, input.agentRunId);
  const requestedByLine = callerEmail
    ? `Requested by ${callerEmail}.`
    : `Requested by ${input.agentName}.`;
  const body = `${requestedByLine} ${input.title}`.slice(0, 280);
  const url = `/admin/agent-approvals/${input.approvalId}`;

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
      const existing = await payload.find({
        collection: NOTIFICATIONS,
        where: {
          and: [
            { recipient: { equals: recipientId } },
            { kind: { equals: "agent-approval-pending" } },
            { relatedApproval: { equals: input.approvalId } },
          ],
        } as never,
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      if (existing.totalDocs > 0) {
        continue;
      }

      await payload.create({
        collection: NOTIFICATIONS,
        overrideAccess: true,
        data: {
          recipient: recipientId,
          kind: "agent-approval-pending",
          title: `Approval needed: ${input.title}`,
          body,
          url,
          relatedApproval: input.approvalId,
          ...(input.clientId !== undefined && input.clientId !== null
            ? { relatedClient: input.clientId }
            : {}),
        } as never,
      });
      created++;
    } catch (err) {
      payload.logger?.error?.({
        msg: "agent-approval notification create failed",
        recipientId,
        approvalId: input.approvalId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return created;
}

/**
 * Delete every per-user `agent-approval-pending` notification tied to the given
 * approval row. Called from approve/reject/apply/fail transitions so the bell
 * dropdown clears everywhere as soon as any team-member actions the queue item.
 *
 * Returns the number of rows deleted (best-effort; 0 on lookup failure).
 */
export async function clearApprovalNotifications(
  payload: Payload,
  approvalId: number,
): Promise<number> {
  try {
    const rows = await payload.find({
      collection: NOTIFICATIONS,
      where: {
        and: [
          { kind: { equals: "agent-approval-pending" } },
          { relatedApproval: { equals: approvalId } },
        ],
      } as never,
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });

    for (const row of rows.docs) {
      await payload.delete({
        collection: NOTIFICATIONS,
        id: (row as { id: number | string }).id,
        overrideAccess: true,
      });
    }
    return rows.docs.length;
  } catch (err) {
    payload.logger?.error?.({
      msg: "agent-approval notification delete failed",
      approvalId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * Best-effort reconciliation for the bell endpoints. This backfills notification
 * rows for pending approvals created before fan-out existed or for users added
 * later, and removes stale rows for approvals that have since been resolved.
 */
export async function reconcileApprovalNotifications(payload: Payload): Promise<void> {
  try {
    const pending = await payload.find({
      collection: APPROVALS,
      where: { status: { equals: "pending" } } as never,
      limit: 200,
      depth: 0,
      sort: "-createdAt",
      overrideAccess: true,
    });

    for (const doc of pending.docs) {
      const approval = doc as {
        id: number | string;
        agentRunId?: string;
        agentName?: string;
        proposalType?: string;
        title?: string;
        client?: number | string | { id?: number | string } | null;
      };
      const clientId =
        approval.client && typeof approval.client === "object" ? approval.client.id : approval.client;

      await fanOutApprovalNotifications(payload, {
        approvalId: Number(approval.id),
        agentRunId: String(approval.agentRunId ?? ""),
        agentName: String(approval.agentName ?? "OptiMate"),
        proposalType: String(approval.proposalType ?? "approval"),
        title: String(approval.title ?? "Agent approval"),
        clientId: clientId ?? null,
      });
    }
  } catch (err) {
    payload.logger?.error?.({
      msg: "agent-approval notification pending reconcile failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const rows = await payload.find({
      collection: NOTIFICATIONS,
      where: { kind: { equals: "agent-approval-pending" } } as never,
      limit: 500,
      depth: 1,
      overrideAccess: true,
    });

    for (const row of rows.docs) {
      const notification = row as {
        id: number | string;
        relatedApproval?: number | string | { id?: number | string; status?: string } | null;
      };
      const related = notification.relatedApproval;
      if (!related) {
        await payload.delete({ collection: NOTIFICATIONS, id: notification.id, overrideAccess: true });
        continue;
      }

      if (typeof related === "object") {
        if (related.status && RESOLVED_APPROVAL_STATUSES.has(related.status)) {
          await payload.delete({ collection: NOTIFICATIONS, id: notification.id, overrideAccess: true });
        }
        continue;
      }

      const approval = (await payload.findByID({
        collection: APPROVALS,
        id: related as never,
        depth: 0,
        overrideAccess: true,
      })) as { status?: string };
      if (approval.status && RESOLVED_APPROVAL_STATUSES.has(approval.status)) {
        await payload.delete({ collection: NOTIFICATIONS, id: notification.id, overrideAccess: true });
      }
    }
  } catch (err) {
    payload.logger?.error?.({
      msg: "agent-approval notification resolved reconcile failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
