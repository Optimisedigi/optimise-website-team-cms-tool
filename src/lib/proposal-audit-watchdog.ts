import type { Payload } from "payload";

// A proposal audit runs inside a Vercel function capped at maxDuration = 300s
// (see run-audits/route.ts). If that function is killed before it can write the
// final status, the proposal is stranded at auditStatus = "running" forever and
// the UI shows "Previous audit appears stuck". Anything still "running" well
// past the function ceiling can only be a killed/abandoned run, so we flip it to
// "failed" to unblock re-runs.
export const PROPOSAL_AUDIT_STUCK_MS = 6 * 60 * 1000; // 6 min > 300s function cap

const STUCK_ERROR =
  "Audit timed out — the background job was terminated before it could finish (likely exceeded the function time limit). Safely re-run the audit.";

/**
 * Returns true when a proposal that is marked "running" has clearly been
 * abandoned (started longer ago than the function could possibly run).
 */
export function isProposalAuditStuck(
  proposal: { auditStatus?: string | null; auditStartedAt?: string | null; updatedAt?: string | null },
  now = Date.now(),
): boolean {
  if (proposal.auditStatus !== "running") return false;
  const ref = proposal.auditStartedAt || proposal.updatedAt;
  if (!ref) return false;
  const startedAt = new Date(ref).getTime();
  if (Number.isNaN(startedAt)) return false;
  return now - startedAt > PROPOSAL_AUDIT_STUCK_MS;
}

/**
 * Mark a single stuck proposal as failed. Best-effort — falls back to raw SQL if
 * the Payload update fails (mirrors run-audits' own fallback).
 */
export async function failStuckProposalAudit(payload: Payload, id: number | string): Promise<void> {
  const completedAt = new Date().toISOString();
  try {
    await payload.update({
      collection: "client-proposals",
      id: id as number,
      data: {
        auditStatus: "failed",
        auditProgress: "Timed out|100",
        auditCompletedAt: completedAt,
        auditError: STUCK_ERROR,
      } as any,
      overrideAccess: true,
    });
  } catch (err: any) {
    console.error(`[proposal-audit-watchdog] Payload update failed for ${id}, trying raw SQL:`, err?.message || err);
    const sqlClient = (payload.db as any).client;
    if (!sqlClient) throw err;
    await sqlClient.execute({
      sql: "UPDATE `client_proposals` SET `audit_status` = ?, `audit_progress` = ?, `audit_completed_at` = ?, `audit_error` = ? WHERE `id` = ?",
      args: ["failed", "Timed out|100", completedAt, STUCK_ERROR, id],
    });
  }
}

/**
 * Sweep every proposal stuck at "running" past the deadline and mark them
 * failed. Returns the ids that were recovered. Used by the cron watchdog.
 */
export async function sweepStuckProposalAudits(payload: Payload): Promise<(number | string)[]> {
  const cutoff = new Date(Date.now() - PROPOSAL_AUDIT_STUCK_MS).toISOString();
  const running = await payload.find({
    collection: "client-proposals",
    where: { auditStatus: { equals: "running" } },
    limit: 100,
    overrideAccess: true,
  });

  const recovered: (number | string)[] = [];
  for (const proposal of running.docs as any[]) {
    if (!isProposalAuditStuck(proposal)) continue;
    // extra guard: cutoff comparison against the started/updated timestamp
    const ref = proposal.auditStartedAt || proposal.updatedAt;
    if (ref && ref > cutoff) continue;
    try {
      await failStuckProposalAudit(payload, proposal.id);
      recovered.push(proposal.id);
      console.log(`[proposal-audit-watchdog] Recovered stuck proposal audit ${proposal.id}`);
    } catch (err: any) {
      console.error(`[proposal-audit-watchdog] Failed to recover ${proposal.id}:`, err?.message || err);
    }
  }
  return recovered;
}
