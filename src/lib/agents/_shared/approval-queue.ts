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
  const created = (await payload.create({
    collection: COLLECTION,
    data: {
      title: input.title,
      agentName: input.agentName,
      agentRunId: input.agentRunId,
      proposalType: input.proposalType,
      proposalPayload: input.proposalPayload,
      rendered: input.rendered,
      status: "pending",
      ...(input.clientId !== undefined ? { client: input.clientId } : {}),
    },
    overrideAccess: true,
  })) as { id: number };
  return created.id;
}

export async function readPending(filter?: {
  agentName?: string;
  clientId?: string | number;
}): Promise<ApprovalRow[]> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const where: Record<string, unknown> = { status: { equals: "pending" } };
  if (filter?.agentName) where["agentName"] = { equals: filter.agentName };
  if (filter?.clientId !== undefined) where["client"] = { equals: filter.clientId };
  const result = await payload.find({
    collection: COLLECTION,
    where: where as any,
    limit: 200,
    overrideAccess: true,
  });
  return result.docs as unknown as ApprovalRow[];
}

export async function markApproved(id: number, reviewedById: number): Promise<void> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  await payload.update({
    collection: COLLECTION,
    id,
    data: {
      status: "approved",
      reviewedBy: reviewedById,
      reviewedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  });
}

export async function markRejected(id: number, reviewedById: number): Promise<void> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  await payload.update({
    collection: COLLECTION,
    id,
    data: {
      status: "rejected",
      reviewedBy: reviewedById,
      reviewedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  });
}

export async function markApplied(id: number): Promise<void> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  await payload.update({
    collection: COLLECTION,
    id,
    data: { status: "applied", appliedAt: new Date().toISOString() },
    overrideAccess: true,
  });
}

export async function markFailed(id: number, error: string): Promise<void> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  await payload.update({
    collection: COLLECTION,
    id,
    data: { status: "failed", applyError: error.slice(0, 4000) },
    overrideAccess: true,
  });
}
