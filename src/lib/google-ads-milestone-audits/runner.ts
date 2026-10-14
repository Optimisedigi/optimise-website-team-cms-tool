import type { Payload } from "payload";
import { relationshipKey } from "@/lib/relationship-id";
import { createSnapshotForAudit } from "@/lib/google-ads-audit-snapshots/lifecycle";
import {
  MILESTONE_TIMEZONE,
  milestoneLabel,
  milestonePlan,
  planScheduledRows,
  toYmd,
} from "./schedule";
import { MILESTONE_COLLECTION, prepareMilestoneForApproval, type MilestoneRow } from "./share";

/** Max new Growth Tools captures started per run, so a rollout doesn't flood Growth Tools. */
export const MAX_STARTS_PER_RUN = 3;
export const MAX_ATTEMPTS = 3;
/** A capture still running after this long is treated as a failed attempt. */
export const CAPTURE_STALE_MS = 3 * 60 * 60 * 1000;

export interface MilestoneTickResult {
  accounts: number;
  created: number;
  rescheduled: number;
  skipped: number;
  started: number;
  readyForApproval: number;
  failed: number;
  rejected: number;
  errors: Array<{ milestoneId?: number | string; clientId?: number | string; error: string }>;
}

type AnyPayload = any;

function day(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

function message(err: unknown): string {
  // Drizzle wraps SQLite errors as "Failed query: <the whole SQL>"; the useful
  // reason is on `cause`, so lead with it.
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
  const text = err instanceof Error ? err.message : String(err);
  return (cause ? `${cause} (${text.slice(0, 300)})` : text).slice(0, 2000);
}

async function updateRow(payload: AnyPayload, id: number | string, data: Record<string, unknown>): Promise<void> {
  await payload.update({ collection: MILESTONE_COLLECTION, id, data, overrideAccess: true });
}

/** Normalised customer ID → most recently updated audit for that account. */
function pickAuditsPerAccount(audits: any[]): any[] {
  const byAccount = new Map<string, any>();
  for (const audit of audits) {
    const key = `${relationshipKey(audit.client)}:${String(audit.customerId ?? "").replace(/\D/g, "")}`;
    if (!String(audit.customerId ?? "").replace(/\D/g, "")) continue;
    const current = byAccount.get(key);
    if (!current || String(audit.updatedAt ?? "") > String(current.updatedAt ?? "")) byAccount.set(key, audit);
  }
  return Array.from(byAccount.values());
}

/**
 * One pass of the milestone audit pipeline. Safe to run repeatedly (hourly).
 *  1. Sync: create/refresh the five milestone rows per managed Google Ads account.
 *  2. Plan: skip superseded/too-old milestones, start captures for due ones.
 *  3. Poll: finished captures become decks + OptiMate approvals.
 *  4. Reconcile: rejected approvals mark their milestone rejected.
 */
export async function runMilestoneAuditTick(
  payloadArg: Payload,
  options: { now?: Date; maxStarts?: number } = {},
): Promise<MilestoneTickResult> {
  const payload = payloadArg as AnyPayload;
  const now = options.now ?? new Date();
  const today = toYmd(now, MILESTONE_TIMEZONE)!;
  const result: MilestoneTickResult = { accounts: 0, created: 0, rescheduled: 0, skipped: 0, started: 0, readyForApproval: 0, failed: 0, rejected: 0, errors: [] };

  // ── 1. Sync ────────────────────────────────────────────────────────────
  const clients = await payload.find({
    collection: "clients",
    where: {
      and: [
        { campaignStartDate: { exists: true } },
        { isActive: { not_equals: false } },
        { isAgency: { not_equals: true } },
        { "gadsAuto.milestoneAuditsEnabled": { not_equals: false } },
      ],
    },
    limit: 1000,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { name: true, campaignStartDate: true },
  });
  const clientDocs: any[] = clients.docs ?? [];
  const goLiveByClient = new Map<string, string>();
  for (const client of clientDocs) {
    const goLive = toYmd(client.campaignStartDate);
    if (goLive) goLiveByClient.set(String(client.id), goLive);
  }
  if (goLiveByClient.size === 0) return result;

  const auditsFound = await payload.find({
    collection: "google-ads-audits",
    where: { and: [{ client: { in: Array.from(goLiveByClient.keys()) } }, { customerId: { exists: true } }] },
    limit: 5000,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { client: true, customerId: true, businessName: true, updatedAt: true },
  });
  const audits = pickAuditsPerAccount(auditsFound.docs ?? []);
  result.accounts = audits.length;
  if (audits.length === 0) return result;

  const rowsFound = await payload.find({
    collection: MILESTONE_COLLECTION,
    where: { audit: { in: audits.map((a) => a.id) } },
    limit: 10000,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const rowsByKey = new Map<string, MilestoneRow>();
  for (const row of (rowsFound.docs ?? []) as MilestoneRow[]) rowsByKey.set(row.milestoneKey, row);

  const toStart: Array<{ row: MilestoneRow; goLive: string }> = [];
  for (const audit of audits) {
    const clientId = relationshipKey(audit.client)!;
    const goLive = goLiveByClient.get(String(clientId))!;
    const clientName = String(audit.businessName || clientDocs.find((c) => String(c.id) === String(clientId))?.name || "Client");
    const scheduled: MilestoneRow[] = [];
    for (const item of milestonePlan(goLive)) {
      const key = `${audit.id}:${item.months}`;
      let row = rowsByKey.get(key);
      try {
        if (!row) {
          row = await payload.create({
            collection: MILESTONE_COLLECTION,
            data: {
              title: `${clientName}: ${milestoneLabel(item.months)} audit`,
              client: clientId,
              audit: audit.id,
              months: item.months,
              goLiveDate: goLive,
              dueDate: item.dueDate,
              status: "scheduled",
              milestoneKey: key,
              attempts: 0,
            },
            overrideAccess: true,
          });
          result.created++;
        } else if (row.status === "scheduled" && (day(row.dueDate) !== item.dueDate || day(row.goLiveDate) !== goLive)) {
          // Campaign start changed: move milestones that haven't run yet.
          await updateRow(payload, row.id, { goLiveDate: goLive, dueDate: item.dueDate });
          row = { ...row, goLiveDate: goLive, dueDate: item.dueDate };
          result.rescheduled++;
        }
      } catch (err) {
        result.errors.push({ clientId, error: `sync ${key}: ${message(err)}` });
        continue;
      }
      if (row && row.status === "scheduled") scheduled.push({ ...row, dueDate: day(row.dueDate) });
    }

    // ── 2. Plan ──────────────────────────────────────────────────────────
    const plan = planScheduledRows(scheduled, today);
    for (const { row, reason } of plan.skip) {
      try {
        await updateRow(payload, row.id, { status: "skipped", note: reason });
        result.skipped++;
      } catch (err) {
        result.errors.push({ milestoneId: row.id, error: message(err) });
      }
    }
    if (plan.run) toStart.push({ row: plan.run, goLive });
  }

  // Oldest due first, capped per run.
  toStart.sort((a, b) => a.row.dueDate.localeCompare(b.row.dueDate));
  for (const { row, goLive } of toStart.slice(0, options.maxStarts ?? MAX_STARTS_PER_RUN)) {
    const plan = milestonePlan(goLive).find((item) => item.months === row.months)!;
    const attempts = Number(row.attempts ?? 0) + 1;
    try {
      const snapshot = await createSnapshotForAudit(payloadArg, relationshipKey(row.audit)!, {
        allowNew: true,
        window: { periodEnd: plan.periodEnd, periodStartFloor: plan.periodStart },
      });
      if (day(snapshot.periodEnd) !== plan.periodEnd && ["pending", "running"].includes(snapshot.status)) {
        // A manual audit run is in progress on this account; try again next run.
        await updateRow(payload, row.id, { note: "Waiting for another audit run on this account to finish." });
        continue;
      }
      await updateRow(payload, row.id, { status: "capturing", snapshot: snapshot.id, captureStartedAt: now.toISOString(), attempts, note: null });
      result.started++;
    } catch (err) {
      const failed = attempts >= MAX_ATTEMPTS;
      await updateRow(payload, row.id, { attempts, status: failed ? "failed" : "scheduled", note: `Capture could not start: ${message(err)}` }).catch(() => undefined);
      if (failed) result.failed++;
      result.errors.push({ milestoneId: row.id, error: message(err) });
    }
  }

  // ── 3. Poll captures ─────────────────────────────────────────────────────
  const capturing = await payload.find({
    collection: MILESTONE_COLLECTION,
    where: { status: { equals: "capturing" } },
    limit: 200,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  for (const row of (capturing.docs ?? []) as MilestoneRow[]) {
    const snapshotId = relationshipKey(row.snapshot);
    try {
      const snapshot = snapshotId ? await payload.findByID({ collection: "google-ads-audit-snapshots", id: snapshotId, depth: 0, overrideAccess: true }) : null;
      if (snapshot?.status === "completed") {
        await prepareMilestoneForApproval(payloadArg, row, snapshot);
        result.readyForApproval++;
        continue;
      }
      const startedAt = Date.parse(String(row.captureStartedAt ?? ""));
      const stale = Number.isFinite(startedAt) && now.getTime() - startedAt > CAPTURE_STALE_MS;
      if (!snapshot || snapshot.status === "failed" || stale) {
        const reason = !snapshot ? "Snapshot record is missing" : snapshot.status === "failed" ? `Capture failed: ${snapshot.error ?? "unknown error"}` : "Capture timed out";
        const failed = Number(row.attempts ?? 0) >= MAX_ATTEMPTS;
        await updateRow(payload, row.id, { status: failed ? "failed" : "scheduled", note: reason.slice(0, 2000) });
        if (failed) result.failed++;
      }
    } catch (err) {
      result.errors.push({ milestoneId: row.id, error: message(err) });
      await updateRow(payload, row.id, { note: `Deck/approval step failed (will retry): ${message(err)}` }).catch(() => undefined);
    }
  }

  // ── 4. Reconcile approvals ────────────────────────────────────────────
  const awaiting = await payload.find({
    collection: MILESTONE_COLLECTION,
    where: { status: { equals: "awaiting_approval" } },
    limit: 500,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  for (const row of (awaiting.docs ?? []) as MilestoneRow[]) {
    const approvalId = relationshipKey(row.approval);
    if (!approvalId) continue;
    try {
      const approval = await payload.findByID({ collection: "agent-approval-queue", id: approvalId, depth: 0, overrideAccess: true });
      if (approval?.status === "rejected") {
        await updateRow(payload, row.id, { status: "rejected", note: "Approval was rejected; nothing was shared." });
        result.rejected++;
      } else if (approval?.status === "failed") {
        // Applied but failed (e.g. Gmail not connected). Failed approvals can't
        // be re-applied, so queue a fresh one. This only happens after a person
        // applied, so it can't loop on its own.
        const snapshotId = relationshipKey(row.snapshot);
        const snapshot = snapshotId ? await payload.findByID({ collection: "google-ads-audit-snapshots", id: snapshotId, depth: 0, overrideAccess: true }) : null;
        if (snapshot?.status !== "completed") throw new Error("Cannot re-queue approval: snapshot is not completed");
        await prepareMilestoneForApproval(payloadArg, { ...row, approval: null }, snapshot);
        await updateRow(payload, row.id, { note: `Applying approval #${approvalId} failed: ${String(approval.applyError ?? "unknown error").slice(0, 1500)}. A fresh approval was queued.` });
        result.readyForApproval++;
      }
    } catch (err) {
      result.errors.push({ milestoneId: row.id, error: message(err) });
    }
  }

  return result;
}
