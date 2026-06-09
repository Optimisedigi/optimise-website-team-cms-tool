/**
 * Change-Review read model for the account-efficiency (and any) goal agent.
 *
 * Pure transform layer: takes raw goal-run-snapshot rows + their linked
 * approval-queue rows and partitions them into the two buckets the review UI
 * surfaces — APPROVED/APPLIED changes (the default view) and
 * DISAPPROVED/BLOCKED changes (shown behind a toggle), each carrying the
 * reason it was approved or flagged. No Payload, no HTTP — the API route does
 * the I/O and hands rows to `partitionChangeReview`.
 */

/** Snapshot status values, mirroring goal-run-audit.ts `SnapshotStatus`. */
export type ChangeReviewStatus =
  | "proposed"
  | "approved"
  | "applied"
  | "rejected"
  | "blocked_by_contract"
  | "blocked_by_pacer"
  | "blocked_by_scope";

export interface ChangeReviewSnapshotInput {
  id: number;
  step?: number | null;
  action?: string | null;
  status?: string | null;
  riskTier?: string | null;
  campaignIds?: string[];
  blockReason?: string | null;
  proposedPayload?: Record<string, unknown> | null;
  modifiedPayload?: Record<string, unknown> | null;
  measuredResult?: Record<string, unknown> | null;
  createdAt?: string | null;
  /** Rendered markdown from the linked approval-queue row, if any. */
  approvalMarkdown?: string | null;
}

export interface ChangeReviewRow {
  id: number;
  step: number | null;
  action: string;
  status: ChangeReviewStatus;
  riskTier: string | null;
  campaignIds: string[];
  /** Human-readable reason this row was approved, flagged, or blocked. */
  reason: string;
  measuredResult: Record<string, unknown> | null;
  createdAt: string | null;
}

export interface ChangeReviewPartition {
  /** status ∈ approved | applied. The default view. */
  approved: ChangeReviewRow[];
  /** status ∈ rejected | blocked_by_*. Shown behind the toggle. */
  disapproved: ChangeReviewRow[];
}

const BLOCKED_PREFIX = "blocked_by_";

function isApprovedStatus(status: string): boolean {
  return status === "approved" || status === "applied";
}

function isDisapprovedStatus(status: string): boolean {
  return status === "rejected" || status.startsWith(BLOCKED_PREFIX);
}

/**
 * Summarise the proposed payload into a one-line reason when there's no
 * blockReason or rendered markdown to lean on. Kept deliberately small and
 * deterministic so the same row always renders the same reason.
 */
function summariseProposed(action: string, proposed: Record<string, unknown> | null): string {
  if (!proposed) return `${action} proposed.`;
  const note =
    (typeof proposed.confirmationNote === "string" && proposed.confirmationNote) ||
    (typeof proposed.note === "string" && proposed.note) ||
    (typeof proposed.reason === "string" && proposed.reason) ||
    "";
  if (note) return note;
  if (typeof proposed.keywordText === "string") {
    return `Pause keyword "${proposed.keywordText}".`;
  }
  if (typeof proposed.adGroupName === "string") {
    return `Pause ad group "${proposed.adGroupName}".`;
  }
  if (action === "budget-shift" && typeof proposed.totalShiftDollars === "number") {
    return `Budget shift of $${proposed.totalShiftDollars.toFixed(2)}/day.`;
  }
  return `${action} proposed.`;
}

function firstLine(markdown: string): string {
  const stripped = markdown
    .split("\n")
    .map((l) => l.replace(/[*#>-]/g, "").trim())
    .find((l) => l.length > 0);
  return stripped ?? markdown.trim();
}

function buildReason(input: ChangeReviewSnapshotInput, status: string, action: string): string {
  // Blocked / rejected: the blockReason is the authoritative explanation.
  if (isDisapprovedStatus(status) && input.blockReason && input.blockReason.trim()) {
    return input.blockReason.trim();
  }
  if (status === "rejected") {
    return "Rejected by reviewer.";
  }
  // Approved/applied: prefer the rendered approval markdown's headline, then a
  // payload summary.
  if (input.approvalMarkdown && input.approvalMarkdown.trim()) {
    return firstLine(input.approvalMarkdown);
  }
  return summariseProposed(action, input.proposedPayload ?? null);
}

/**
 * Partition raw snapshot inputs into approved-vs-disapproved buckets with a
 * reason on each row. Rows with a non-terminal status (e.g. "proposed") are
 * omitted — the review surface shows decided changes only.
 */
export function partitionChangeReview(
  inputs: ReadonlyArray<ChangeReviewSnapshotInput>,
): ChangeReviewPartition {
  const approved: ChangeReviewRow[] = [];
  const disapproved: ChangeReviewRow[] = [];

  for (const input of inputs) {
    const status = (input.status ?? "").trim();
    if (!status) continue;
    const inApproved = isApprovedStatus(status);
    const inDisapproved = isDisapprovedStatus(status);
    if (!inApproved && !inDisapproved) continue; // e.g. "proposed" — still pending

    const action = (input.action ?? "unknown").trim() || "unknown";
    const row: ChangeReviewRow = {
      id: input.id,
      step: typeof input.step === "number" ? input.step : null,
      action,
      status: status as ChangeReviewStatus,
      riskTier: input.riskTier ?? null,
      campaignIds: Array.isArray(input.campaignIds) ? input.campaignIds : [],
      reason: buildReason(input, status, action),
      measuredResult: input.measuredResult ?? null,
      createdAt: input.createdAt ?? null,
    };
    if (inApproved) approved.push(row);
    else disapproved.push(row);
  }

  // Deterministic order: by step then id.
  const byStep = (a: ChangeReviewRow, b: ChangeReviewRow): number =>
    (a.step ?? 0) - (b.step ?? 0) || a.id - b.id;
  approved.sort(byStep);
  disapproved.sort(byStep);

  return { approved, disapproved };
}
