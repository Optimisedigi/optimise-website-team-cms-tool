/**
 * Durable, resumable Meta Ad Library job for a client proposal.
 *
 * The Meta Ad Library scrape is the slowest/flakiest stage of the proposal
 * audit. Running the whole competitor list inside one Vercel invocation meant a
 * killed function discarded every result and stranded the proposal at
 * `metaAdsStatus = running`. This module replaces that with a durable job stored
 * in the proposal's `metaAdsJobState` JSON column:
 *
 * - Each worker invocation processes at most two competitors.
 * - Every competitor result is persisted to `competitor-analyses` before the
 *   cursor advances, so a crash re-fetches at most one item instead of losing all.
 * - A lease token prevents two workers doing the same batch.
 * - `jobId` prevents a stale worker writing into a newer refresh.
 * - Terminal state is `completed` (zero failures) or `failed` (>=1 failure).
 */

import { randomUUID } from "crypto";
import type { Payload } from "payload";
import { cleanMetaAdsDomain, fetchMetaAdsForCompetitor } from "@/lib/proposal-meta-ads";

export const META_ADS_BATCH_SIZE = 2;
// Lease must outlive a single worker invocation (worker maxDuration = 180s).
export const META_ADS_LEASE_MS = 200_000;
// How long a job may sit at "running" with a fresh heartbeat before recovery
// treats it as interrupted. Aligned with the lease window.
export const META_ADS_STALE_MS = META_ADS_LEASE_MS;
export const META_ADS_MAX_RECOVERY_ATTEMPTS = 2;
const ITEM_TIMEOUT_MS = 50_000;

export interface MetaAdsJobItem {
  index: number;
  domain: string;
}

export interface MetaAdsFailedItem {
  domain: string;
  error: string;
}

export interface MetaAdsJobState {
  version: 1;
  jobId: string;
  competitorAnalysisId: number | string;
  items: MetaAdsJobItem[];
  cursor: number;
  total: number;
  completed: number;
  failed: number;
  failedItems: MetaAdsFailedItem[];
  startedAt: string;
  completedAt: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  recoveryAttempts: number;
}

export interface MetaAdsProgress {
  jobId: string | null;
  completed: number;
  failed: number;
  processed: number;
  total: number;
  percent: number;
  startedAt: string | null;
  completedAt: string | null;
}

export function relationshipId(value: any): number | string | null {
  if (value == null) return null;
  if (typeof value === "object") return value.id ?? null;
  return value;
}

/** Validate and coerce a raw JSON column value into a versioned job state. */
export function parseJobState(raw: unknown): MetaAdsJobState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  if (s.version !== 1) return null;
  if (typeof s.jobId !== "string" || !s.jobId) return null;
  if (!Array.isArray(s.items)) return null;
  if (typeof s.cursor !== "number" || typeof s.total !== "number") return null;
  return {
    version: 1,
    jobId: s.jobId,
    competitorAnalysisId: (s.competitorAnalysisId as number | string) ?? "",
    items: (s.items as MetaAdsJobItem[]).map((it) => ({
      index: Number(it.index),
      domain: String(it.domain ?? ""),
    })),
    cursor: s.cursor,
    total: s.total,
    completed: typeof s.completed === "number" ? s.completed : 0,
    failed: typeof s.failed === "number" ? s.failed : 0,
    failedItems: Array.isArray(s.failedItems) ? (s.failedItems as MetaAdsFailedItem[]) : [],
    startedAt: typeof s.startedAt === "string" ? s.startedAt : new Date().toISOString(),
    completedAt: typeof s.completedAt === "string" ? s.completedAt : null,
    leaseToken: typeof s.leaseToken === "string" ? s.leaseToken : null,
    leaseExpiresAt: typeof s.leaseExpiresAt === "string" ? s.leaseExpiresAt : null,
    recoveryAttempts: typeof s.recoveryAttempts === "number" ? s.recoveryAttempts : 0,
  };
}

export function isJobTerminal(state: MetaAdsJobState | null): boolean {
  return Boolean(state && state.completedAt);
}

export function isLeaseExpired(state: MetaAdsJobState, now = Date.now()): boolean {
  if (!state.leaseToken || !state.leaseExpiresAt) return true;
  const expires = new Date(state.leaseExpiresAt).getTime();
  if (Number.isNaN(expires)) return true;
  return now >= expires;
}

export function computeProgress(state: MetaAdsJobState | null): MetaAdsProgress {
  if (!state) {
    return { jobId: null, completed: 0, failed: 0, processed: 0, total: 0, percent: 0, startedAt: null, completedAt: null };
  }
  const processed = state.completed + state.failed;
  const percent = state.total > 0 ? Math.round((processed / state.total) * 100) : 0;
  return {
    jobId: state.jobId,
    completed: state.completed,
    failed: state.failed,
    processed,
    total: state.total,
    percent,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
  };
}

function summarizeFailure(state: MetaAdsJobState): string {
  const domains = state.failedItems.map((f) => f.domain).filter(Boolean).slice(0, 10);
  const suffix = domains.length ? `: ${domains.join(", ")}` : "";
  return `Meta Ads finished with ${state.failed} of ${state.total} competitor(s) failed${suffix}. Use "Retry Meta Ads" to try again.`;
}

async function readProposal(payload: Payload, proposalId: number | string): Promise<any> {
  return payload.findByID({ collection: "client-proposals", id: proposalId as any, overrideAccess: true });
}

async function writeJobState(
  payload: Payload,
  proposalId: number | string,
  state: MetaAdsJobState,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await payload.update({
    collection: "client-proposals",
    id: proposalId as any,
    data: {
      metaAdsJobState: state as any,
      metaAdsUpdatedAt: new Date().toISOString(),
      ...extra,
    } as any,
    overrideAccess: true,
  });
}

/** Confirm this worker still owns the job (same jobId + lease token). */
async function stillOwns(
  payload: Payload,
  proposalId: number | string,
  jobId: string,
  leaseToken: string,
): Promise<MetaAdsJobState | null> {
  const proposal = await readProposal(payload, proposalId);
  const state = parseJobState(proposal.metaAdsJobState);
  if (!state || state.jobId !== jobId) return null;
  if (state.leaseToken !== leaseToken) return null;
  return state;
}

export interface InitResult {
  state: MetaAdsJobState;
  created: boolean;
  /** Whether the caller should dispatch a worker (new job or stale resume). */
  shouldDispatch: boolean;
  /** Job already terminal at init time (e.g. no competitors). */
  terminal: boolean;
}

/**
 * Initialize or resume a Meta Ads job for a proposal.
 * - Healthy running job (fresh lease): returns existing progress, no dispatch.
 * - Valid but stale running job (expired lease): resumes the SAME job.
 * - Terminal job / legacy stuck / no valid state: creates a new job snapshot.
 */
export async function initMetaAdsJob(
  payload: Payload,
  proposalId: number | string,
): Promise<InitResult> {
  const proposal = await readProposal(payload, proposalId);
  const competitorAnalysisId = relationshipId(proposal.competitorAnalysis);
  if (competitorAnalysisId == null) {
    throw new Error("No linked competitor analysis found for this proposal. Run the general audit first.");
  }

  const existing = parseJobState(proposal.metaAdsJobState);
  if (existing && !isJobTerminal(existing)) {
    // Resume an in-flight job rather than duplicating it. "Healthy" is judged by
    // heartbeat freshness, not the lease: between batches a worker releases the
    // lease and immediately dispatches the next one, so a null lease with a fresh
    // heartbeat is normal, not stuck.
    const age = metaHeartbeatAge(proposal);
    const stale = age == null || age > META_ADS_STALE_MS;
    return { state: existing, created: false, shouldDispatch: stale, terminal: false };
  }

  // Build a fresh snapshot from the linked competitor analysis.
  const analysis = await payload.findByID({
    collection: "competitor-analyses",
    id: competitorAnalysisId as any,
    overrideAccess: true,
  });
  const competitors = Array.isArray((analysis as any)?.competitors) ? (analysis as any).competitors : [];
  const items: MetaAdsJobItem[] = competitors
    .map((c: any, index: number) => ({
      index,
      domain: c?.domain ? cleanMetaAdsDomain(String(c.domain)) : "",
    }))
    .filter((it: MetaAdsJobItem) => Boolean(it.domain));

  const now = new Date().toISOString();
  const jobId = randomUUID();

  if (items.length === 0) {
    const state: MetaAdsJobState = {
      version: 1,
      jobId,
      competitorAnalysisId,
      items: [],
      cursor: 0,
      total: 0,
      completed: 0,
      failed: 0,
      failedItems: [],
      startedAt: now,
      completedAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
      recoveryAttempts: 0,
    };
    await writeJobState(payload, proposalId, state, {
      metaAdsStatus: "completed",
      metaAdsError: "No competitors to check.",
    });
    return { state, created: true, shouldDispatch: false, terminal: true };
  }

  const state: MetaAdsJobState = {
    version: 1,
    jobId,
    competitorAnalysisId,
    items,
    cursor: 0,
    total: items.length,
    completed: 0,
    failed: 0,
    failedItems: [],
    startedAt: now,
    completedAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    recoveryAttempts: 0,
  };
  await writeJobState(payload, proposalId, state, {
    metaAdsStatus: "running",
    metaAdsError: null,
  });
  return { state, created: true, shouldDispatch: true, terminal: false };
}

type ClaimResult =
  | { ok: true; state: MetaAdsJobState; leaseToken: string }
  | { ok: false; reason: "no-state" | "job-mismatch" | "terminal" | "busy" | "lost-race" };

/** Atomically-ish claim the job lease via write-then-reread ownership check. */
async function claimLease(
  payload: Payload,
  proposalId: number | string,
  expectedJobId?: string,
): Promise<ClaimResult> {
  const proposal = await readProposal(payload, proposalId);
  const state = parseJobState(proposal.metaAdsJobState);
  if (!state) return { ok: false, reason: "no-state" };
  if (expectedJobId && state.jobId !== expectedJobId) return { ok: false, reason: "job-mismatch" };
  if (isJobTerminal(state)) return { ok: false, reason: "terminal" };
  if (!isLeaseExpired(state)) return { ok: false, reason: "busy" };

  const leaseToken = randomUUID();
  const leased: MetaAdsJobState = {
    ...state,
    leaseToken,
    leaseExpiresAt: new Date(Date.now() + META_ADS_LEASE_MS).toISOString(),
  };
  await writeJobState(payload, proposalId, leased);

  // Re-read to confirm we won the race (last writer wins in SQLite).
  const confirmed = await stillOwns(payload, proposalId, state.jobId, leaseToken);
  if (!confirmed) return { ok: false, reason: "lost-race" };
  return { ok: true, state: confirmed, leaseToken };
}

export interface BatchResult {
  done: boolean;
  state: MetaAdsJobState | null;
  reason?: string;
  /** Whether the caller should dispatch the next worker batch. */
  shouldDispatch: boolean;
}

/**
 * Claim the lease, process at most two competitors, persist each before
 * advancing the cursor, and mark terminal status after the final item. Returns
 * whether the job is done and whether the caller should dispatch the next batch.
 */
export async function processNextBatch(
  payload: Payload,
  proposalId: number | string,
  opts?: { expectedJobId?: string },
): Promise<BatchResult> {
  const claim = await claimLease(payload, proposalId, opts?.expectedJobId);
  if (!claim.ok) {
    // busy => another worker owns it; do not dispatch a duplicate.
    // terminal/no-state/mismatch => nothing to do.
    return { done: claim.reason === "terminal", state: null, reason: claim.reason, shouldDispatch: false };
  }

  const { jobId, leaseToken } = { jobId: claim.state.jobId, leaseToken: claim.leaseToken };
  let state = claim.state;

  try {
    const batch = state.items.slice(state.cursor, state.cursor + META_ADS_BATCH_SIZE);

    for (const item of batch) {
      // Load the freshest competitor for stored social links.
      const analysis: any = await payload.findByID({
        collection: "competitor-analyses",
        id: state.competitorAnalysisId as any,
        overrideAccess: true,
      });
      const competitorsNow: any[] = Array.isArray(analysis?.competitors) ? analysis.competitors : [];
      const sourceCompetitor = competitorsNow[item.index] ?? { domain: item.domain };

      const outcome = await fetchMetaAdsForCompetitor(sourceCompetitor, { timeoutMs: ITEM_TIMEOUT_MS });

      // Stale-worker guard: bail before writing if a newer refresh took over.
      const owned = await stillOwns(payload, proposalId, jobId, leaseToken);
      if (!owned) {
        return { done: false, state: null, reason: "stale", shouldDispatch: false };
      }
      state = owned;

      if (outcome.ok) {
        // Re-read the analysis, merge by snapshotted index (domain must still
        // match) or fall back to a domain lookup, then persist before advancing.
        const latest: any = await payload.findByID({
          collection: "competitor-analyses",
          id: state.competitorAnalysisId as any,
          overrideAccess: true,
        });
        const competitors: any[] = Array.isArray(latest?.competitors) ? [...latest.competitors] : [];
        let target = item.index;
        const atIndex = competitors[item.index];
        if (!atIndex || cleanMetaAdsDomain(String(atIndex.domain ?? "")) !== item.domain) {
          target = competitors.findIndex(
            (c) => cleanMetaAdsDomain(String(c?.domain ?? "")) === item.domain,
          );
        }
        if (target >= 0 && competitors[target]) {
          const merged = { ...competitors[target], metaAds: outcome.metaAds };
          if (outcome.socialLinks) merged.socialLinks = outcome.socialLinks;
          competitors[target] = merged;
          await payload.update({
            collection: "competitor-analyses",
            id: state.competitorAnalysisId as any,
            data: { competitors } as any,
            overrideAccess: true,
          });
        }
        state = { ...state, completed: state.completed + 1 };
      } else {
        state = {
          ...state,
          failed: state.failed + 1,
          failedItems: [...state.failedItems, { domain: item.domain || outcome.domain, error: outcome.error }],
        };
      }

      // Advance the cursor and refresh the lease heartbeat.
      state = {
        ...state,
        cursor: state.cursor + 1,
        leaseExpiresAt: new Date(Date.now() + META_ADS_LEASE_MS).toISOString(),
      };
      await writeJobState(payload, proposalId, state);
    }

    if (state.cursor >= state.total) {
      return await finalize(payload, proposalId, state);
    }

    // Non-terminal: release the lease so the next fresh worker can claim it.
    state = { ...state, leaseToken: null, leaseExpiresAt: null };
    await writeJobState(payload, proposalId, state);
    return { done: false, state, shouldDispatch: true };
  } catch (err: any) {
    console.error(`[meta-ads-job] Batch error for proposal ${proposalId}:`, err?.message || err);
    // Confirm we still own the job before recording recovery state.
    const owned = await stillOwns(payload, proposalId, jobId, leaseToken);
    if (!owned) return { done: false, state: null, reason: "stale", shouldDispatch: false };

    const attempts = owned.recoveryAttempts + 1;
    if (attempts > META_ADS_MAX_RECOVERY_ATTEMPTS) {
      // Count remaining items as failed so processed == total at terminal.
      const failedState = failRemaining({ ...owned, recoveryAttempts: attempts });
      return await finalize(payload, proposalId, failedState, err?.message);
    }
    const retryState: MetaAdsJobState = {
      ...owned,
      recoveryAttempts: attempts,
      leaseToken: null,
      leaseExpiresAt: null,
    };
    await writeJobState(payload, proposalId, retryState);
    return { done: false, state: retryState, reason: "infra-retry", shouldDispatch: true };
  }
}

/** Mark every unprocessed item failed and jump the cursor to the end. */
function failRemaining(state: MetaAdsJobState): MetaAdsJobState {
  const remaining = state.items.slice(state.cursor);
  const appended: MetaAdsFailedItem[] = remaining.map((it) => ({
    domain: it.domain,
    error: "Not processed — job recovery exhausted",
  }));
  return {
    ...state,
    cursor: state.total,
    failed: state.failed + remaining.length,
    failedItems: [...state.failedItems, ...appended],
  };
}

/** Write the terminal completed/failed status in one guarded update. */
async function finalize(
  payload: Payload,
  proposalId: number | string,
  state: MetaAdsJobState,
  infraError?: string,
): Promise<BatchResult> {
  const terminal: MetaAdsJobState = {
    ...state,
    completedAt: new Date().toISOString(),
    leaseToken: null,
    leaseExpiresAt: null,
  };
  const hasFailures = terminal.failed > 0;
  await writeJobState(payload, proposalId, terminal, {
    metaAdsStatus: hasFailures ? "failed" : "completed",
    metaAdsError: hasFailures
      ? summarizeFailure(terminal)
      : infraError
        ? `Meta Ads failed: ${infraError}`
        : null,
  });
  return { done: true, state: terminal, shouldDispatch: false };
}

/** Age (ms) of the last job heartbeat, or null when there is no timestamp. */
export function metaHeartbeatAge(proposal: any, now = Date.now()): number | null {
  const ref = proposal?.metaAdsUpdatedAt;
  if (!ref) return null;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return null;
  return now - t;
}

export type MetaRecoveryOutcome = "none" | "healthy" | "resumed" | "failed";

/**
 * Recover a proposal whose Meta job may have stalled. Recovery is driven by the
 * heartbeat age (not the lease alone) so the normal between-batch lease handoff
 * is never mistaken for a stuck job. Returns what action was taken.
 */
export async function recoverStaleMetaJob(
  payload: Payload,
  proposal: any,
  origin?: string,
): Promise<MetaRecoveryOutcome> {
  const proposalId = proposal.id;
  const state = parseJobState(proposal.metaAdsJobState);
  const age = metaHeartbeatAge(proposal);
  const stale = age == null || age > META_ADS_STALE_MS;

  // Legacy proposal stuck at "running" with no valid durable state.
  if (!state) {
    if (proposal.metaAdsStatus !== "running") return "none";
    if (!stale) return "healthy";
    await payload.update({
      collection: "client-proposals",
      id: proposalId as any,
      data: {
        metaAdsStatus: "failed",
        metaAdsError:
          "Meta Ads was interrupted before durable progress was recorded. Use \"Retry Meta Ads\" to run it again.",
        metaAdsUpdatedAt: new Date().toISOString(),
      } as any,
      overrideAccess: true,
    });
    return "failed";
  }

  if (isJobTerminal(state)) return "none";
  if (!stale) return "healthy";

  if (state.recoveryAttempts >= META_ADS_MAX_RECOVERY_ATTEMPTS) {
    await finalize(payload, proposalId, failRemaining(state));
    return "failed";
  }

  const resumed: MetaAdsJobState = {
    ...state,
    recoveryAttempts: state.recoveryAttempts + 1,
    leaseToken: null,
    leaseExpiresAt: null,
  };
  await writeJobState(payload, proposalId, resumed);
  await dispatchMetaAdsWorker(proposalId, origin);
  return "resumed";
}

/** Sweep every proposal stuck at "running" and resume or fail its Meta job. */
export async function sweepStaleMetaJobs(
  payload: Payload,
): Promise<{ resumed: (number | string)[]; failed: (number | string)[] }> {
  const running = await payload.find({
    collection: "client-proposals",
    where: { metaAdsStatus: { equals: "running" } },
    limit: 100,
    overrideAccess: true,
  });
  const resumed: (number | string)[] = [];
  const failed: (number | string)[] = [];
  for (const proposal of running.docs as any[]) {
    try {
      const outcome = await recoverStaleMetaJob(payload, proposal);
      if (outcome === "resumed") resumed.push(proposal.id);
      else if (outcome === "failed") failed.push(proposal.id);
    } catch (err: any) {
      console.error(`[meta-ads-job] Recovery failed for proposal ${proposal.id}:`, err?.message || err);
    }
  }
  return { resumed, failed };
}

/**
 * Fire-and-forget dispatch of the internal worker route for the next batch.
 * Uses NEXT_PUBLIC_SERVER_URL, falling back to the current request origin.
 */
export async function dispatchMetaAdsWorker(
  proposalId: number | string,
  origin?: string,
): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SERVER_URL || origin;
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!base || !internalKey) {
    console.warn(
      `[meta-ads-job] Cannot dispatch worker for ${proposalId}: missing ${!base ? "server URL" : "INTERNAL_API_KEY"}. Watchdog will resume.`,
    );
    return false;
  }
  try {
    await fetch(`${base}/api/proposals/${proposalId}/refresh-meta-ads/worker`, {
      method: "POST",
      headers: { "x-internal-key": internalKey },
    });
    return true;
  } catch (err: any) {
    console.error(`[meta-ads-job] Worker dispatch failed for ${proposalId}:`, err?.message || err);
    return false;
  }
}
