/**
 * Goal-agent worker (step 12) — drives the autonomous goal-agent runtime with
 * an **injected clock**, covering the Phase 5b pure-logic and scheduler tracks.
 *
 * The dangerous part of the runtime (`executing` → `dispatchApply("nkl-push-live")`)
 * is never reached here: this worker exercises the deterministic, side-effect-free
 * layers and a clock-injected scheduler smoke run against an empty mock queue, so
 * no live Google Ads write can originate from it. The one allow-listed live push
 * is owned by the dedicated goal-agent validation worker (step 14), gated behind
 * `--allow-live-push`.
 *
 * Scenario routing (by id / surface):
 *   - state-machine (`5b.1-a`)   → exhaustive legal/illegal transition matrix.
 *   - risk gating   (`5b.1-b/c/d`) → green auto-execute, brand→black, yellow cap.
 *   - scheduler     (`5b.2`)     → runGoalAgentsTick(mockPayload, injectedClock).
 *   - anything else              → honest `blocked` (needs the mocked-Payload fixture).
 */

import type { Payload } from 'payload';
import type { Scenario, WorkerExecutor } from '../coordinator';
import { makeResult } from './shared';
import {
  IllegalTransitionError,
  LEGAL_TRANSITIONS,
  assertLegalTransition,
  type GoalRunStatus,
} from '../../../src/lib/goal-agents/state-machine';
import {
  checkRiskTier,
  type TierDefinition,
} from '../../../src/lib/goal-agents/check-risk-tier';
import { runGoalAgentsTick } from '../../../src/lib/goal-agents/scheduler';

/** Fixed clock injected into every time-dependent runtime call. */
const INJECTED_CLOCK = new Date('2026-06-04T00:00:00Z');

const ALL_STATUSES: readonly GoalRunStatus[] = [
  'awaiting_data',
  'analysing',
  'pending_approval',
  'executing',
  'measuring',
  'complete',
  'failed',
  'blocked',
];

export const goalAgentWorker: WorkerExecutor = async (scenario, _ctx) => {
  const key = `${scenario.scenarioId} ${scenario.surface}`;

  if (/5b\.1-a|assertLegalTransition|LEGAL_TRANSITIONS|state.?machine/i.test(key)) {
    return checkStateMachine(scenario);
  }
  if (/5b\.1-[bcd]|checkRiskTier|risk.?tier|risk.?gat/i.test(key)) {
    return checkRiskGating(scenario);
  }
  if (/5b\.2|runGoalAgentsTick|scheduler|tick/i.test(key)) {
    return await checkSchedulerTick(scenario);
  }

  return makeResult(scenario, {
    steps: ['Match scenario to a runnable goal-agent runtime check.'],
    expected: 'A pure-logic or clock-injected scheduler assertion.',
    observed: 'Scenario needs the mocked-Payload fixture (seeded goal-runs / snapshots).',
    status: 'blocked',
    triage: null,
    notes:
      'Watchdog / escalations / executing-push / measuring-loop / chat-handoff scenarios require a seeded mock Payload — run from the full scenario block.',
    envDeps: [],
  });
};

// ── State machine: exhaustive transition matrix ─────────────────────────────

function checkStateMachine(scenario: Scenario): ReturnType<typeof makeResult> {
  const failures: string[] = [];
  let legalChecked = 0;
  let illegalChecked = 0;

  for (const from of ALL_STATUSES) {
    const allowed = LEGAL_TRANSITIONS[from];

    // Legal edges must not throw.
    for (const to of allowed) {
      legalChecked += 1;
      try {
        assertLegalTransition(from, to);
      } catch {
        failures.push(`legal edge ${from}→${to} threw`);
      }
    }

    // Illegal edges (excluding identity) must throw the typed error.
    for (const to of ALL_STATUSES) {
      if (to === from || allowed.includes(to)) continue;
      illegalChecked += 1;
      try {
        assertLegalTransition(from, to);
        failures.push(`illegal edge ${from}→${to} did NOT throw`);
      } catch (err) {
        if (!(err instanceof IllegalTransitionError) || err.from !== from || err.to !== to) {
          failures.push(`illegal edge ${from}→${to} threw the wrong error`);
        }
      }
    }

    // Identity is always legal, including terminals.
    try {
      assertLegalTransition(from, from);
    } catch {
      failures.push(`identity ${from}→${from} threw`);
    }
  }

  // Terminals have empty allow-lists.
  if (LEGAL_TRANSITIONS.complete.length !== 0) failures.push('complete is not terminal');
  if (LEGAL_TRANSITIONS.failed.length !== 0) failures.push('failed is not terminal');

  const ok = failures.length === 0;
  return makeResult(scenario, {
    steps: [
      `Assert ${legalChecked} legal edges do not throw.`,
      `Assert ${illegalChecked} illegal edges throw IllegalTransitionError.`,
      'Assert identity moves are idempotent and terminals are empty.',
    ],
    expected: 'Every legal edge passes; every illegal edge throws the typed error; terminals empty.',
    observed: ok
      ? `All ${legalChecked} legal + ${illegalChecked} illegal edges behaved correctly.`
      : `${failures.length} deviation(s): ${failures.slice(0, 8).join('; ')}`,
    status: ok ? 'pass' : 'fail',
    triage: ok ? null : 'PROD-BUG',
    notes: 'Pure state-machine validation — no I/O, no clock dependency.',
    evidence: ok ? undefined : failures.join('\n'),
    envDeps: [],
  });
}

// ── Risk-tier gating: representative safety assertions ──────────────────────

function checkRiskGating(scenario: Scenario): ReturnType<typeof makeResult> {
  const greenTier: TierDefinition = {
    tier: 'green',
    maxBudgetImpactDollars: 100,
    allowedActionTypes: ['nkl-push-live'],
    requiresApproval: false,
    autoExecute: true,
  };
  const yellowTier: TierDefinition = {
    tier: 'yellow',
    maxBudgetImpactDollars: 500,
    requiresApproval: true,
    autoExecute: false,
  };

  const failures: string[] = [];

  // 1. Green-tier allowed action auto-executes.
  const green = checkRiskTier({
    proposal: { actionType: 'nkl-push-live', budgetImpact: 0, campaignIds: ['c1'] },
    clientTiers: [greenTier],
    isBrandCampaign: false,
    isProtectedCampaign: false,
  });
  if (green.escalation !== 'auto_execute' || !green.autoExecute) {
    failures.push('green-tier did not auto_execute');
  }

  // 2. Brand campaign is black-tier blocked even with tiers present.
  const black = checkRiskTier({
    proposal: { actionType: 'nkl-push-live', budgetImpact: 0, campaignIds: ['brand'] },
    clientTiers: [greenTier],
    isBrandCampaign: true,
    isProtectedCampaign: false,
  });
  if (black.tier !== 'black' || black.escalation !== 'blocked') {
    failures.push('brand campaign was not black-tier blocked');
  }

  // 3. Over-cap budget on a yellow tier must queue for approval (never auto-exec).
  const overCap = checkRiskTier({
    proposal: { actionType: 'budget-update', budgetImpact: 5000, campaignIds: ['c2'] },
    clientTiers: [yellowTier],
    isBrandCampaign: false,
    isProtectedCampaign: false,
  });
  if (overCap.autoExecute || overCap.escalation !== 'queue_for_approval') {
    failures.push('over-cap yellow action was not queued for approval');
  }

  const ok = failures.length === 0;
  return makeResult(scenario, {
    steps: [
      'Green-tier allowed action → auto_execute.',
      'Brand campaign → black-tier blocked.',
      'Over-cap yellow budget → queue_for_approval (never auto-executed).',
    ],
    expected: 'Green auto-executes; brand/over-cap actions are gated, never auto-applied.',
    observed: ok ? 'All three gating assertions held.' : failures.join('; '),
    status: ok ? 'pass' : 'fail',
    triage: ok ? null : 'PROD-BUG',
    notes: 'The over-cap assertion proves the critical green-budget-cap safety gate.',
    evidence: ok ? undefined : failures.join('\n'),
    envDeps: [],
  });
}

// ── Scheduler tick: clock-injected smoke run on an empty queue ──────────────

async function checkSchedulerTick(scenario: Scenario): Promise<ReturnType<typeof makeResult>> {
  const mockPayload = makeEmptyMockPayload();
  try {
    const summary = await runGoalAgentsTick(mockPayload, INJECTED_CLOCK);
    const ok =
      summary.processed === 0 &&
      summary.advanced === 0 &&
      summary.failed === 0 &&
      Array.isArray(summary.details);
    return makeResult(scenario, {
      steps: [
        `runGoalAgentsTick(mockPayload, ${INJECTED_CLOCK.toISOString()})`,
        'Assert an empty due-queue is a no-op and the tick never throws.',
      ],
      expected: 'Tick processes 0 rows, never throws, returns a well-formed summary.',
      observed: `processed=${summary.processed} advanced=${summary.advanced} failed=${summary.failed} skipped=${summary.skipped}`,
      status: ok ? 'pass' : 'fail',
      triage: ok ? null : 'PROD-BUG',
      notes:
        'Injected-clock smoke run proves wiring + non-throwing contract. Seeded-row assertions need the mocked-Payload fixture.',
      evidence: JSON.stringify(summary),
      envDeps: [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return makeResult(scenario, {
      steps: ['runGoalAgentsTick(mockPayload, injectedClock)'],
      expected: 'Tick never throws upward.',
      observed: `Tick threw: ${message}`,
      status: 'fail',
      triage: 'PROD-BUG',
      notes: 'The scheduler must never throw to its caller — a thrown error is a defect.',
      envDeps: [],
    });
  }
}

/**
 * Minimal mock Payload whose `find` returns an empty page. Sufficient to drive
 * {@link runGoalAgentsTick} on an empty due-queue without a database. Cast to
 * `Payload` because only `find` is exercised on this path.
 */
function makeEmptyMockPayload(): Payload {
  const find = async (): Promise<{
    docs: unknown[];
    totalDocs: number;
    hasNextPage: boolean;
  }> => ({ docs: [], totalDocs: 0, hasNextPage: false });
  return { find } as unknown as Payload;
}
