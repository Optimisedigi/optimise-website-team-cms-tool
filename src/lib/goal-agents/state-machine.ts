/**
 * Goal Run Status — pure state machine.
 *
 * Encodes the legal transitions for goal-runs.status. No I/O, no Payload,
 * no LLM. Safe to call from anywhere (writes, schedulers, tests).
 *
 * Transition graph (see docs/goal-agents-architecture-and-build-plan.md):
 *
 *   awaiting_data    → analysing, blocked, failed
 *   analysing        → pending_approval, executing, awaiting_data, blocked, failed
 *   pending_approval → executing, blocked, failed
 *   executing        → measuring, failed, blocked
 *   measuring        → analysing, complete, failed, blocked
 *   blocked          → analysing, failed              (paused runs can resume)
 *   complete         → (terminal)
 *   failed           → (terminal)
 *
 * Identity moves (from === to) are always treated as legal idempotent
 * re-saves.
 */

import type { GoalRunStatus } from "./goal-run-audit";

export type { GoalRunStatus };

/**
 * Allowed forward transitions, keyed by current status.
 * Terminal states map to an empty array.
 */
export const LEGAL_TRANSITIONS: Readonly<
  Record<GoalRunStatus, ReadonlyArray<GoalRunStatus>>
> = Object.freeze({
  awaiting_data: Object.freeze(["analysing", "blocked", "failed"]) as ReadonlyArray<GoalRunStatus>,
  analysing: Object.freeze([
    "pending_approval",
    "executing",
    "awaiting_data",
    "blocked",
    "failed",
  ]) as ReadonlyArray<GoalRunStatus>,
  pending_approval: Object.freeze([
    "executing",
    "blocked",
    "failed",
  ]) as ReadonlyArray<GoalRunStatus>,
  executing: Object.freeze(["measuring", "failed", "blocked"]) as ReadonlyArray<GoalRunStatus>,
  measuring: Object.freeze([
    "analysing",
    "complete",
    "failed",
    "blocked",
  ]) as ReadonlyArray<GoalRunStatus>,
  complete: Object.freeze([]) as ReadonlyArray<GoalRunStatus>,
  failed: Object.freeze([]) as ReadonlyArray<GoalRunStatus>,
  blocked: Object.freeze(["analysing", "failed"]) as ReadonlyArray<GoalRunStatus>,
});

/**
 * Thrown by {@link assertLegalTransition} when a caller attempts to move a
 * goal run from `from` to `to` that is not present in
 * {@link LEGAL_TRANSITIONS}.
 */
export class IllegalTransitionError extends Error {
  public readonly from: GoalRunStatus;
  public readonly to: GoalRunStatus;

  constructor(from: GoalRunStatus, to: GoalRunStatus) {
    super(`Illegal goal-run status transition: ${from} → ${to}`);
    this.name = "IllegalTransitionError";
    this.from = from;
    this.to = to;
    // Maintain prototype chain in transpiled output.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Throws {@link IllegalTransitionError} if moving from `from` to `to` is not
 * permitted. Identity moves (`from === to`) are always allowed.
 */
export function assertLegalTransition(
  from: GoalRunStatus,
  to: GoalRunStatus,
): void {
  if (from === to) return;
  const allowed = LEGAL_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new IllegalTransitionError(from, to);
  }
}
