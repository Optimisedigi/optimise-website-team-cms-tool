/**
 * Goal-type registry.
 *
 * Maps a goal-runs.goal identifier → the `tick(ctx)` function for that goal
 * type. The scheduler reads from this registry to dispatch every due goal-run
 * to its handler.
 *
 * New goal types must be added here. Keep the keys stable — they are written
 * to goal-runs.goal and live in approval-queue rows.
 *
 * Context shape note: every handler context has the same structural shape
 * (`payload`, `goalRun`, `clientId`, `now`). Their `GoalRunDoc` types differ
 * only in optional fields (account-efficiency adds optional `parameters`),
 * so a single scheduler-built doc satisfies both. We declare `GoalTickFn`
 * over the broadest context — the account-efficiency one — because every
 * field it expects is also present on the search-term-waste-reducer context.
 */

import {
  tick as searchTermWasteReducerTick,
  GOAL_KEY as SEARCH_TERM_WASTE_REDUCER_KEY,
  type SearchTermWasteContext,
  type TickResult,
  type GoalRunDoc as SearchTermWasteGoalRunDoc,
} from "./search-term-waste-reducer";

import {
  tick as accountEfficiencyTick,
  GOAL_KEY as ACCOUNT_EFFICIENCY_KEY,
  type AccountEfficiencyContext,
  type GoalRunDoc as AccountEfficiencyGoalRunDoc,
} from "./account-efficiency";

/**
 * Unified GoalRunDoc the scheduler builds and every handler accepts. It
 * carries every field any handler may read — extra fields are ignored by
 * handlers that don't need them. `parameters` is optional because pre-Step-11
 * goal-runs rows won't have it.
 */
export type GoalRunDoc = SearchTermWasteGoalRunDoc & AccountEfficiencyGoalRunDoc;

/**
 * Union of every handler's context. Each handler accepts at minimum the
 * common shape `{ payload, goalRun, clientId, now }`; dispatching by goal key
 * guarantees the right handler sees the right concrete shape at the call site.
 */
export type GoalTickFn = (
  ctx: SearchTermWasteContext | AccountEfficiencyContext,
) => Promise<TickResult>;

export const GOAL_TYPES: Readonly<Record<string, GoalTickFn>> = Object.freeze({
  [SEARCH_TERM_WASTE_REDUCER_KEY]: searchTermWasteReducerTick as GoalTickFn,
  [ACCOUNT_EFFICIENCY_KEY]: accountEfficiencyTick as GoalTickFn,
});

export type { SearchTermWasteContext, AccountEfficiencyContext, TickResult };
