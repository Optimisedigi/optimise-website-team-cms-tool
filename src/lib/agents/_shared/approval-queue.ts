/**
 * Thin helpers over the agent-approval-queue Payload collection.
 *
 * Every agent that produces a draft / proposal calls queueForApproval() with
 * the structured payload + pre-rendered presentation. A human reviews and
 * either approves (markApproved) or rejects (markRejected). When the
 * downstream apply-side tool runs and succeeds it calls markApplied; on
 * failure markFailed with the error message.
 */

import { getPayload } from "payload";
import config from "@/payload.config";

const COLLECTION = "agent-approval-queue" as any;

export interface QueueForApprovalInput {
  agentName: string;
  agentRunId: string;
  proposalType: string;
  /** One-line summary shown in the queue list. */
  title: string;
  /** Optional CMS Clients ID. */
  clientId?: string | number;
  /** Structured payload the apply-side tool will read on approval. */
  proposalPayload: Record<string, unknown>;
  /** Pre-rendered presentation. */
  rendered?: {
    clientHtml?: string;
    internalMarkdown?: string;
  };
  /**
   * CMS user id of the human who triggered the agent run that produced this
   * proposal. Stamped on the row (informational) and used by future
   * per-caller filters.
   * Optional: scheduled / background runs have no triggering user.
   */
  triggeredByUserId?: number;
}

export interface ApprovalRow {
  id: number;
  agentName: string;
  agentRunId: string;
  proposalType: string;
  title: string;
  status: "pending" | "approved" | "rejected" | "applied" | "failed";
  proposalPayload: Record<string, unknown>;
  rendered?: { clientHtml?: string; internalMarkdown?: string };
  client?: number;
  reviewedBy?: number;
  reviewedAt?: string;
  appliedAt?: string;
  applyError?: string;
  createdAt: string;
}

export async function queueForApproval(input: QueueForApprovalInput): Promise<number> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const startedAt = Date.now();
  const created = (await payload.create({
    collection: COLLECTION,
    // Committed outside a transaction so the read-back below proves the row
    // persisted (Turso could silently roll back transactional writes).
    disableTransaction: true,
    data: {
      title: input.title,
      agentName: input.agentName,
      agentRunId: input.agentRunId,
      proposalType: input.proposalType,
      proposalPayload: input.proposalPayload,
      rendered: input.rendered,
      status: "pending",
      ...(input.clientId !== undefined ? { client: input.clientId } : {}),
      ...(input.triggeredByUserId !== undefined
        ? { triggeredBy: input.triggeredByUserId }
        : {}),
    },
    overrideAccess: true,
  })) as { id: number };

  // Confirm the row is visible to the review page before telling the agent it
  // can give the user a link. A returned ID alone does not prove persistence.
  const persisted = (await payload.findByID({
    collection: COLLECTION,
    id: created.id,
    depth: 0,
    overrideAccess: true,
  })) as { id: number; agentRunId: string };
  if (persisted.id !== created.id || persisted.agentRunId !== input.agentRunId) {
    throw new Error(`Approval #${created.id} was not persisted for this run`);
  }
  payload.logger?.info?.({
    msg: "queueForApproval: approval persisted",
    approvalId: created.id,
    proposalType: input.proposalType,
    elapsedMs: Date.now() - startedAt,
  });

  return created.id;
}

type ResolvedApprovalStatus = "approved" | "rejected" | "applied" | "failed";

/**
 * Persist a status transition and prove it stuck before returning.
 *
 * The update runs without a transaction: transactional updates here rolled
 * back silently on Turso (the reject route returned 200 but the row stayed
 * "pending"), so the row is read back to confirm the change.
 */
async function setApprovalStatus(
  id: number,
  status: ResolvedApprovalStatus,
  data: Record<string, unknown>,
): Promise<void> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  await payload.update({
    collection: COLLECTION,
    id,
    data: { ...data, status },
    disableTransaction: true,
    overrideAccess: true,
  });
  const persisted = (await payload.findByID({
    collection: COLLECTION,
    id,
    depth: 0,
    overrideAccess: true,
  })) as { status?: string };
  if (persisted.status !== status) {
    throw new Error(
      `Approval #${id} status change to "${status}" was not persisted (still "${String(persisted.status)}")`,
    );
  }
}

export async function markApproved(id: number, reviewedById: number): Promise<void> {
  await setApprovalStatus(id, "approved", {
    reviewedBy: reviewedById,
    reviewedAt: new Date().toISOString(),
  });
}

export async function markRejected(id: number, reviewedById: number): Promise<void> {
  await setApprovalStatus(id, "rejected", {
    reviewedBy: reviewedById,
    reviewedAt: new Date().toISOString(),
  });
}

export async function markApplied(id: number): Promise<void> {
  await setApprovalStatus(id, "applied", { appliedAt: new Date().toISOString() });
}

export async function markFailed(id: number, error: string): Promise<void> {
  await setApprovalStatus(id, "failed", { applyError: error.slice(0, 4000) });
}
