/**
 * Goal type: search-term-waste-reducer
 *
 * Eliminates wasted Google Ads spend on zero-conversion search terms by
 * pushing matched negatives. Implemented as a pure per-state handler module:
 * the scheduler calls `tick(ctx)` once per goal-run iteration; the handler
 * dispatches on `ctx.goalRun.status` and returns a `TickResult` describing
 * the next state + when to be re-invoked.
 *
 * Lifecycle (see docs/goal-agents-architecture-and-build-plan.md §5.1):
 *
 *   awaiting_data → analysing → pending_approval → executing → measuring → complete
 *                       ↘ executing                                       ↘ analysing (loop)
 *
 * Intent classifier (per spec):
 *   1. Brand term?                           → reject
 *   2. Competitor brand?                     → flag for human review, don't auto-negate
 *   3. High commercial intent + 0 conv?      → escalate as conversion-tracking problem
 *   4. <3 clicks in window?                  → insufficient data, skip
 *   5. Recently added as positive keyword?   → conflict, skip (not yet implemented — TODO)
 *
 * Pure module: no LLM, no HTTP. All side-effects go through the injected
 * Payload instance + the apply-dispatcher. The cron/scheduler lives in the
 * next task; this module is what it will call.
 */

import type { Payload } from "payload";

import {
  recordGoalRunSnapshot,
  markGoalRunStatus,
  attachMeasurement,
  type GoalRunStatus,
  type RiskTier,
} from "../goal-run-audit";
import {
  checkRiskTier,
  type TierDefinition,
  type RiskTierLevel,
} from "../check-risk-tier";
import {
  getSearchTermSnapshot,
  type SearchTermSnapshotRow,
} from "../../google-ads-snapshots";
import { parseBrandTerms } from "../../brand-terms";
import { dispatchApply, type ApplyHandlerResult } from "../../agents/_shared/apply-dispatcher";

// ─── Module identifier ─────────────────────────────────────────────────────

export const GOAL_KEY = "search-term-waste-reducer";

// ─── Public context + return types ─────────────────────────────────────────

/**
 * Minimal subset of the goal-runs row the handler reads. We deliberately
 * narrow the type rather than importing the full Payload-generated GoalRun
 * so tests can build fixtures without satisfying every CMS-only field.
 */
export interface GoalRunDoc {
  id: number;
  goal: string;
  status: GoalRunStatus;
  client: number;
  iterationsCount: number;
  coolingOffUntil?: string | null;
  nextCheckAt?: string | null;
}

export interface SearchTermWasteContext {
  payload: Payload;
  goalRun: GoalRunDoc;
  clientId: number;
  now: Date;
}

/**
 * What `tick()` returns to the scheduler. The scheduler is responsible for
 * persisting `nextCheckAt` and `coolingOffUntil` on the goal-runs row; the
 * handler only computes them.
 */
export interface TickResult {
  /** Status the goal-run is now in (may equal the prior status). */
  status: GoalRunStatus;
  /** When the scheduler should re-tick this run. ISO string. */
  nextCheckAt: string;
  /** Earliest time the next mutation may run. ISO string. Null = unchanged. */
  coolingOffUntil?: string | null;
  /** Set when iterationsCount changed (measuring → analysing loop). */
  iterationsCount?: number;
  /** Free-form summary for activity log / debugging. */
  note?: string;
}

// ─── Constants (tunable defaults; mirror §5.1 cadence) ─────────────────────

/** Re-poll for a fresh snapshot every 6h while awaiting_data. */
const AWAITING_DATA_BACKOFF_MS = 6 * 60 * 60 * 1000;
/** Re-poll for an approval decision every 6h. */
const PENDING_APPROVAL_BACKOFF_MS = 6 * 60 * 60 * 1000;
/** Measurement window after pushing negatives (§5.1: 7 days). */
const COOLING_OFF_MS = 7 * 24 * 60 * 60 * 1000;
/** Snapshot must be fresher than 24h to be usable. */
const SNAPSHOT_STALE_AFTER_MINUTES = 1440;
/** Minimum clicks before a zero-conversion term is actionable. */
const MIN_CLICKS_TO_NEGATE = 3;
/** Reduction target — measurement window concludes when this is hit. */
const SUCCESS_REDUCTION = 0.3;
/** Hard cap on observe→act→measure loops before we declare done. */
const MAX_ITERATIONS = 3;

/** High-commercial-intent tokens — terms containing these + 0 conv are escalated. */
const HIGH_INTENT_TOKENS = [
  "buy",
  "near me",
  "best",
  "cheap",
  "price",
  "pricing",
  "review",
  "reviews",
  "for sale",
];

// ─── Entry point ───────────────────────────────────────────────────────────

/**
 * Single entry point the scheduler invokes. Dispatches on `goalRun.status`.
 * Returns the next state + when to re-tick.
 */
export async function tick(ctx: SearchTermWasteContext): Promise<TickResult> {
  switch (ctx.goalRun.status) {
    case "awaiting_data":
      return handleAwaitingData(ctx);
    case "analysing":
      return handleAnalysing(ctx);
    case "pending_approval":
      return handlePendingApproval(ctx);
    case "executing":
      return handleExecuting(ctx);
    case "measuring":
      return handleMeasuring(ctx);
    case "complete":
    case "failed":
      // Terminal — scheduler should not invoke us, but be defensive.
      return {
        status: ctx.goalRun.status,
        nextCheckAt: ctx.now.toISOString(),
        note: `Goal run is terminal (${ctx.goalRun.status}); no-op.`,
      };
    case "blocked":
      // The blocked state is recovered manually — caller resumes by writing
      // status back to "analysing". Don't auto-recover here.
      return {
        status: "blocked",
        nextCheckAt: new Date(ctx.now.getTime() + AWAITING_DATA_BACKOFF_MS).toISOString(),
        note: "Blocked — waiting for manual resume.",
      };
    default:
      // Exhaustiveness fallback.
      throw new Error(`search-term-waste-reducer: unhandled status "${ctx.goalRun.status}"`);
  }
}

// ─── State: awaiting_data ──────────────────────────────────────────────────

async function handleAwaitingData(ctx: SearchTermWasteContext): Promise<TickResult> {
  const snapshot = await getSearchTermSnapshot(ctx.payload, {
    clientId: ctx.clientId,
    staleAfterMinutes: SNAPSHOT_STALE_AFTER_MINUTES,
  });

  if (!snapshot || snapshot.isStale) {
    const nextCheckAt = new Date(ctx.now.getTime() + AWAITING_DATA_BACKOFF_MS).toISOString();
    return {
      status: "awaiting_data",
      nextCheckAt,
      note: snapshot
        ? `Snapshot stale (age ${snapshot.ageMinutes}m); backing off ${AWAITING_DATA_BACKOFF_MS / 3_600_000}h.`
        : "No snapshot for client yet; backing off.",
    };
  }

  // Fresh snapshot available — flip to analysing and re-tick immediately.
  await markGoalRunStatus(ctx.payload, {
    goalRunId: ctx.goalRun.id,
    status: "analysing",
  });

  return {
    status: "analysing",
    nextCheckAt: ctx.now.toISOString(),
    note: `Fresh search-term snapshot available (age ${snapshot.ageMinutes}m); transitioning to analysing.`,
  };
}

// ─── State: analysing ──────────────────────────────────────────────────────

/** Result of classifying one search term. */
type Classification =
  | { kind: "negate"; matchType: "EXACT" | "PHRASE" }
  | { kind: "reject_brand" }
  | { kind: "review_competitor" }
  | { kind: "escalate_high_intent" }
  | { kind: "skip_low_clicks" }
  | { kind: "skip_has_conversions" };

interface ClientLite {
  id: number;
  brandKeywords?: string | null;
  competitorKeywords?: string | null;
}

function classifyTerm(
  row: SearchTermSnapshotRow,
  brandTerms: ReadonlyArray<string>,
  competitorTerms: ReadonlyArray<string>,
): Classification {
  const term = row.term.toLowerCase();

  // Rule 1: brand term → reject (never auto-negate brand)
  for (const b of brandTerms) {
    if (term.includes(b.toLowerCase())) return { kind: "reject_brand" };
  }

  // Rule 2: competitor brand → flag for human review (don't auto-negate)
  for (const c of competitorTerms) {
    if (term.includes(c.toLowerCase())) return { kind: "review_competitor" };
  }

  // Skip terms that already convert — they aren't waste.
  if ((row.conversions ?? 0) > 0) return { kind: "skip_has_conversions" };

  // Rule 3: high commercial intent + zero conversions → escalate (likely a
  // conversion-tracking issue, not a waste term)
  for (const tok of HIGH_INTENT_TOKENS) {
    if (term.includes(tok)) return { kind: "escalate_high_intent" };
  }

  // Rule 4: <3 clicks → not enough data
  if ((row.clicks ?? 0) < MIN_CLICKS_TO_NEGATE) return { kind: "skip_low_clicks" };

  // Default for zero-conv, ≥3 clicks, non-brand, non-competitor, non-high-intent:
  // negate as PHRASE match (broader catch than EXACT, narrower than BROAD).
  return { kind: "negate", matchType: "PHRASE" };
}

async function loadClientLite(payload: Payload, clientId: number): Promise<ClientLite> {
  const doc = (await payload.findByID({
    collection: "clients",
    id: clientId,
    overrideAccess: true,
    depth: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as { id: number; brandKeywords?: string | null; competitorKeywords?: string | null };
  return {
    id: doc.id,
    brandKeywords: doc.brandKeywords ?? null,
    competitorKeywords: doc.competitorKeywords ?? null,
  };
}

async function loadRiskTiers(payload: Payload): Promise<TierDefinition[]> {
  const res = await payload.find({
    // goal-risk-tiers may not be registered in payload.config.ts yet; cast to
    // bypass the union type. Safe at runtime since the slug matches the
    // collection's `slug:` value in src/collections/GoalRiskTiers.ts.
    collection: "goal-risk-tiers" as never,
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docs = res.docs as Array<any>;
  return docs.map((d) => ({
    tier: d.tier as RiskTierLevel,
    maxBudgetImpactDollars:
      typeof d.maxBudgetImpactDollars === "number" ? d.maxBudgetImpactDollars : null,
    allowedActionTypes: Array.isArray(d.allowedActionTypes)
      ? (d.allowedActionTypes as Array<{ actionType?: string }>)
          .map((a) => a?.actionType)
          .filter((s): s is string => typeof s === "string" && s.length > 0)
      : undefined,
    requiresApproval: Boolean(d.requiresApproval),
    autoExecute: Boolean(d.autoExecute),
  }));
}

/** Count snapshots already recorded under this goal-run (used as step #). */
async function countSnapshotsForRun(payload: Payload, goalRunId: number): Promise<number> {
  const res = await payload.find({
    collection: "goal-run-snapshots",
    where: { goalRun: { equals: goalRunId } },
    limit: 0,
    depth: 0,
    overrideAccess: true,
  });
  return typeof res.totalDocs === "number" ? res.totalDocs : res.docs.length;
}

async function handleAnalysing(ctx: SearchTermWasteContext): Promise<TickResult> {
  const snapshot = await getSearchTermSnapshot(ctx.payload, {
    clientId: ctx.clientId,
    staleAfterMinutes: SNAPSHOT_STALE_AFTER_MINUTES,
  });

  if (!snapshot || snapshot.isStale) {
    // Lost freshness between awaiting_data and analysing — bounce back.
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "awaiting_data",
    });
    return {
      status: "awaiting_data",
      nextCheckAt: new Date(ctx.now.getTime() + AWAITING_DATA_BACKOFF_MS).toISOString(),
      note: "Snapshot vanished or went stale during analysing; back to awaiting_data.",
    };
  }

  // Brand & competitor lists for the intent classifier.
  const client = await loadClientLite(ctx.payload, ctx.clientId);
  const brandTerms = parseBrandTerms(client.brandKeywords);
  // Competitor keywords use the same parser shape (free-text, separator-tolerant).
  const competitorTerms = parseBrandTerms(client.competitorKeywords);

  // Classify every row; collect negatable candidates + diagnostic counts.
  const candidates: Array<{ keyword: string; matchType: "EXACT" | "PHRASE" }> = [];
  const summary = {
    total: snapshot.rows.length,
    negate: 0,
    rejectBrand: 0,
    reviewCompetitor: 0,
    escalateHighIntent: 0,
    skipLowClicks: 0,
    skipHasConv: 0,
  };
  for (const row of snapshot.rows) {
    const c = classifyTerm(row, brandTerms, competitorTerms);
    switch (c.kind) {
      case "negate":
        candidates.push({ keyword: row.term, matchType: c.matchType });
        summary.negate += 1;
        break;
      case "reject_brand":
        summary.rejectBrand += 1;
        break;
      case "review_competitor":
        summary.reviewCompetitor += 1;
        break;
      case "escalate_high_intent":
        summary.escalateHighIntent += 1;
        break;
      case "skip_low_clicks":
        summary.skipLowClicks += 1;
        break;
      case "skip_has_conversions":
        summary.skipHasConv += 1;
        break;
    }
  }

  // No actionable candidates → mark the run complete; further looping would
  // burn the iteration counter for no benefit.
  if (candidates.length === 0) {
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "complete",
      completedAt: ctx.now.toISOString(),
    });
    return {
      status: "complete",
      nextCheckAt: ctx.now.toISOString(),
      note: `No actionable waste terms found; summary=${JSON.stringify(summary)}.`,
    };
  }

  // Tier classification — what kind of approval is required to push these?
  const tiers = await loadRiskTiers(ctx.payload);
  const tierResult = checkRiskTier({
    proposal: {
      actionType: "nkl-push-live",
      // No direct budget delta; we're reducing spend on negated terms.
      // Leave budgetImpact undefined so the yellow gate requires approval.
      campaignIds: [],
    },
    clientTiers: tiers,
    isBrandCampaign: false,
    isProtectedCampaign: false,
  });

  // Proposed payload — captured before the apply runs so the audit trail
  // has the full original proposal even if guardrails trim it later.
  const proposedPayload: Record<string, unknown> = {
    action: "nkl-push-live",
    scope: "account",
    matchType: "PHRASE",
    keywords: candidates,
    summary,
    snapshotCapturedAt: snapshot.capturedAt,
    snapshotRowCount: snapshot.rowCount,
    // Baseline cost of the terms we're about to negate — anchored for the
    // measurement step so we can compute wastedSpendReduction later.
    baselineWasted: candidates.reduce((acc, c) => {
      const r = snapshot.rows.find((x) => x.term === c.keyword);
      return acc + (r?.spend ?? 0);
    }, 0),
  };

  const step = (await countSnapshotsForRun(ctx.payload, ctx.goalRun.id)) + 1;

  // Auto-execute green-tier; queue everything else for approval.
  if (tierResult.escalation === "auto_execute") {
    await recordGoalRunSnapshot(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      step,
      action: "nkl-push-live",
      riskTier: tierResult.tier as RiskTier,
      status: "approved",
      proposedPayload,
    });
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "executing",
    });
    return {
      status: "executing",
      nextCheckAt: ctx.now.toISOString(),
      note: `${candidates.length} candidates classified, tier=${tierResult.tier} auto-executing.`,
    };
  }

  // Queue for approval — write an agent-approval-queue row directly. The
  // helpers in src/lib/agents/_shared/approval-queue.ts call getPayload()
  // internally and would double-initialise Payload here, so we use the
  // injected `ctx.payload.create` instead. This shape is identical to what
  // queueForApproval() produces.
  const approvalRow = (await ctx.payload.create({
    collection: "agent-approval-queue",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      title: `Search-term waste: ${candidates.length} negatives proposed`,
      agentName: GOAL_KEY,
      agentRunId: String(ctx.goalRun.id),
      proposalType: "nkl-push-live",
      proposalPayload: proposedPayload,
      status: "pending",
      client: ctx.clientId,
      rendered: {
        internalMarkdown:
          `**${candidates.length} negative keywords proposed.**\n\n` +
          `- Total search terms: ${summary.total}\n` +
          `- Rejected (brand): ${summary.rejectBrand}\n` +
          `- Flagged (competitor): ${summary.reviewCompetitor}\n` +
          `- Escalated (high-intent, 0 conv): ${summary.escalateHighIntent}\n` +
          `- Skipped (<3 clicks): ${summary.skipLowClicks}\n` +
          `- Skipped (already converting): ${summary.skipHasConv}\n` +
          `- **Negate:** ${summary.negate}\n`,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    overrideAccess: true,
  })) as { id: number };

  await recordGoalRunSnapshot(ctx.payload, {
    goalRunId: ctx.goalRun.id,
    step,
    action: "nkl-push-live",
    riskTier: tierResult.tier as RiskTier,
    status: "proposed",
    proposedPayload,
    approvalId: approvalRow.id,
  });

  await markGoalRunStatus(ctx.payload, {
    goalRunId: ctx.goalRun.id,
    status: "pending_approval",
  });

  return {
    status: "pending_approval",
    nextCheckAt: new Date(ctx.now.getTime() + PENDING_APPROVAL_BACKOFF_MS).toISOString(),
    note: `${candidates.length} candidates queued for approval (tier=${tierResult.tier}, approvalId=${approvalRow.id}).`,
  };
}

// ─── State: pending_approval ───────────────────────────────────────────────

interface LatestSnapshotForRun {
  id: number;
  approvalId?: number;
}

/** Find the most recent goal-run-snapshot row for this run. */
async function findLatestSnapshotForRun(
  payload: Payload,
  goalRunId: number,
): Promise<LatestSnapshotForRun | null> {
  const res = await payload.find({
    collection: "goal-run-snapshots",
    where: { goalRun: { equals: goalRunId } },
    sort: "-createdAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = res.docs?.[0] as any;
  if (!doc) return null;
  const approvalId = typeof doc.approval === "number"
    ? doc.approval
    : typeof doc.approval?.id === "number"
      ? doc.approval.id
      : undefined;
  return { id: doc.id as number, approvalId };
}

async function handlePendingApproval(ctx: SearchTermWasteContext): Promise<TickResult> {
  const latest = await findLatestSnapshotForRun(ctx.payload, ctx.goalRun.id);
  if (!latest || !latest.approvalId) {
    // Defensive — there should always be an approval row. Stay put.
    return {
      status: "pending_approval",
      nextCheckAt: new Date(ctx.now.getTime() + PENDING_APPROVAL_BACKOFF_MS).toISOString(),
      note: "No approval row found yet; waiting.",
    };
  }

  const approval = (await ctx.payload.findByID({
    collection: "agent-approval-queue",
    id: latest.approvalId,
    overrideAccess: true,
    depth: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as { id: number; status?: string };

  if (approval.status === "approved" || approval.status === "applied") {
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "executing",
    });
    return {
      status: "executing",
      nextCheckAt: ctx.now.toISOString(),
      note: `Approval #${approval.id} ${approval.status}; transitioning to executing.`,
    };
  }

  if (approval.status === "rejected") {
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "failed",
      error: `Approval #${approval.id} was rejected.`,
      completedAt: ctx.now.toISOString(),
    });
    return {
      status: "failed",
      nextCheckAt: ctx.now.toISOString(),
      note: `Approval #${approval.id} rejected; goal-run failed.`,
    };
  }

  // pending / failed / unknown — wait and re-poll.
  return {
    status: "pending_approval",
    nextCheckAt: new Date(ctx.now.getTime() + PENDING_APPROVAL_BACKOFF_MS).toISOString(),
    note: `Approval #${approval.id} still ${approval.status ?? "unknown"}; waiting.`,
  };
}

// ─── State: executing ──────────────────────────────────────────────────────

async function handleExecuting(ctx: SearchTermWasteContext): Promise<TickResult> {
  const latest = await findLatestSnapshotForRun(ctx.payload, ctx.goalRun.id);
  if (!latest) {
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "failed",
      error: "executing: no snapshot row to execute against.",
      completedAt: ctx.now.toISOString(),
    });
    return {
      status: "failed",
      nextCheckAt: ctx.now.toISOString(),
      note: "No snapshot to execute against.",
    };
  }

  // Fetch the proposedPayload from the snapshot row so we have the exact
  // candidate list the human approved.
  const snapshotDoc = (await ctx.payload.findByID({
    collection: "goal-run-snapshots",
    id: latest.id,
    overrideAccess: true,
    depth: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as { id: number; proposedPayload?: Record<string, unknown> };

  const proposedPayload = (snapshotDoc.proposedPayload ?? {}) as Record<string, unknown>;

  try {
    const result: ApplyHandlerResult = await dispatchApply(
      "nkl-push-live",
      proposedPayload,
      {
        payload: ctx.payload,
        approvalId: latest.approvalId ?? 0,
        // Goal-runs are unattended — userId 0 signals "system caller".
        userId: 0,
      },
    );

    // Stamp the snapshot row with applied + the dispatcher's returned detail.
    await ctx.payload.update({
      collection: "goal-run-snapshots",
      id: latest.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        status: "applied",
        modifiedPayload: {
          appliedAt: ctx.now.toISOString(),
          message: result.message ?? null,
          detail: result.detail ?? null,
        },
      } as any,
      overrideAccess: true,
    });

    const coolingOffUntil = new Date(ctx.now.getTime() + COOLING_OFF_MS).toISOString();

    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "measuring",
    });

    return {
      status: "measuring",
      nextCheckAt: coolingOffUntil,
      coolingOffUntil,
      note: `Applied successfully; measuring window ends ${coolingOffUntil}.`,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "failed",
      error: `nkl-push-live dispatch failed: ${errMsg}`,
      completedAt: ctx.now.toISOString(),
    });
    return {
      status: "failed",
      nextCheckAt: ctx.now.toISOString(),
      note: `Dispatch failed: ${errMsg}`,
    };
  }
}

// ─── State: measuring ──────────────────────────────────────────────────────

async function handleMeasuring(ctx: SearchTermWasteContext): Promise<TickResult> {
  const coolingOffUntil = ctx.goalRun.coolingOffUntil;
  if (coolingOffUntil) {
    const coolingOffTs = new Date(coolingOffUntil).getTime();
    if (Number.isFinite(coolingOffTs) && ctx.now.getTime() < coolingOffTs) {
      return {
        status: "measuring",
        nextCheckAt: coolingOffUntil,
        note: `Still in cooling-off; next check at ${coolingOffUntil}.`,
      };
    }
  }

  // Cooling-off window has elapsed (or was never set) — measure.
  const latest = await findLatestSnapshotForRun(ctx.payload, ctx.goalRun.id);
  if (!latest) {
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "failed",
      error: "measuring: no executing-step snapshot to measure against.",
      completedAt: ctx.now.toISOString(),
    });
    return {
      status: "failed",
      nextCheckAt: ctx.now.toISOString(),
      note: "No executing-step snapshot.",
    };
  }

  // Re-read the executing-step snapshot row for its proposedPayload (which
  // holds the baseline + list of negated keywords).
  const snapshotDoc = (await ctx.payload.findByID({
    collection: "goal-run-snapshots",
    id: latest.id,
    overrideAccess: true,
    depth: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as { id: number; proposedPayload?: Record<string, unknown> };

  const proposed = (snapshotDoc.proposedPayload ?? {}) as Record<string, unknown>;
  const negatedKeywords = Array.isArray(proposed.keywords)
    ? (proposed.keywords as Array<{ keyword?: string; matchType?: string }>)
    : [];
  const baselineWasted = typeof proposed.baselineWasted === "number" ? proposed.baselineWasted : 0;

  const fresh = await getSearchTermSnapshot(ctx.payload, {
    clientId: ctx.clientId,
    staleAfterMinutes: SNAPSHOT_STALE_AFTER_MINUTES,
  });

  if (!fresh) {
    // Can't measure without a fresh snapshot; back off and try again later.
    return {
      status: "measuring",
      nextCheckAt: new Date(ctx.now.getTime() + AWAITING_DATA_BACKOFF_MS).toISOString(),
      note: "No fresh snapshot for measurement; backing off.",
    };
  }

  // Current spend on the negated terms in the fresh snapshot.
  const negatedSet = new Set(
    negatedKeywords.map((k) => String(k.keyword ?? "").toLowerCase()).filter((s) => s.length > 0),
  );
  let currentWasted = 0;
  for (const row of fresh.rows) {
    if (negatedSet.has(row.term.toLowerCase())) currentWasted += row.spend ?? 0;
  }

  const wastedSpendReduction =
    baselineWasted > 0
      ? Math.max(0, (baselineWasted - currentWasted) / baselineWasted)
      : 0;

  const nextIterations = (ctx.goalRun.iterationsCount ?? 0) + 1;

  await attachMeasurement(ctx.payload, {
    snapshotId: latest.id,
    measuredAt: ctx.now.toISOString(),
    measuredResult: {
      wastedSpendReduction,
      baselineWasted,
      currentWasted,
      measuredAtIteration: nextIterations,
    },
  });

  // Stamp iterationsCount onto the run (the scheduler also passes it back via
  // TickResult.iterationsCount, but persist here so subsequent ticks see the
  // updated value even if the scheduler crashes between tick + persist).
  await ctx.payload.update({
    collection: "goal-runs",
    id: ctx.goalRun.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { iterationsCount: nextIterations } as any,
    overrideAccess: true,
  });

  // Success — reduction met, or we've burned the iteration budget.
  if (wastedSpendReduction >= SUCCESS_REDUCTION || nextIterations >= MAX_ITERATIONS) {
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "complete",
      completedAt: ctx.now.toISOString(),
    });
    return {
      status: "complete",
      nextCheckAt: ctx.now.toISOString(),
      iterationsCount: nextIterations,
      note:
        wastedSpendReduction >= SUCCESS_REDUCTION
          ? `Reduction ${(wastedSpendReduction * 100).toFixed(1)}% met target; complete.`
          : `Iteration cap (${MAX_ITERATIONS}) reached; complete with ${(wastedSpendReduction * 100).toFixed(1)}% reduction.`,
    };
  }

  // Loop — go back to analysing for another pass.
  await markGoalRunStatus(ctx.payload, {
    goalRunId: ctx.goalRun.id,
    status: "analysing",
  });
  return {
    status: "analysing",
    nextCheckAt: ctx.now.toISOString(),
    iterationsCount: nextIterations,
    note: `Reduction ${(wastedSpendReduction * 100).toFixed(1)}% < ${SUCCESS_REDUCTION * 100}%; looping to analysing (iteration ${nextIterations}/${MAX_ITERATIONS}).`,
  };
}
