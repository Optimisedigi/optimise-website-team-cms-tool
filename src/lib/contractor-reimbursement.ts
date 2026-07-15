/**
 * Tool/expense reimbursement for a contractor.
 *
 * A reimbursement is not necessarily a per-fortnight cost: the agency sets an
 * amount, a recurrence, and the date it first appears. This helper resolves how
 * much reimbursement (if any) belongs to a single fortnight window so the
 * overview and the ContractorPayments rollup stay in agreement.
 *
 * Backward compatibility: when `reimbursementRecurrence` is not set on the
 * contractor, we fall back to the legacy `chatGptReimbursementPerFortnight`
 * field applied to every fortnight.
 */

export type ReimbursementRecurrence = "none" | "weekly" | "per-fortnight" | "monthly" | "one-off";

export interface ReimbursementConfig {
  reimbursementAmount?: number | null;
  reimbursementRecurrence?: ReimbursementRecurrence | null;
  reimbursementStartDate?: string | null;
  /** Legacy per-fortnight field, used only when recurrence is unset. */
  chatGptReimbursementPerFortnight?: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseUtcDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(ms) ? null : ms;
}

function monthlyAppearanceMs(anchorMs: number, dayOfMonth: number): number {
  const anchor = new Date(anchorMs);
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(dayOfMonth, lastDay));
}

/**
 * Reimbursement owed within the fortnight `[fortnightStartMs, fortnightEndMs]`
 * (both inclusive, end = start + 13 days).
 */
export function reimbursementForFortnight(
  contractor: ReimbursementConfig,
  fortnightStartMs: number,
  fortnightEndMs: number,
): number {
  const recurrence = contractor.reimbursementRecurrence;

  // Legacy behaviour: no recurrence configured → flat per-fortnight amount.
  if (!recurrence) return Number(contractor.chatGptReimbursementPerFortnight || 0);

  if (recurrence === "none") return 0;

  const amount = Number(contractor.reimbursementAmount || 0);
  if (amount <= 0) return 0;

  const startMs = parseUtcDay(contractor.reimbursementStartDate);

  if (recurrence === "per-fortnight") {
    if (startMs != null && fortnightEndMs < startMs) return 0;
    return amount;
  }

  if (recurrence === "weekly") {
    // Every 7 days from the start date; a 14-day fortnight normally holds two.
    if (startMs == null) {
      // No anchor date: assume two weeks fall inside the fortnight.
      return amount * 2;
    }
    let occurrences = 0;
    for (let appearMs = startMs; appearMs <= fortnightEndMs; appearMs += 7 * DAY_MS) {
      if (appearMs >= fortnightStartMs) occurrences += 1;
    }
    return amount * occurrences;
  }

  if (recurrence === "one-off") {
    if (startMs == null) return 0;
    return startMs >= fortnightStartMs && startMs <= fortnightEndMs ? amount : 0;
  }

  // monthly: appears once a month on the start date's day-of-month.
  if (startMs == null) return 0;
  const dayOfMonth = new Date(startMs).getUTCDate();
  for (let anchorMs = fortnightStartMs; anchorMs <= fortnightEndMs; anchorMs += DAY_MS) {
    const appearMs = monthlyAppearanceMs(anchorMs, dayOfMonth);
    if (appearMs >= startMs && appearMs >= fortnightStartMs && appearMs <= fortnightEndMs) return amount;
  }
  return 0;
}
