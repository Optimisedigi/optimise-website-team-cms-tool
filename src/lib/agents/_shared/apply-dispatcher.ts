/**
 * Apply-side dispatcher for the agent-approval-queue.
 *
 * When a human clicks "Apply" on an approved row, the apply route looks up
 * the row's `proposalType` and calls the matching apply-handler from the
 * registry below. Handlers do the actual write — calling Payload's local
 * API, or POSTing to the existing CMS pipelines that the admin UI already
 * uses (run-campaign-proposal, build-campaigns, deploy-ad-copy, etc.).
 *
 * Each agent registers its handlers via registerApplyHandler() at module-load
 * time. Keeping the registry shared (not per-agent) means a future agent can
 * extend the same approval queue without us re-plumbing the dispatcher.
 *
 * Handlers MUST be idempotent where possible — a network blip during apply
 * can leave a row in an ambiguous state and the human may click Apply again.
 */

import type { Payload } from "payload";

export interface ApplyHandlerContext {
  payload: Payload;
  /** The numeric approval-queue row id, in case handler needs to log against it. */
  approvalId: number;
  /** Logged-in user who clicked Apply (for audit trail / payload create authorship). */
  userId: number;
}

export interface ApplyHandlerResult {
  /** Optional summary surfaced back to the UI ("Created NKL #12 with 14 keywords"). */
  message?: string;
  /** Optional structured detail (e.g. created doc id, push counts). */
  detail?: Record<string, unknown>;
}

export type ApplyHandler = (
  payload: Record<string, unknown>,
  ctx: ApplyHandlerContext,
) => Promise<ApplyHandlerResult>;

const REGISTRY = new Map<string, ApplyHandler>();

/**
 * Register an apply handler for a given proposalType. Called from the agent's
 * apply-handlers/index.ts at module-load time. Last registration wins.
 */
export function registerApplyHandler(proposalType: string, handler: ApplyHandler): void {
  REGISTRY.set(proposalType, handler);
}

/**
 * Look up and run the handler for a proposalType. Throws a clear error if no
 * handler is registered — the apply route catches this and writes it to
 * `applyError` on the row via markFailed().
 */
export async function dispatchApply(
  proposalType: string,
  payload: Record<string, unknown>,
  ctx: ApplyHandlerContext,
): Promise<ApplyHandlerResult> {
  const handler = REGISTRY.get(proposalType);
  if (!handler) {
    throw new Error(
      `No apply handler registered for proposalType "${proposalType}". ` +
        `Either the proposing agent shipped without its apply-handler module, or this proposalType is not yet supported by the dispatcher.`,
    );
  }
  return handler(payload, ctx);
}

/** Inspect the registry — useful for tests + boot-time diagnostics. */
export function listRegisteredProposalTypes(): string[] {
  return Array.from(REGISTRY.keys()).sort();
}
