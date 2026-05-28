/**
 * Goal-agent scheduler — single tick across all due goal-runs.
 *
 * Invoked by the `/api/goal-agents/cron` route on a fixed cadence (hourly).
 * Responsibilities:
 *   1. Find every non-terminal goal-runs row whose nextCheckAt has elapsed
 *      (or has never been set).
 *   2. Look up the goal-type handler from the registry.
 *      - Unknown goal type → mark the run failed and continue.
 *   3. Invoke the handler (`tick(ctx)`) inside a try/catch.
 *      - Throw → mark the run failed with the error message and continue.
 *   4. Persist the handler's TickResult onto the goal-runs row
 *      (nextCheckAt, coolingOffUntil, iterationsCount).
 *      The handler is responsible for status transitions via
 *      `markGoalRunStatus` — we only persist scheduling metadata here.
 *   5. Return an aggregate summary; never throw upward on per-row errors.
 *
 * Notes:
 *   - We do NOT call `markGoalRunStatus` ourselves on the happy path —
 *     the handler does that. We only call it to mark failure.
 *   - "advanced" = the handler's returned status differs from the row's
 *     status at the start of the tick. "skipped" = identical status.
 *   - We process a hard cap of 50 rows per tick to keep one cron execution
 *     bounded (matches Vercel maxDuration budget).
 */

import type { Payload } from "payload";

import {
  fanOutGoalRunEscalation,
  clearGoalRunEscalations,
} from "./escalations";
import { markGoalRunStatus, type GoalRunStatus } from "./goal-run-audit";
import { GOAL_TYPES, type GoalRunDoc } from "./goal-types";

// ─── Public types ──────────────────────────────────────────────────────────

export interface TickDetail {
  goalRunId: number;
  goal: string;
  fromStatus: string;
  toStatus: string;
  reason?: string;
  error?: string;
}

/** Statuses that trigger a bell-notification fan-out when entered. */
const ESCALATION_STATUSES: ReadonlySet<string> = new Set([
  "pending_approval",
  "failed",
]);

/**
 * Side-effect runner for status transitions. Fans out bell notifications on
 * entry into an escalated state and clears them on exit. Best-effort: errors
 * are logged and swallowed so a notification hiccup never aborts the tick.
 */
async function applyEscalationSideEffects(
  payload: Payload,
  args: {
    goalRunId: number;
    goal: string;
    clientId: number | null;
    fromStatus: string;
    toStatus: string;
    reason?: string;
  },
): Promise<void> {
  const { goalRunId, goal, clientId, fromStatus, toStatus, reason } = args;
  if (fromStatus === toStatus) return;

  // Entering pending_approval or failed → broadcast to everyone.
  if (ESCALATION_STATUSES.has(toStatus)) {
    if (clientId == null) {
      // Without a client we still try to surface the bell — but the
      // notification create requires a client. Log and skip.
      payload.logger?.error?.({
        msg: "scheduler escalation fanout skipped — missing clientId",
        goalRunId,
        toStatus,
      });
    } else {
      try {
        await fanOutGoalRunEscalation({
          payload,
          goalRunId,
          goal,
          clientId,
          toStatus: toStatus as "pending_approval" | "failed",
          reason,
        });
      } catch (err) {
        payload.logger?.error?.({
          msg: "scheduler escalation fanout failed",
          goalRunId,
          toStatus,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Leaving pending_approval or failed → clear the bell.
  if (ESCALATION_STATUSES.has(fromStatus)) {
    try {
      await clearGoalRunEscalations(payload, goalRunId);
    } catch (err) {
      payload.logger?.error?.({
        msg: "scheduler escalation cleanup failed",
        goalRunId,
        fromStatus,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export interface TickSummary {
  processed: number;
  advanced: number;
  failed: number;
  skipped: number;
  details: TickDetail[];
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/** Extract a numeric id from a relationship field that may be id-or-object. */
function resolveRelationId(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === "number") return id;
    if (typeof id === "string") {
      const parsed = Number(id);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

/**
 * Best-effort fail-marker. Swallows downstream errors so the scheduler
 * never aborts mid-batch — the row will simply be retried next tick.
 */
async function safeMarkFailed(
  payload: Payload,
  goalRunId: number,
  error: string,
  now: Date,
): Promise<void> {
  try {
    await markGoalRunStatus(payload, {
      goalRunId,
      status: "failed",
      error,
      completedAt: now.toISOString(),
    });
  } catch (markErr) {
    // Last-ditch: log and move on.
    // eslint-disable-next-line no-console
    console.error(
      `[goal-agents-scheduler] failed to mark goal-run ${goalRunId} as failed`,
      markErr,
    );
  }
}

/** Persist scheduling metadata returned by a handler tick. */
async function persistTickMetadata(
  payload: Payload,
  goalRunId: number,
  update: {
    nextCheckAt: string;
    coolingOffUntil?: string | null;
    iterationsCount?: number;
  },
): Promise<void> {
  const data: Record<string, unknown> = { nextCheckAt: update.nextCheckAt };
  if (update.coolingOffUntil !== undefined) {
    data.coolingOffUntil = update.coolingOffUntil;
  }
  if (update.iterationsCount !== undefined) {
    data.iterationsCount = update.iterationsCount;
  }
  await payload.update({
    collection: "goal-runs",
    id: goalRunId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
    overrideAccess: true,
  });
}

// ─── Entry point ───────────────────────────────────────────────────────────

/**
 * Process every goal-run that is due. Never throws — per-row failures are
 * caught and reported in the returned summary.
 */
export async function runGoalAgentsTick(
  payload: Payload,
  now: Date = new Date(),
): Promise<TickSummary> {
  const summary: TickSummary = {
    processed: 0,
    advanced: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  // Find due rows. We intentionally use a permissive query — handlers are
  // responsible for their own gating (e.g. cooling-off windows).
  const result = await payload.find({
    collection: "goal-runs",
    where: {
      and: [
        { status: { not_in: ["complete", "failed"] } },
        {
          or: [
            { nextCheckAt: { less_than_equal: now.toISOString() } },
            { nextCheckAt: { exists: false } },
          ],
        },
      ],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (result?.docs ?? []) as Array<any>;

  for (const row of rows) {
    summary.processed += 1;

    const goalRunId = typeof row.id === "number" ? row.id : Number(row.id);
    const goalKey = String(row.goal ?? "");
    const fromStatus: GoalRunStatus = row.status as GoalRunStatus;

    // 1. Resolve handler from registry.
    const handler = GOAL_TYPES[goalKey];
    if (!handler) {
      const message = `Unknown goal type: ${goalKey}`;
      await safeMarkFailed(payload, goalRunId, message, now);
      summary.failed += 1;
      summary.details.push({
        goalRunId,
        goal: goalKey,
        fromStatus,
        toStatus: "failed",
        error: message,
      });
      await applyEscalationSideEffects(payload, {
        goalRunId,
        goal: goalKey,
        clientId: resolveRelationId(row.client),
        fromStatus,
        toStatus: "failed",
        reason: message,
      });
      continue;
    }

    // 2. Resolve client relationship to a numeric id.
    const clientId = resolveRelationId(row.client);
    if (clientId == null) {
      const message = `goal-run ${goalRunId} has no resolvable client id`;
      await safeMarkFailed(payload, goalRunId, message, now);
      summary.failed += 1;
      summary.details.push({
        goalRunId,
        goal: goalKey,
        fromStatus,
        toStatus: "failed",
        error: message,
      });
      // No clientId means fan-out can't create notifications, but we still
      // attempt cleanup if we were previously escalated.
      await applyEscalationSideEffects(payload, {
        goalRunId,
        goal: goalKey,
        clientId: null,
        fromStatus,
        toStatus: "failed",
        reason: message,
      });
      continue;
    }

    // 3. Build the handler context. We narrow to GoalRunDoc since handlers
    //    type their ctx against it. `parameters` is the per-run knob JSON
    //    added in step 11 — only some goal types (e.g. account-efficiency)
    //    read it; legacy rows have it undefined/null and handlers must
    //    fall back to their built-in defaults.
    const rawParameters = (row as { parameters?: unknown }).parameters;
    const parameters =
      rawParameters && typeof rawParameters === "object" && !Array.isArray(rawParameters)
        ? (rawParameters as Record<string, unknown>)
        : null;

    const goalRunDoc: GoalRunDoc = {
      id: goalRunId,
      goal: goalKey,
      status: fromStatus,
      client: clientId,
      iterationsCount:
        typeof row.iterationsCount === "number" ? row.iterationsCount : 0,
      coolingOffUntil: row.coolingOffUntil ?? null,
      nextCheckAt: row.nextCheckAt ?? null,
      parameters,
    };

    // 4. Invoke the handler.
    try {
      const tickResult = await handler({
        payload,
        goalRun: goalRunDoc,
        clientId,
        now,
      });

      // 5. Persist scheduling metadata. Status was already written by the
      //    handler (via markGoalRunStatus) if it transitioned — we never
      //    touch status here on the happy path.
      try {
        await persistTickMetadata(payload, goalRunId, {
          nextCheckAt: tickResult.nextCheckAt,
          coolingOffUntil: tickResult.coolingOffUntil ?? undefined,
          iterationsCount: tickResult.iterationsCount,
        });
      } catch (persistErr) {
        // Failing to persist nextCheckAt is non-fatal for this row; log and
        // continue. The row will be picked up again next tick.
        // eslint-disable-next-line no-console
        console.error(
          `[goal-agents-scheduler] failed to persist tick metadata for goal-run ${goalRunId}`,
          persistErr,
        );
      }

      if (tickResult.status === fromStatus) {
        summary.skipped += 1;
      } else {
        summary.advanced += 1;
      }

      summary.details.push({
        goalRunId,
        goal: goalKey,
        fromStatus,
        toStatus: tickResult.status,
        reason: tickResult.note,
      });

      // Escalation side effects (bell notifications) — best-effort, never
      // throws upward. We use `note` as the human-readable reason when set.
      await applyEscalationSideEffects(payload, {
        goalRunId,
        goal: goalKey,
        clientId,
        fromStatus,
        toStatus: tickResult.status,
        reason: tickResult.note,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await safeMarkFailed(payload, goalRunId, message, now);
      summary.failed += 1;
      summary.details.push({
        goalRunId,
        goal: goalKey,
        fromStatus,
        toStatus: "failed",
        error: message,
      });
      await applyEscalationSideEffects(payload, {
        goalRunId,
        goal: goalKey,
        clientId,
        fromStatus,
        toStatus: "failed",
        reason: message,
      });
      // Continue to next row — never abort the batch.
    }
  }

  return summary;
}
