/**
 * Goal-agent validation worker (Phase 5b / step 14 of
 * `.gg/plans/platform-feature-test-swarm.md`).
 *
 * The goal agents are the highest-risk automation in the platform — the
 * `executing` state pushes real negatives to a live Google Ads account via
 * `dispatchApply("nkl-push-live", …)` and green-tier actions auto-execute with
 * NO human approval. This worker drives the WHOLE runtime
 * (`state-machine` → `check-risk-tier` → `runGoalAgentsTick` → handler
 * lifecycle → `watchdog` → `escalations`) against an **in-memory mock Payload**
 * with an **injected clock**, so the 7-day measuring cooling-off can be
 * time-travelled rather than waited out.
 *
 * What it asserts (every check emits a {@link ScenarioResult}):
 *   - GA-V-LIFECYCLE  : full lifecycle awaiting_data → analysing →
 *                       pending_approval → executing → measuring →
 *                       analysing(loop) → complete, driven by injected clock.
 *   - GA-V-RISK       : risk-tier gating — green nkl-push-live auto-executes,
 *                       and a budget action OVER the green-safe cap is NOT
 *                       auto-executed (routed to approval); brand/protected →
 *                       black/blocked.
 *   - GA-V-DISPATCH   : DEFAULT-SAFE — stub `dispatchApply("nkl-push-live")`,
 *                       assert the runtime calls it with the EXACT approved
 *                       `proposedPayload`, stamps the snapshot `applied`,
 *                       transitions to `measuring`, and sets the cooling-off.
 *   - GA-V-AUDIT      : goal-run-snapshots audit trail captures
 *                       proposedPayload / modifiedPayload / riskTier / status /
 *                       blockReason for full decision reconstruction.
 *   - GA-V-ESCALATION : entering pending_approval fans out bell notifications;
 *                       leaving it clears them.
 *   - GA-V-WATCHDOG   : a seeded day-over-day spend anomaly is detected and an
 *                       activity-log row is written.
 *   - GA-V-SCHEDULER  : unknown goal type → failed; handler throw → failed;
 *                       the tick never throws upward.
 *   - GA-V-LIVE-PUSH  : DANGER + gated — `skipped-danger` by DEFAULT. ONLY with
 *                       `--allow-live-push` (and the Safety Interlock) does it
 *                       run ONE real green-tier push against the allow-listed
 *                       campaign `search_cro-audit-tool_au` / account
 *                       `659-101-3898` and cross-check the negatives landed via
 *                       the same Growth Tools read used in Phase 5.
 *
 * The worker plugs into the swarm as the `goal-agent` role and also ships a
 * standalone runner (`main()`).
 *
 * Run standalone (default — fully safe, never touches a live account):
 *   npx tsx --env-file=.env --env-file=.env.local \
 *     scripts/test-harness/workers/goal-agent-validation.ts --date 2026-06-16
 *
 * Run with the gated live push (the ONE real account write this swarm performs):
 *   npx tsx --env-file=.env --env-file=.env.local \
 *     scripts/test-harness/workers/goal-agent-validation.ts \
 *     --date 2026-06-16 --allow-live-push
 */

import {
  SafetyInterlock,
  type Scenario,
  type WorkerContext,
  type WorkerExecutor,
} from '../coordinator';
import type { ScenarioResult } from '../result-schema';
import { appendResult, makeRunDir } from '../result-schema';
import { authedFetch } from '../auth';
import { ensureAdminLogin, makeResult } from './shared';

import type { Payload } from 'payload';
import { runGoalAgentsTick } from '../../../src/lib/goal-agents/scheduler';
import { runWatchdog } from '../../../src/lib/goal-agents/watchdog';
import {
  checkRiskTier,
  type TierDefinition,
} from '../../../src/lib/goal-agents/check-risk-tier';
import { GOAL_KEY } from '../../../src/lib/goal-agents/goal-types/search-term-waste-reducer';
import {
  dispatchApply,
  registerApplyHandler,
  type ApplyHandler,
} from '../../../src/lib/agents/_shared/apply-dispatcher';

// ── Fixtures / constants ────────────────────────────────────────────────────

/** Injected base clock — every time-dependent runtime call uses this. */
const CLOCK_T0 = new Date('2026-06-04T00:00:00Z');
/** The measuring cooling-off window the runtime sets (mirrors COOLING_OFF_MS). */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Whitelisted live Google Ads account (dashed + digits-only forms). */
const ALLOWLISTED_ACCOUNT_DASHED = '659-101-3898';
const ALLOWLISTED_CUSTOMER_ID = '6591013898';
/** The ONLY campaign a live green-tier negative push may target. */
const ALLOWLISTED_CAMPAIGN = 'search_cro-audit-tool_au';

const NEGATIVE_SWEEP_APPLY = '/api/google-ads/negative-sweep/apply';
const SEARCH_TERMS_READ = '/api/google-ads/search-terms';

const LIVE_ENV_DEPS = ['TEST_ADMIN_PASSWORD', 'GROWTH_TOOLS_URL', 'INTERNAL_API_KEY'];

// ── In-memory mock Payload ──────────────────────────────────────────────────

type Doc = Record<string, unknown> & { id: number };

/** Monotonic createdAt base so `-createdAt` sort tracks insertion order. */
const CREATE_EPOCH = Date.parse('2000-01-01T00:00:00Z');

interface WhereLeaf {
  equals?: unknown;
  not_in?: unknown[];
  in?: unknown[];
  less_than_equal?: unknown;
  greater_than_equal?: unknown;
  exists?: boolean;
}
type Where = { and?: Where[]; or?: Where[] } & Record<string, WhereLeaf>;

function leafMatches(value: unknown, leaf: WhereLeaf): boolean {
  if ('equals' in leaf) {
    if (String(value) !== String(leaf.equals)) return false;
  }
  if (leaf.not_in) {
    if (leaf.not_in.some((x) => String(x) === String(value))) return false;
  }
  if (leaf.in) {
    if (!leaf.in.some((x) => String(x) === String(value))) return false;
  }
  if ('less_than_equal' in leaf) {
    if (value == null) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!((value as any) <= (leaf.less_than_equal as any))) return false;
  }
  if ('greater_than_equal' in leaf) {
    if (value == null) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!((value as any) >= (leaf.greater_than_equal as any))) return false;
  }
  if ('exists' in leaf) {
    const present = value !== undefined && value !== null;
    if (leaf.exists ? !present : present) return false;
  }
  return true;
}

function whereMatches(doc: Doc, where: Where | undefined): boolean {
  if (!where) return true;
  if (Array.isArray(where.and)) {
    if (!where.and.every((w) => whereMatches(doc, w))) return false;
  }
  if (Array.isArray(where.or)) {
    if (!where.or.some((w) => whereMatches(doc, w))) return false;
  }
  for (const [key, leaf] of Object.entries(where)) {
    if (key === 'and' || key === 'or') continue;
    if (!leafMatches(doc[key], leaf as WhereLeaf)) return false;
  }
  return true;
}

function sortDocs(docs: Doc[], sort: string | undefined): Doc[] {
  if (!sort) return docs;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return [...docs].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    let c = 0;
    if (av == null && bv == null) c = 0;
    else if (av == null) c = -1;
    else if (bv == null) c = 1;
    else if (av < bv) c = -1;
    else if (av > bv) c = 1;
    return desc ? -c : c;
  });
}

interface FindArgs {
  collection: string;
  where?: Where;
  sort?: string;
  limit?: number;
}

/**
 * Minimal Payload local-API stand-in backed by in-memory collections. Supports
 * exactly the find / findByID / create / update / delete surface the goal-agent
 * runtime exercises, plus a no-op logger. Cast to {@link Payload}.
 */
class MockPayload {
  private store = new Map<string, Doc[]>();
  private nextId = 1;
  private seq = 0;

  readonly logger = {
    error: (..._args: unknown[]) => {},
    warn: (..._args: unknown[]) => {},
    info: (..._args: unknown[]) => {},
  };

  /** Direct seed — bypasses createdAt bookkeeping for pre-existing rows. */
  seed(collection: string, doc: Omit<Doc, 'id'> & { id?: number }): Doc {
    const id = doc.id ?? this.nextId++;
    if (id >= this.nextId) this.nextId = id + 1;
    const row: Doc = {
      createdAt: new Date(CREATE_EPOCH + this.seq++ * 1000).toISOString(),
      ...doc,
      id,
    };
    this.collection(collection).push(row);
    return row;
  }

  /** Read the live (mutable) row from the store, or undefined. */
  row(collection: string, id: number): Doc | undefined {
    return this.collection(collection).find((d) => d.id === id);
  }

  rows(collection: string): Doc[] {
    return this.collection(collection);
  }

  private collection(name: string): Doc[] {
    let arr = this.store.get(name);
    if (!arr) {
      arr = [];
      this.store.set(name, arr);
    }
    return arr;
  }

  // ── Payload surface ──────────────────────────────────────────────────────

  async find(args: FindArgs): Promise<{
    docs: Doc[];
    totalDocs: number;
    hasNextPage: boolean;
    totalPages: number;
    page: number;
  }> {
    const matched = this.collection(args.collection).filter((d) =>
      whereMatches(d, args.where),
    );
    const sorted = sortDocs(matched, args.sort);
    const limit = args.limit;
    const limited = limit === 0 || limit == null ? sorted : sorted.slice(0, limit);
    return {
      docs: limited.map((d) => structuredClone(d)),
      totalDocs: matched.length,
      hasNextPage: false,
      totalPages: 1,
      page: 1,
    };
  }

  async findByID(args: { collection: string; id: number | string }): Promise<Doc> {
    const id = typeof args.id === 'number' ? args.id : Number(args.id);
    const doc = this.row(args.collection, id);
    if (!doc) {
      const err = new Error(
        `Not Found: ${args.collection}#${args.id}`,
      ) as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    return structuredClone(doc);
  }

  async create(args: { collection: string; data: Record<string, unknown> }): Promise<Doc> {
    const id = this.nextId++;
    const row: Doc = {
      ...args.data,
      id,
      createdAt: new Date(CREATE_EPOCH + this.seq++ * 1000).toISOString(),
    };
    this.collection(args.collection).push(row);
    return structuredClone(row);
  }

  async update(args: {
    collection: string;
    id: number | string;
    data: Record<string, unknown>;
  }): Promise<Doc> {
    const id = typeof args.id === 'number' ? args.id : Number(args.id);
    const doc = this.row(args.collection, id);
    if (!doc) throw new Error(`Not Found: ${args.collection}#${args.id}`);
    Object.assign(doc, args.data);
    return structuredClone(doc);
  }

  async delete(args: { collection: string; where?: Where }): Promise<{ docs: Doc[] }> {
    const arr = this.collection(args.collection);
    const removed: Doc[] = [];
    for (let i = arr.length - 1; i >= 0; i--) {
      if (whereMatches(arr[i], args.where)) {
        removed.unshift(arr[i]);
        arr.splice(i, 1);
      }
    }
    return { docs: removed };
  }

  asPayload(): Payload {
    return this as unknown as Payload;
  }
}

// ── Seed helpers ────────────────────────────────────────────────────────────

interface SeedOptions {
  /** brandKeywords on the client (terms containing these are rejected). */
  brandKeywords?: string;
  /** Risk tiers loaded by the handler. Empty → defaults to red (approval). */
  tiers?: Array<{
    tier: 'green' | 'yellow' | 'red' | 'black';
    autoExecute: boolean;
    requiresApproval: boolean;
    maxBudgetImpactDollars?: number | null;
    allowedActionTypes?: string[];
  }>;
  /** Customer id on the seeded client. */
  customerId?: string;
  clientId?: number;
}

/** Build a mock DB seeded with a client, a fresh search-term snapshot, tiers. */
function seedDb(opts: SeedOptions = {}): { db: MockPayload; clientId: number } {
  const db = new MockPayload();
  const clientId = opts.clientId ?? 1;

  db.seed('users', { email: 'tester@example.com' });

  db.seed('clients', {
    id: clientId,
    name: 'ZZ Test Client',
    brandKeywords: opts.brandKeywords ?? 'acme',
    competitorKeywords: 'rivalco',
    googleAdsCustomerId: opts.customerId ?? ALLOWLISTED_CUSTOMER_ID,
  });

  // Fresh search-term snapshot. capturedAt uses the REAL clock because the
  // snapshot reader computes staleness against Date.now(), independent of the
  // injected scheduler clock.
  db.seed('google-ads-snapshots', {
    client: clientId,
    level: 'search_term',
    customerId: opts.customerId ?? ALLOWLISTED_CUSTOMER_ID,
    capturedAt: new Date().toISOString(),
    rowCount: 5,
    rows: [
      // Negatable: zero conv, ≥3 clicks, non-brand, non-competitor, non-high-intent.
      { term: 'free widget clipart', impressions: 200, clicks: 12, spend: 40, conversions: 0, cpa: null },
      { term: 'widget diy tutorial', impressions: 150, clicks: 8, spend: 30, conversions: 0, cpa: null },
      // Brand → rejected.
      { term: 'acme widget login', impressions: 90, clicks: 6, spend: 18, conversions: 0, cpa: null },
      // Already converting → skipped.
      { term: 'widget consulting service', impressions: 60, clicks: 5, spend: 20, conversions: 2, cpa: 10 },
      // Too few clicks → skipped.
      { term: 'widget zzz one off', impressions: 10, clicks: 1, spend: 2, conversions: 0, cpa: null },
    ],
  });

  for (const t of opts.tiers ?? []) {
    db.seed('goal-risk-tiers', {
      tier: t.tier,
      autoExecute: t.autoExecute,
      requiresApproval: t.requiresApproval,
      maxBudgetImpactDollars: t.maxBudgetImpactDollars ?? null,
      allowedActionTypes: (t.allowedActionTypes ?? []).map((a) => ({ actionType: a })),
    });
  }

  return { db, clientId };
}

/** Seed a goal-run row in `awaiting_data`, ready for the scheduler to pick up. */
function seedGoalRun(
  db: MockPayload,
  clientId: number,
  overrides: Partial<Doc> = {},
): number {
  const run = db.seed('goal-runs', {
    client: clientId,
    goal: GOAL_KEY,
    status: 'awaiting_data',
    iterationsCount: 0,
    nextCheckAt: null,
    coolingOffUntil: null,
    ...overrides,
  });
  return run.id;
}

// ── dispatchApply stub (DEFAULT SAFE — no live account write) ────────────────

interface DispatchCall {
  proposalType: string;
  payload: Record<string, unknown>;
  approvalId: number;
}

/**
 * Register a capturing stub for `nkl-push-live`. Returns the call log and a
 * disposer that does nothing (the registry is last-write-wins; re-register per
 * scenario). The stub never touches Growth Tools or a live account.
 */
function installDispatchStub(): { calls: DispatchCall[] } {
  const calls: DispatchCall[] = [];
  const stub: ApplyHandler = async (payload, ctx) => {
    calls.push({ proposalType: 'nkl-push-live', payload, approvalId: ctx.approvalId });
    const keywords = Array.isArray(payload.keywords) ? payload.keywords : [];
    return {
      message: `STUB applied ${keywords.length} negatives (no live write)`,
      detail: { stub: true, pushedCount: keywords.length },
    };
  };
  registerApplyHandler('nkl-push-live', stub);
  return { calls };
}

// ── Lifecycle driver (injected-clock time-travel) ───────────────────────────

interface DriveResult {
  transitions: string[];
  finalStatus: string;
  ticks: number;
}

/**
 * Drive a single goal-run to a terminal state, advancing the injected clock to
 * each row's `nextCheckAt` (+1m) so the 7-day measuring cooling-off is
 * time-travelled. Auto-approves any pending approval-queue rows. Optionally
 * mutates the snapshot on the measuring tick of the first loop so a second
 * measuring meets the success-reduction threshold and completes.
 */
async function driveToTerminal(
  db: MockPayload,
  runId: number,
  opts: { autoApprove?: boolean; collapseSecondMeasure?: boolean } = {},
): Promise<DriveResult> {
  const transitions: string[] = [];
  let clock = new Date(CLOCK_T0);
  let ticks = 0;

  for (let i = 0; i < 60; i++) {
    const run = db.row('goal-runs', runId);
    if (!run) break;

    // Simulate a human approving the queued proposal.
    if (opts.autoApprove && run.status === 'pending_approval') {
      approveLatestApproval(db, runId);
    }

    // Force the SECOND measuring cycle to succeed: zero the spend on the
    // negated terms just before measuring, so currentWasted ≪ baselineWasted.
    if (
      opts.collapseSecondMeasure &&
      run.status === 'measuring' &&
      (run.iterationsCount as number) === 1
    ) {
      zeroSnapshotSpend(db, run.client as number);
    }

    const summary = await runGoalAgentsTick(db.asPayload(), clock);
    ticks++;
    for (const d of summary.details) {
      if (d.goalRunId === runId) transitions.push(`${d.fromStatus}->${d.toStatus}`);
    }

    const after = db.row('goal-runs', runId);
    if (!after) break;
    if (after.status === 'complete' || after.status === 'failed') {
      return { transitions, finalStatus: String(after.status), ticks };
    }

    // Advance the clock to whenever this row next wants to be checked.
    const nextAt = after.nextCheckAt ? new Date(String(after.nextCheckAt)) : clock;
    const advanced = Math.max(nextAt.getTime(), clock.getTime()) + 60_000;
    clock = new Date(advanced);
  }

  const final = db.row('goal-runs', runId);
  return { transitions, finalStatus: String(final?.status ?? 'unknown'), ticks };
}

function approveLatestApproval(db: MockPayload, runId: number): void {
  const approvals = db
    .rows('agent-approval-queue')
    .filter((a) => String(a.agentRunId) === String(runId) && a.status === 'pending');
  const latest = approvals.sort((a, b) =>
    String(a.createdAt) < String(b.createdAt) ? 1 : -1,
  )[0];
  if (latest) latest.status = 'approved';
}

function zeroSnapshotSpend(db: MockPayload, clientId: number): void {
  for (const snap of db.rows('google-ads-snapshots')) {
    if (String(snap.client) !== String(clientId)) continue;
    if (snap.level !== 'search_term') continue;
    const rows = snap.rows as Array<{ spend?: number }> | undefined;
    if (Array.isArray(rows)) for (const r of rows) r.spend = 0;
  }
}

/** Does `seq` contain `sub` as an in-order (not necessarily contiguous) subsequence? */
function containsSubsequence(seq: string[], sub: string[]): boolean {
  let i = 0;
  for (const step of seq) {
    if (step === sub[i]) i++;
    if (i === sub.length) return true;
  }
  return i === sub.length;
}

// ── Scenario builders ───────────────────────────────────────────────────────

function scenario(id: string, surface: string, sideEffect: Scenario['sideEffect']): Scenario {
  return {
    featId: id,
    scenarioId: id,
    domain: 'goal-agents',
    surface,
    sideEffect,
    role: 'goal-agent',
    isAllowlistedLivePush: id === 'GA-V-LIVE-PUSH',
    file: 'goal-agents.md',
  };
}

const SCENARIOS: Scenario[] = [
  scenario('GA-V-LIFECYCLE', 'runGoalAgentsTick lifecycle (injected clock)', 'CMS-WRITE'),
  scenario('GA-V-RISK', 'check-risk-tier gating (pure)', 'READ'),
  scenario('GA-V-DISPATCH', 'executing → dispatchApply("nkl-push-live") stub', 'CMS-WRITE'),
  scenario('GA-V-AUDIT', 'goal-run-snapshots audit trail', 'CMS-WRITE'),
  scenario('GA-V-ESCALATION', 'escalations fan-out / clear on pending_approval', 'CMS-WRITE'),
  scenario('GA-V-WATCHDOG', 'watchdog anomaly detection', 'CMS-WRITE'),
  scenario('GA-V-SCHEDULER', 'scheduler resilience (unknown type / handler throw)', 'CMS-WRITE'),
  scenario(
    'GA-V-LIVE-PUSH',
    `live green-tier push → ${ALLOWLISTED_CAMPAIGN} / ${ALLOWLISTED_ACCOUNT_DASHED}`,
    'DANGER',
  ),
];

// ── Scenario executors ──────────────────────────────────────────────────────

async function runLifecycle(s: Scenario): Promise<ScenarioResult> {
  // No matching green tier → nkl-push-live defaults to red → pending_approval.
  const { db, clientId } = seedDb({ tiers: [] });
  const runId = seedGoalRun(db, clientId);
  installDispatchStub();

  const { transitions, finalStatus, ticks } = await driveToTerminal(db, runId, {
    autoApprove: true,
    collapseSecondMeasure: true,
  });

  const expectedChain = [
    'awaiting_data->analysing',
    'analysing->pending_approval',
    'pending_approval->executing',
    'executing->measuring',
    'measuring->analysing',
    'analysing->pending_approval',
    'pending_approval->executing',
    'executing->measuring',
    'measuring->complete',
  ];
  const ok =
    finalStatus === 'complete' && containsSubsequence(transitions, expectedChain);

  return makeResult(s, {
    steps: [
      'Seed client + fresh search-term snapshot + goal-run (awaiting_data).',
      'Drive runGoalAgentsTick with the injected clock, time-travelling the 7-day cooling-off.',
      'Auto-approve the queued proposal; force the 2nd measuring to meet the reduction target.',
      'Assert the full lifecycle incl. the measuring→analysing loop ending in complete.',
    ],
    expected:
      'awaiting_data→analysing→pending_approval→executing→measuring→analysing(loop)→…→complete',
    observed: `final=${finalStatus} after ${ticks} ticks; transitions=[${transitions.join(', ')}]`,
    status: ok ? 'pass' : 'fail',
    triage: ok ? null : 'PROD-BUG',
    notes:
      'Cooling-off (7d) is time-travelled via the injected clock; no real waiting. The loop proves the measuring→analysing re-analysis path.',
    evidence: transitions.join(' | '),
    envDeps: [],
  });
}

function runRiskGating(s: Scenario): ScenarioResult {
  const greenNkl: TierDefinition = {
    tier: 'green',
    maxBudgetImpactDollars: 0,
    allowedActionTypes: ['nkl-push-live'],
    requiresApproval: false,
    autoExecute: true,
  };
  // Budget-impacting actions are routed to a yellow tier whose cap is the
  // green-safe budget ceiling. Over-cap → approval; within-cap → auto.
  const yellowBudget: TierDefinition = {
    tier: 'yellow',
    maxBudgetImpactDollars: 100,
    allowedActionTypes: ['budget-update'],
    requiresApproval: false,
    autoExecute: true,
  };
  const tiers = [greenNkl, yellowBudget];
  const failures: string[] = [];

  // 1. Green-tier nkl-push-live (no budget impact) auto-executes.
  const green = checkRiskTier({
    proposal: { actionType: 'nkl-push-live', campaignIds: ['c1'] },
    clientTiers: tiers,
    isBrandCampaign: false,
    isProtectedCampaign: false,
  });
  if (green.escalation !== 'auto_execute' || !green.autoExecute) {
    failures.push(`green nkl-push-live did not auto_execute (got ${green.escalation})`);
  }

  // 2. CRITICAL: a budget action OVER the green-safe cap is NOT auto-executed.
  const overCap = checkRiskTier({
    proposal: { actionType: 'budget-update', budgetImpact: 5000, campaignIds: ['c2'] },
    clientTiers: tiers,
    isBrandCampaign: false,
    isProtectedCampaign: false,
  });
  if (overCap.autoExecute || overCap.escalation !== 'queue_for_approval') {
    failures.push(`over-cap budget action auto-executed (got ${overCap.escalation})`);
  }

  // 3. Within-cap budget action auto-executes (cap boundary works both ways).
  const withinCap = checkRiskTier({
    proposal: { actionType: 'budget-update', budgetImpact: 50, campaignIds: ['c3'] },
    clientTiers: tiers,
    isBrandCampaign: false,
    isProtectedCampaign: false,
  });
  if (!withinCap.autoExecute || withinCap.escalation !== 'auto_execute') {
    failures.push(`within-cap budget action was not auto_executed (got ${withinCap.escalation})`);
  }

  // 4. Brand campaign → black tier, blocked, even with tiers present.
  const black = checkRiskTier({
    proposal: { actionType: 'nkl-push-live', campaignIds: ['brand'] },
    clientTiers: tiers,
    isBrandCampaign: true,
    isProtectedCampaign: false,
  });
  if (black.tier !== 'black' || black.escalation !== 'blocked') {
    failures.push('brand campaign was not black-tier blocked');
  }

  // 5. Protected campaign → black, blocked.
  const protectedCheck = checkRiskTier({
    proposal: { actionType: 'nkl-push-live', campaignIds: ['protected'] },
    clientTiers: tiers,
    isBrandCampaign: false,
    isProtectedCampaign: true,
  });
  if (protectedCheck.tier !== 'black' || protectedCheck.escalation !== 'blocked') {
    failures.push('protected campaign was not black-tier blocked');
  }

  const ok = failures.length === 0;
  return makeResult(s, {
    steps: [
      'Green nkl-push-live (no budget impact) → auto_execute.',
      'Budget action OVER the green-safe cap → queue_for_approval (never auto-executed).',
      'Budget action WITHIN cap → auto_execute.',
      'Brand / protected campaigns → black tier, blocked.',
    ],
    expected:
      'Green auto-executes; over-cap budget actions are gated; brand/protected are blocked.',
    observed: ok ? 'All five gating assertions held.' : failures.join('; '),
    status: ok ? 'pass' : 'fail',
    triage: ok ? null : 'PROD-BUG',
    notes:
      'maxBudgetImpactDollars gates the budget-impacting (yellow) path per GoalRiskTiers — the green tier is reserved for zero-budget actions like nkl-push-live. The over-cap assertion is the critical "not auto-executed" safety gate.',
    evidence: ok ? undefined : failures.join('\n'),
    envDeps: [],
  });
}

async function runDispatchWiring(s: Scenario): Promise<ScenarioResult> {
  // Green tier matching nkl-push-live → analysing auto-executes (no approval).
  const { db, clientId } = seedDb({
    tiers: [
      {
        tier: 'green',
        autoExecute: true,
        requiresApproval: false,
        maxBudgetImpactDollars: 0,
        allowedActionTypes: ['nkl-push-live'],
      },
    ],
  });
  const runId = seedGoalRun(db, clientId);
  const { calls } = installDispatchStub();

  // Drive only until measuring is first reached (stop before the cooling-off
  // loop so we inspect the executing → measuring hand-off precisely).
  let clock = new Date(CLOCK_T0);
  for (let i = 0; i < 8; i++) {
    await runGoalAgentsTick(db.asPayload(), clock);
    const run = db.row('goal-runs', runId);
    if (!run) break;
    if (run.status === 'measuring') break;
    const nextAt = run.nextCheckAt ? new Date(String(run.nextCheckAt)) : clock;
    clock = new Date(Math.max(nextAt.getTime(), clock.getTime()) + 60_000);
  }

  const run = db.row('goal-runs', runId);
  const snap = db
    .rows('goal-run-snapshots')
    .filter((d) => String(d.goalRun) === String(runId))
    .sort((a, b) => (String(a.createdAt) < String(b.createdAt) ? 1 : -1))[0];

  const failures: string[] = [];

  // (a) dispatchApply called exactly once with the EXACT approved payload.
  if (calls.length !== 1) {
    failures.push(`expected 1 dispatchApply call, got ${calls.length}`);
  }
  const snapProposed = (snap?.proposedPayload ?? null) as Record<string, unknown> | null;
  if (calls[0] && snapProposed) {
    if (JSON.stringify(calls[0].payload) !== JSON.stringify(snapProposed)) {
      failures.push('dispatchApply payload did not match the snapshot proposedPayload');
    }
  } else {
    failures.push('missing dispatch call or snapshot proposedPayload');
  }

  // (b) snapshot stamped applied + modifiedPayload from the dispatcher result.
  if (snap?.status !== 'applied') failures.push(`snapshot status=${snap?.status}, expected applied`);
  const mod = (snap?.modifiedPayload ?? null) as Record<string, unknown> | null;
  if (!mod || typeof mod.message !== 'string' || !String(mod.message).includes('STUB')) {
    failures.push('snapshot modifiedPayload did not capture the dispatcher result');
  }

  // (c) transitioned to measuring + cooling-off set to exactly +7 days.
  if (run?.status !== 'measuring') failures.push(`run status=${run?.status}, expected measuring`);
  const coolingOff = run?.coolingOffUntil ? new Date(String(run.coolingOffUntil)).getTime() : NaN;
  const appliedAt = mod && typeof mod.appliedAt === 'string' ? new Date(mod.appliedAt).getTime() : NaN;
  if (!Number.isFinite(coolingOff)) {
    failures.push('coolingOffUntil was not set');
  } else if (Number.isFinite(appliedAt) && coolingOff - appliedAt !== SEVEN_DAYS_MS) {
    failures.push(`cooling-off window ${coolingOff - appliedAt}ms ≠ 7 days`);
  }

  const ok = failures.length === 0;
  return makeResult(s, {
    steps: [
      'Seed a green-tier client so nkl-push-live auto-executes (no approval).',
      'Stub dispatchApply("nkl-push-live") — never touches a live account.',
      'Drive ticks to the executing → measuring hand-off.',
      'Assert exact approved payload, snapshot applied, measuring transition, +7d cooling-off.',
    ],
    expected:
      'dispatchApply receives the exact snapshot proposedPayload; snapshot=applied; run=measuring; cooling-off=+7d.',
    observed: ok
      ? `1 dispatch call, payload matched, snapshot applied, measuring, cooling-off +7d.`
      : failures.join('; '),
    status: ok ? 'pass' : 'fail',
    triage: ok ? null : 'PROD-BUG',
    notes:
      'DEFAULT-SAFE: proves the executing-state wiring + payload integrity without writing to a real Google Ads account.',
    evidence: snapProposed ? JSON.stringify(snapProposed).slice(0, 600) : undefined,
    envDeps: [],
  });
}

async function runAuditTrail(s: Scenario): Promise<ScenarioResult> {
  const { db, clientId } = seedDb({ tiers: [] }); // red → pending_approval
  const runId = seedGoalRun(db, clientId);
  installDispatchStub();
  await driveToTerminal(db, runId, { autoApprove: true, collapseSecondMeasure: true });

  const snaps = db.rows('goal-run-snapshots').filter((d) => String(d.goalRun) === String(runId));
  const failures: string[] = [];

  if (snaps.length === 0) failures.push('no goal-run-snapshots written');

  for (const snap of snaps) {
    if (!('riskTier' in snap)) failures.push(`snapshot #${snap.id} missing riskTier`);
    if (!('status' in snap)) failures.push(`snapshot #${snap.id} missing status`);
    if (!('proposedPayload' in snap)) failures.push(`snapshot #${snap.id} missing proposedPayload`);
    if (!('modifiedPayload' in snap)) failures.push(`snapshot #${snap.id} missing modifiedPayload field`);
    if (!('blockReason' in snap)) failures.push(`snapshot #${snap.id} missing blockReason field`);
  }

  // At least one snapshot must be the applied executing step with modifiedPayload set.
  const applied = snaps.find((sn) => sn.status === 'applied' && sn.modifiedPayload != null);
  if (!applied) failures.push('no applied snapshot with modifiedPayload (executing step)');
  // Every snapshot must carry a classified riskTier (set at proposal time and
  // preserved through the applied stamp).
  const tiered = snaps.find((sn) => typeof sn.riskTier === 'string' && sn.riskTier.length > 0);
  if (!tiered) failures.push('no snapshot carrying a riskTier');

  const ok = failures.length === 0;
  return makeResult(s, {
    steps: [
      'Run the full lifecycle (approval path) under the injected clock.',
      'Read every goal-run-snapshots row for the run.',
      'Assert each carries proposedPayload / modifiedPayload / riskTier / status / blockReason.',
    ],
    expected:
      'Every decision step is reconstructable from goal-run-snapshots; the executing step is stamped applied with modifiedPayload.',
    observed: ok
      ? `${snaps.length} snapshot(s); audit fields present; applied + proposed steps found.`
      : failures.join('; '),
    status: ok ? 'pass' : 'fail',
    triage: ok ? null : 'PROD-BUG',
    notes: 'This is the human-reviewable decision history for an unattended run.',
    evidence: JSON.stringify(
      snaps.map((sn) => ({ step: sn.step, status: sn.status, riskTier: sn.riskTier })),
    ),
    envDeps: [],
  });
}

async function runEscalation(s: Scenario): Promise<ScenarioResult> {
  const { db, clientId } = seedDb({ tiers: [] }); // red → pending_approval
  const runId = seedGoalRun(db, clientId);
  installDispatchStub();

  const failures: string[] = [];
  let clock = new Date(CLOCK_T0);

  // Drive until the run enters pending_approval.
  for (let i = 0; i < 6; i++) {
    await runGoalAgentsTick(db.asPayload(), clock);
    const run = db.row('goal-runs', runId);
    if (run?.status === 'pending_approval') break;
    const nextAt = run?.nextCheckAt ? new Date(String(run.nextCheckAt)) : clock;
    clock = new Date(Math.max(nextAt.getTime(), clock.getTime()) + 60_000);
  }

  const enteredPending = db.row('goal-runs', runId)?.status === 'pending_approval';
  const fannedOut = db
    .rows('notifications')
    .filter((n) => n.kind === 'goal-run-escalation' && String(n.relatedGoalRun) === String(runId));
  if (!enteredPending) failures.push('run did not reach pending_approval');
  if (fannedOut.length === 0) failures.push('no escalation notifications fanned out on pending_approval');

  // Approve and advance one cycle so the run leaves pending_approval.
  approveLatestApproval(db, runId);
  const run = db.row('goal-runs', runId);
  const nextAt = run?.nextCheckAt ? new Date(String(run.nextCheckAt)) : clock;
  clock = new Date(Math.max(nextAt.getTime(), clock.getTime()) + 60_000);
  await runGoalAgentsTick(db.asPayload(), clock);

  const leftPending = db.row('goal-runs', runId)?.status !== 'pending_approval';
  const remaining = db
    .rows('notifications')
    .filter((n) => n.kind === 'goal-run-escalation' && String(n.relatedGoalRun) === String(runId));
  if (!leftPending) failures.push('run never left pending_approval');
  if (remaining.length !== 0) failures.push(`escalation notifications not cleared (${remaining.length} left)`);

  const ok = failures.length === 0;
  return makeResult(s, {
    steps: [
      'Drive the run into pending_approval.',
      'Assert a goal-run-escalation notification fanned out to every user.',
      'Approve + advance so the run leaves pending_approval.',
      'Assert the escalation notifications were cleared.',
    ],
    expected:
      'Entering pending_approval fans out bell notifications; leaving it clears them.',
    observed: ok
      ? `fanned out ${fannedOut.length}, cleared to 0 on exit.`
      : failures.join('; '),
    status: ok ? 'pass' : 'fail',
    triage: ok ? null : 'PROD-BUG',
    notes: 'Escalation side-effects are best-effort inside the tick; the bell must light and clear.',
    envDeps: [],
  });
}

async function runWatchdogCheck(s: Scenario): Promise<ScenarioResult> {
  const db = new MockPayload();
  const clientId = 1;
  db.seed('clients', { id: clientId, name: 'ZZ Test Client', googleAdsCustomerId: ALLOWLISTED_CUSTOMER_ID });

  const now = new Date(CLOCK_T0);
  // Previous day: modest spend. Latest: spend > +60% (critical) — anomaly.
  db.seed('google-ads-snapshots', {
    client: clientId,
    level: 'campaign',
    customerId: ALLOWLISTED_CUSTOMER_ID,
    capturedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    rows: [{ campaignName: 'search', spend: 100, conversions: 10 }],
  });
  db.seed('google-ads-snapshots', {
    client: clientId,
    level: 'campaign',
    customerId: ALLOWLISTED_CUSTOMER_ID,
    capturedAt: now.toISOString(),
    rows: [{ campaignName: 'search', spend: 250, conversions: 9 }],
  });

  const summary = await runWatchdog(db.asPayload(), now);
  const activity = db.rows('activity-log').filter((a) => a.type === 'google_ads_anomaly_detected');

  const ok = summary.anomaliesFound >= 1 && activity.length >= 1;
  return makeResult(s, {
    steps: [
      'Seed two campaign snapshots one day apart with a +150% spend jump.',
      'Run runWatchdog with the injected clock.',
      'Assert the spend anomaly is detected and an activity-log row is written.',
    ],
    expected: 'Watchdog detects the day-over-day spend anomaly and logs it.',
    observed: `clientsChecked=${summary.clientsChecked} anomaliesFound=${summary.anomaliesFound} activityRows=${activity.length}`,
    status: ok ? 'pass' : 'fail',
    triage: ok ? null : 'PROD-BUG',
    notes:
      'The watchdog is an independent read-only anomaly detector; it never mutates goal-runs and never calls Growth Tools.',
    evidence: JSON.stringify(summary.details),
    envDeps: [],
  });
}

async function runSchedulerResilience(s: Scenario): Promise<ScenarioResult> {
  const { db, clientId } = seedDb({ tiers: [] });
  // Run A: unknown goal type → must be marked failed.
  const unknownRun = db.seed('goal-runs', {
    client: clientId,
    goal: 'no-such-goal-type',
    status: 'analysing',
    iterationsCount: 0,
    nextCheckAt: null,
  });
  // Run B: known goal type whose handler throws (client doc missing → load throws).
  db.seed('google-ads-snapshots', {
    client: 999,
    level: 'search_term',
    customerId: ALLOWLISTED_CUSTOMER_ID,
    capturedAt: new Date().toISOString(),
    rowCount: 1,
    rows: [{ term: 'free widget thing', impressions: 100, clicks: 9, spend: 25, conversions: 0, cpa: null }],
  });
  const throwingRun = db.seed('goal-runs', {
    client: 999, // no clients doc with id 999 → loadClientLite findByID throws
    goal: GOAL_KEY,
    status: 'analysing',
    iterationsCount: 0,
    nextCheckAt: null,
  });

  const failures: string[] = [];
  let summary: Awaited<ReturnType<typeof runGoalAgentsTick>> | null = null;
  try {
    summary = await runGoalAgentsTick(db.asPayload(), new Date(CLOCK_T0));
  } catch (err) {
    failures.push(`tick threw upward: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (db.row('goal-runs', unknownRun.id)?.status !== 'failed') {
    failures.push('unknown goal type was not marked failed');
  }
  if (db.row('goal-runs', throwingRun.id)?.status !== 'failed') {
    failures.push('handler throw did not mark the run failed');
  }
  if (summary && summary.failed < 2) {
    failures.push(`expected ≥2 failed in summary, got ${summary.failed}`);
  }

  const ok = failures.length === 0;
  return makeResult(s, {
    steps: [
      'Seed a goal-run with an unknown goal type.',
      'Seed a known-type run whose handler throws (missing client doc).',
      'Run a single tick and assert both are marked failed and the tick never throws upward.',
    ],
    expected: 'Unknown type → failed; handler throw → failed; runGoalAgentsTick never throws.',
    observed: ok
      ? `both runs failed; summary.failed=${summary?.failed}; tick did not throw.`
      : failures.join('; '),
    status: ok ? 'pass' : 'fail',
    triage: ok ? null : 'PROD-BUG',
    notes: 'A per-row failure must never abort the batch — the scheduler is fail-soft by contract.',
    evidence: summary ? JSON.stringify(summary) : undefined,
    envDeps: [],
  });
}

/**
 * GA-V-LIVE-PUSH — the ONE real account write this swarm may perform, and only
 * under `--allow-live-push` + the Safety Interlock. Pushes a single green-tier
 * negative to the allow-listed campaign/account, then cross-checks via the same
 * Growth Tools search-terms read used in Phase 5. `skipped-danger` by default.
 */
async function runLivePush(s: Scenario, ctx: WorkerContext): Promise<ScenarioResult> {
  const verdict = ctx.interlock.evaluate({
    kind: 'google-ads-push',
    account: ALLOWLISTED_CUSTOMER_ID,
    campaign: ALLOWLISTED_CAMPAIGN,
  });

  if (!ctx.allowLivePush || !verdict.allowed) {
    return makeResult(s, {
      steps: [
        'Check the Safety Interlock for a live green-tier negative push.',
        'Default: no --allow-live-push opt-in → do NOT touch a live account.',
      ],
      expected:
        'No live write occurs unless --allow-live-push is passed and the target is the allow-listed campaign/account.',
      observed: `skipped — ${verdict.reason}`,
      status: 'skipped-danger',
      triage: null,
      notes:
        'This is the only place the swarm performs a real Google Ads write; it stays mocked unless explicitly opted in.',
      envDeps: LIVE_ENV_DEPS,
    });
  }

  // Opt-in path: perform the single allow-listed live push and cross-check.
  const login = await ensureAdminLogin();
  if (!login.ok) {
    return makeResult(s, {
      steps: ['Authenticate as admin to drive the live push + cross-check read.'],
      expected: 'Admin session established.',
      observed: `blocked — admin login failed: ${login.reason}`,
      status: 'blocked',
      triage: 'DEV-CONFIG',
      notes: 'Live push requires an authenticated session and Growth Tools wiring in this env.',
      envDeps: LIVE_ENV_DEPS,
    });
  }

  // Fail-closed re-assert at the moment of the write.
  ctx.interlock.assert({
    kind: 'google-ads-push',
    account: ALLOWLISTED_CUSTOMER_ID,
    campaign: ALLOWLISTED_CAMPAIGN,
  });

  // A single, deliberately-narrow green-tier negative for the live cross-check.
  const liveNegative = { keyword: 'free cro audit tool clipart', matchType: 'PHRASE' };
  const steps: string[] = [
    `Interlock permitted: live push to ${ALLOWLISTED_CAMPAIGN} / ${ALLOWLISTED_ACCOUNT_DASHED}.`,
    `POST ${NEGATIVE_SWEEP_APPLY} with one negative (${liveNegative.keyword}).`,
    `GET ${SEARCH_TERMS_READ} (same Growth Tools read as Phase 5) to confirm it landed.`,
  ];

  try {
    const applyRes = await authedFetch(NEGATIVE_SWEEP_APPLY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customerId: ALLOWLISTED_CUSTOMER_ID,
        campaign: ALLOWLISTED_CAMPAIGN,
        keywords: [liveNegative],
      }),
    });
    const applyBody = await applyRes.text();
    ctx.recordTeardown({
      collection: 'google-ads:negatives',
      id: `${ALLOWLISTED_CAMPAIGN}:${liveNegative.keyword}`,
      op: 'create',
      at: new Date().toISOString(),
      note: 'Live green-tier negative pushed under --allow-live-push; remove from the live account.',
    });

    if (!applyRes.ok) {
      return makeResult(s, {
        steps,
        expected: 'Negative-sweep apply succeeds against the allow-listed account.',
        observed: `apply HTTP ${applyRes.status}: ${applyBody.slice(0, 300)}`,
        status: 'fail',
        triage: applyRes.status >= 500 ? 'UNKNOWN' : 'DEV-CONFIG',
        notes: 'Live push attempted; the apply endpoint did not confirm success.',
        evidence: applyBody.slice(0, 600),
        envDeps: LIVE_ENV_DEPS,
      });
    }

    // Cross-check via the same Growth Tools read used in Phase 5 validation.
    const readRes = await authedFetch(
      `${SEARCH_TERMS_READ}?customerId=${ALLOWLISTED_CUSTOMER_ID}`,
    );
    const readBody = await readRes.text();
    const landed = readRes.ok && readBody.toLowerCase().includes('cro audit tool');

    return makeResult(s, {
      steps,
      expected:
        'The pushed negative is reflected by an independent Growth Tools read (negatives landed).',
      observed: landed
        ? 'Live push confirmed via independent Growth Tools read.'
        : `cross-check inconclusive (read HTTP ${readRes.status}).`,
      status: landed ? 'pass' : 'fail',
      triage: landed ? null : 'UNKNOWN',
      notes:
        'The single real green-tier push the swarm performs, gated behind --allow-live-push and the Safety Interlock.',
      evidence: `apply=${applyBody.slice(0, 300)} | read=${readBody.slice(0, 300)}`,
      envDeps: LIVE_ENV_DEPS,
    });
  } catch (err) {
    return makeResult(s, {
      steps,
      expected: 'Live push + cross-check complete without an unexpected error.',
      observed: `error: ${err instanceof Error ? err.message : String(err)}`,
      status: 'fail',
      triage: 'UNKNOWN',
      notes: 'Live push raised an error — triage against prod Growth Tools wiring.',
      envDeps: LIVE_ENV_DEPS,
    });
  }
}

// ── Worker executor + router ────────────────────────────────────────────────

export const goalAgentValidationWorker: WorkerExecutor = async (s, ctx) => {
  switch (s.scenarioId) {
    case 'GA-V-LIFECYCLE':
      return runLifecycle(s);
    case 'GA-V-RISK':
      return runRiskGating(s);
    case 'GA-V-DISPATCH':
      return runDispatchWiring(s);
    case 'GA-V-AUDIT':
      return runAuditTrail(s);
    case 'GA-V-ESCALATION':
      return runEscalation(s);
    case 'GA-V-WATCHDOG':
      return runWatchdogCheck(s);
    case 'GA-V-SCHEDULER':
      return runSchedulerResilience(s);
    case 'GA-V-LIVE-PUSH':
      return runLivePush(s, ctx);
    default:
      return makeResult(s, {
        steps: ['Match scenario id to a goal-agent validation check.'],
        expected: 'A known GA-V-* scenario.',
        observed: `unknown scenario id "${s.scenarioId}"`,
        status: 'blocked',
        triage: null,
        notes: 'This worker only handles the GA-V-* goal-agent runtime scenarios.',
        envDeps: [],
      });
  }
};

// ── Standalone runner ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv;
  const dateArg = argv.find((a) => a.startsWith('--date='))?.slice('--date='.length);
  const flagDate = argv.indexOf('--date');
  const dateStr = dateArg ?? (flagDate >= 0 ? argv[flagDate + 1] : undefined);
  const date =
    dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? new Date(`${dateStr}T00:00:00Z`)
      : new Date();
  const allowLivePush = argv.includes('--allow-live-push');

  const runDir = makeRunDir(date);
  const ctx: WorkerContext = {
    runDir,
    interlock: new SafetyInterlock(allowLivePush),
    allowLivePush,
    recordTeardown: () => {},
  };

  const byStatus: Record<ScenarioResult['status'], number> = {
    pass: 0,
    fail: 0,
    blocked: 0,
    'skipped-danger': 0,
  };

  for (const s of SCENARIOS) {
    const result = await goalAgentValidationWorker(s, ctx);
    appendResult(runDir, result);
    byStatus[result.status] += 1;
    console.log(`${result.status.toUpperCase().padEnd(14)} ${s.scenarioId} — ${result.observed}`);
  }

  console.log(`\nRun directory: ${runDir}`);
  console.log(
    `Goal-agent validation: ${SCENARIOS.length} scenario(s) — ` +
      `pass ${byStatus.pass}, fail ${byStatus.fail}, blocked ${byStatus.blocked}, ` +
      `skipped-danger ${byStatus['skipped-danger']}.` +
      (allowLivePush ? ' (--allow-live-push ENABLED)' : ''),
  );
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  /goal-agent-validation\.ts$/.test(process.argv[1] ?? '');

if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
