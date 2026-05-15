import type { Payload } from "payload";

/**
 * Contract Reminder scheduling.
 *
 * `scheduleContractReminders()` is the single source of truth for what the
 * `contract-reminders` rows should look like for a given contract. It's
 * called from two places:
 *
 *  1. **Contracts.afterChange** — every save. We delete pending rows and
 *     recreate them, so changes to `contractDate`, recipients, or the
 *     master toggle flow through. `sent` / `failed` / `skipped` rows are
 *     untouched — history is preserved.
 *
 *  2. **Backfill script** — iterates every contract once. Same function,
 *     same idempotency guarantees. Reminders whose `sendAt < now` are
 *     marked `skipped` with a note explaining why.
 *
 * Date math is in pure UTC. Two reminders are scheduled per contract:
 *   - **11-month**: contractDate + 11 calendar months. Four-week lead.
 *   - **11.5-month**: contractDate + 11 calendar months + 15 calendar days.
 *     Two-week final nudge.
 *
 * "+11 calendar months" follows JS `Date.setUTCMonth()` semantics: if the
 * source day-of-month doesn't exist in the target month (e.g. Jan 31 + 1mo
 * = Feb 28 in a non-leap year) JS clamps to the last day of the target.
 * That's fine for our use case — a one-day drift on a 30-day-out reminder
 * is invisible.
 */

export type ReminderKind = "11-month" | "11.5-month";

export interface ScheduleResult {
  /** Reminder rows created this run. */
  created: Array<{ kind: ReminderKind; sendAt: Date; status: string }>;
  /** Reminder rows deleted this run (replaced or removed). */
  deletedCount: number;
}

interface ScheduleOptions {
  /**
   * Clock injection for tests + the backfill script. Defaults to
   * `() => new Date()` when omitted.
   */
  now?: () => Date;
  /**
   * If true, reminders whose computed `sendAt` is in the past are written
   * with `status: "skipped"` and a note. Used by the backfill script.
   * Default false: past reminders are written as `pending` (they'll fire on
   * the next cron tick — usually undesirable, hence opt-in).
   */
  skipPast?: boolean;
}

export interface ContractInput {
  id: number | string;
  /** ISO date string. */
  contractDate?: string | Date | null;
  annualReviewReminderEnabled?: boolean | null;
  /**
   * hasMany users relationship — Payload returns either `number[]` (depth 0)
   * or `Array<{ id: number }>` (depth 1).
   */
  annualReviewReminderRecipients?:
    | Array<number | string | { id: number | string }>
    | null;
}

/**
 * Add N calendar months to a date in UTC. Day-of-month wraps if the target
 * month is shorter (JS native behaviour).
 */
export function addMonthsUTC(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * Add N calendar days to a date in UTC.
 */
export function addDaysUTC(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Compute the two reminder send-at instants for a contract.
 * Pure function — no I/O. Easy to unit-test.
 */
export function computeReminderDates(contractDate: Date): {
  elevenMonth: Date;
  elevenAndHalfMonth: Date;
} {
  const elevenMonth = addMonthsUTC(contractDate, 11);
  // 11.5 months = 11 months + 15 days. Close enough; the half-month is a
  // human convenience, not an astronomical constant.
  const elevenAndHalfMonth = addDaysUTC(elevenMonth, 15);
  return { elevenMonth, elevenAndHalfMonth };
}

/**
 * Normalise the recipients array Payload hands us into a plain id list.
 * Filters falsy values; never returns undefined.
 */
export function normaliseRecipientIds(
  recipients: ContractInput["annualReviewReminderRecipients"],
): Array<number | string> {
  if (!recipients || !Array.isArray(recipients)) return [];
  return recipients
    .map((r) => {
      if (r == null) return null;
      if (typeof r === "object") return (r as { id: number | string }).id;
      return r;
    })
    .filter((id): id is number | string => id != null);
}

/**
 * Idempotently upsert the two `contract-reminders` rows for a contract.
 *
 * Algorithm:
 *   1. Delete all PENDING rows for this contract. (sent/failed/skipped are
 *      preserved — history.)
 *   2. If reminders are enabled AND `contractDate` is set, create two fresh
 *      pending rows. If `skipPast` is true and the computed `sendAt` is in
 *      the past, write `status: "skipped"` with an explanatory note.
 */
export async function scheduleContractReminders(
  payload: Payload,
  contract: ContractInput,
  opts: ScheduleOptions = {},
): Promise<ScheduleResult> {
  const now = (opts.now ?? (() => new Date()))();
  const skipPast = opts.skipPast ?? false;

  // 1. Delete existing PENDING rows for this contract.
  const existing = await payload.find({
    collection: "contract-reminders" as never,
    where: {
      and: [
        { contract: { equals: contract.id } },
        { status: { equals: "pending" } },
      ],
    } as never,
    limit: 100,
    overrideAccess: true,
    depth: 0,
  });

  for (const row of existing.docs) {
    await payload.delete({
      collection: "contract-reminders" as never,
      id: (row as { id: number | string }).id,
      overrideAccess: true,
    });
  }

  const result: ScheduleResult = {
    created: [],
    deletedCount: existing.docs.length,
  };

  // 2. Early-exit if reminders disabled or no contract date.
  if (!contract.annualReviewReminderEnabled) return result;
  if (!contract.contractDate) return result;

  const contractDate =
    contract.contractDate instanceof Date
      ? contract.contractDate
      : new Date(contract.contractDate);
  if (Number.isNaN(contractDate.getTime())) return result;

  const recipientIds = normaliseRecipientIds(
    contract.annualReviewReminderRecipients,
  );

  const { elevenMonth, elevenAndHalfMonth } = computeReminderDates(contractDate);

  const plan: Array<{ kind: ReminderKind; sendAt: Date }> = [
    { kind: "11-month", sendAt: elevenMonth },
    { kind: "11.5-month", sendAt: elevenAndHalfMonth },
  ];

  for (const item of plan) {
    const isPast = item.sendAt.getTime() < now.getTime();
    const status = isPast && skipPast ? "skipped" : "pending";
    const notes =
      isPast && skipPast ? "backfilled past anniversary" : undefined;

    await payload.create({
      collection: "contract-reminders" as never,
      overrideAccess: true,
      data: {
        contract: contract.id,
        kind: item.kind,
        sendAt: item.sendAt.toISOString(),
        status,
        recipients: recipientIds,
        notes,
      } as never,
    });
    result.created.push({
      kind: item.kind,
      sendAt: item.sendAt,
      status,
    });
  }

  return result;
}
