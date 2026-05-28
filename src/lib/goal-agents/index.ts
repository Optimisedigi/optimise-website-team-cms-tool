/**
 * Barrel re-exports for the goal-agents library.
 *
 * Consumers should import from here rather than individual modules so the
 * surface is stable as internal structure evolves.
 */

export {
  computeSpendPaceStatus,
  type SpendPaceStatus,
  type SpendPaceState,
  type ComputeSpendPaceArgs,
} from "./spend-pacer";

export { getSpendPacerStatus, type GetSpendPacerStatusArgs } from "./get-spend-pacer-status";

export {
  getAccountHealthContract,
  isCampaignProtected,
  isBrandCampaign,
  type AccountHealthContract,
  type SpendPolicy,
  type PacingMode,
  type PacingWindow,
} from "./account-health-contract";

export {
  startGoalRun,
  recordGoalRunSnapshot,
  markGoalRunStatus,
  attachMeasurement,
  type GoalRunRef,
  type SnapshotRef,
  type GoalRunStatus,
  type GoalTier,
  type RiskTier,
  type SnapshotStatus,
  type StartGoalRunArgs,
  type RecordSnapshotArgs,
  type MarkStatusArgs,
  type AttachMeasurementArgs,
} from "./goal-run-audit";

export {
  LEGAL_TRANSITIONS,
  IllegalTransitionError,
  assertLegalTransition,
} from "./state-machine";

export {
  fanOutGoalRunEscalation,
  clearGoalRunEscalations,
  type EscalationInput,
} from "./escalations";
