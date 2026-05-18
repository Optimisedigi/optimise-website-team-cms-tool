/**
 * Safety caps for the invoice-statement approve-send flow.
 *
 * Checked in order. First failure short-circuits with a clear error so we
 * never blow past Postmark limits or accidentally hit a client twice.
 */

import type { Payload } from "payload";

export interface CapEnv {
  monthlyCap: number;
  hourlyCap: number;
  minDaysBetweenSends: number;
}

export function readCapEnv(): CapEnv {
  return {
    monthlyCap: Number(process.env.STATEMENT_MAX_PER_MONTH ?? "1000"),
    hourlyCap: Number(process.env.STATEMENT_MAX_PER_HOUR ?? "50"),
    minDaysBetweenSends: Number(
      process.env.STATEMENT_MIN_DAYS_BETWEEN_SENDS ?? "20",
    ),
  };
}

export interface CapResult {
  ok: boolean;
  /** Short reason for activity log + 429 response. */
  reason?: string;
  /** Optional structured detail. */
  detail?: Record<string, unknown>;
}

interface CountSentArgs {
  payload: Payload;
  from: Date;
  to: Date;
  xeroContactId?: string;
}

async function countSent({
  payload,
  from,
  to,
  xeroContactId,
}: CountSentArgs): Promise<number> {
  const and: Array<Record<string, unknown>> = [
    {
      status: { in: ["approved", "failed"] },
    },
    {
      sentAt: {
        greater_than_equal: from.toISOString(),
        less_than_equal: to.toISOString(),
      },
    },
  ];
  if (xeroContactId) {
    and.push({ xeroContactId: { equals: xeroContactId } });
    // Cooldown only checks rows that actually went through, not failed ones.
    and[0] = { status: { equals: "approved" } };
  }
  const result = await payload.find({
    collection: "invoice-statement-drafts" as never,
    where: { and } as never,
    limit: 0,
    depth: 0,
    overrideAccess: true,
  });
  return result.totalDocs ?? 0;
}

export async function runCaps(args: {
  payload: Payload;
  xeroContactId: string;
  now?: Date;
  env?: CapEnv;
  /**
   * Skip the per-contact cooldown check. Monthly + hourly caps still apply.
   * Used by admin "override cooldown & resend" flow when a follow-up email
   * needs to go to a different/additional recipient at the same Xero contact.
   */
  skipCooldown?: boolean;
}): Promise<CapResult> {
  const env = args.env ?? readCapEnv();
  const now = args.now ?? new Date();

  // 1. Monthly global cap.
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const monthSent = await countSent({
    payload: args.payload,
    from: monthStart,
    to: now,
  });
  if (monthSent >= env.monthlyCap) {
    return {
      ok: false,
      reason: "monthly cap reached",
      detail: { monthSent, cap: env.monthlyCap },
    };
  }

  // 2. Hourly burst cap.
  const hourStart = new Date(now.getTime() - 60 * 60 * 1000);
  const hourSent = await countSent({
    payload: args.payload,
    from: hourStart,
    to: now,
  });
  if (hourSent >= env.hourlyCap) {
    return {
      ok: false,
      reason: "hourly burst cap reached",
      detail: { hourSent, cap: env.hourlyCap },
    };
  }

  // 3. Per-contact cooldown.
  if (args.skipCooldown) {
    return { ok: true };
  }
  const cooldownStart = new Date(
    now.getTime() - env.minDaysBetweenSends * 24 * 60 * 60 * 1000,
  );
  const cooldownSent = await countSent({
    payload: args.payload,
    from: cooldownStart,
    to: now,
    xeroContactId: args.xeroContactId,
  });
  if (cooldownSent > 0) {
    return {
      ok: false,
      reason: `cooldown not elapsed \u2014 last sent within ${env.minDaysBetweenSends} days`,
      detail: {
        xeroContactId: args.xeroContactId,
        minDaysBetweenSends: env.minDaysBetweenSends,
      },
    };
  }

  return { ok: true };
}

/**
 * Validate CC list format. Each comma-separated entry must look like an email.
 * Returns `{ ok: true, list: ["a@b.com", ...] }` on success; `{ ok: false,
 * bad: "invalid-thing" }` on first failure.
 */
export function validateCcList(
  raw: string | null | undefined,
): { ok: true; list: string[] } | { ok: false; bad: string } {
  if (!raw) return { ok: true, list: [] };
  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const entry of entries) {
    if (!/.+@.+\..+/.test(entry)) {
      return { ok: false, bad: entry };
    }
  }
  return { ok: true, list: entries };
}
