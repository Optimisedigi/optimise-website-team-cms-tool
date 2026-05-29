/**
 * Bell-notification fan-out for the agent-approval-queue.
 *
 * When an agent queues a proposal, every active admin user gets a per-recipient
 * `agent-approval-pending` notification row so the bell lights up for reviewers.
 * The notification body names the user who CALLED the agent (looked up
 * via the latest `optimate-chat-turns` row sharing the same agentRunId) so
 * approvers know whose request they're reviewing.
 *
 * When any user approves or rejects, every related row (matched by
 * `relatedApproval`) is deleted in one shot — the bell clears for everyone
 * on their next poll without per-user dismissal bookkeeping.
 */

import type { Payload } from "payload";

const NOTIFICATIONS = "notifications" as never;
const CHAT_TURNS = "optimate-chat-turns" as never;
const USERS = "users" as never;

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
 * Create an `agent-approval-pending` notification for every active admin user.
 * If no role data is available in a local/dev fixture, falls back to all users
 * rather than silently failing to alert anyone.
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

  const adminUsers = users.docs.filter((u) => (u as { role?: string }).role === "admin");
  const recipients = adminUsers.length > 0 ? adminUsers : users.docs;

  let created = 0;
  for (const u of recipients) {
    const recipientId = (u as { id: number | string }).id;
    try {
      const existing = await payload.find({
        collection: NOTIFICATIONS,
        where: {
          and: [
            { recipient: { equals: recipientId } },
            { kind: { equals: "agent-approval-pending" } },
            { relatedApproval: { equals: input.approvalId } },
            { readAt: { exists: false } },
          ],
        } as never,
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      if (existing.totalDocs > 0) continue;

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
 * Delete every per-user `agent-approval-pending` notification tied to the
 * given approval row. Called from both the approve and reject routes so the
 * bell clears everywhere as soon as any team-member actions the queue item.
 *
 * Returns the number of rows removed (best-effort; 0 on lookup failure).
 */
export async function clearApprovalNotifications(
  payload: Payload,
  approvalId: number,
): Promise<number> {
  try {
    const result = await payload.delete({
      collection: NOTIFICATIONS,
      where: {
        and: [
          { kind: { equals: "agent-approval-pending" } },
          { relatedApproval: { equals: approvalId } },
        ],
      } as never,
      overrideAccess: true,
    });
    const docs = (result as { docs?: unknown[] }).docs;
    return Array.isArray(docs) ? docs.length : 0;
  } catch (err) {
    payload.logger?.error?.({
      msg: "agent-approval notification cleanup failed",
      approvalId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
