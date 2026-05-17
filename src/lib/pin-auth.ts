import crypto from "node:crypto";
import { getPayload } from "payload";
import config from "@/payload.config";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const WINDOW_MINUTES = 15;

export const PIN_LOCKOUT_MESSAGE =
  "Too many incorrect attempts. Please try again in 15 minutes.";
export const PIN_INVALID_MESSAGE = "Incorrect PIN";

export type PinCheckResult =
  | { ok: true }
  | { ok: false; status: 401 | 429; message: string };

interface PinRateLimitDoc {
  id: number | string;
  bucketKey: string;
  attempts: number;
  lockedUntil?: string | null;
  windowStart: string;
}

/**
 * Constant-time string comparison that never short-circuits on length
 * mismatch. Returns false when either side is empty.
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a ?? "");
  const bufB = Buffer.from(b ?? "");
  if (bufA.length === 0 || bufB.length === 0) return false;
  if (bufA.length !== bufB.length) {
    // Still run timingSafeEqual on a padded copy to keep timing flat for
    // length-probing attackers.
    const padded = Buffer.alloc(bufA.length, 0);
    bufB.copy(padded, 0, 0, Math.min(bufB.length, bufA.length));
    crypto.timingSafeEqual(bufA, padded);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Check a PIN attempt against a per-target lockout bucket persisted in
 * Turso/libSQL. State survives across Vercel lambda instances and is immune
 * to `x-forwarded-for` rotation because the bucket is keyed on the TARGET
 * (e.g. the audit/proposal/client being unlocked), not the source IP.
 *
 * Lockout policy: 5 failed attempts inside a 15-minute window triggers a
 * 15-minute lockout. Successful auth clears the bucket. The window auto-
 * resets after `WINDOW_MINUTES` of inactivity.
 *
 * @param bucketKey  `<surface>:<target-id>` — e.g. `audit:42`, `client:7`,
 *                   `proposal:abc`. Must be the same string across attempts
 *                   for the same target so the counter actually accumulates.
 * @param submitted  user-supplied PIN
 * @param expected   stored PIN
 */
export async function checkPinWithLockout(
  bucketKey: string,
  submitted: string,
  expected: string | null | undefined,
): Promise<PinCheckResult> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const now = new Date();

  const existing = await payload.find({
    collection: "pin-rate-limits",
    where: { bucketKey: { equals: bucketKey } },
    limit: 1,
    overrideAccess: true,
  });
  const bucket = existing.docs[0] as PinRateLimitDoc | undefined;

  // Locked? Bail before doing any comparison work.
  if (bucket?.lockedUntil) {
    const lockedUntil = new Date(bucket.lockedUntil);
    if (lockedUntil > now) {
      return { ok: false, status: 429, message: PIN_LOCKOUT_MESSAGE };
    }
  }

  const matches =
    typeof expected === "string" &&
    expected.length > 0 &&
    safeCompare(submitted ?? "", expected);

  if (matches) {
    // Reset bucket on success.
    if (bucket) {
      await payload.update({
        collection: "pin-rate-limits",
        id: bucket.id,
        data: {
          attempts: 0,
          lockedUntil: null,
          windowStart: now.toISOString(),
        },
        overrideAccess: true,
      });
    }
    return { ok: true };
  }

  // Failed attempt — increment, rolling the window forward if it expired.
  const windowExpired = bucket
    ? now.getTime() - new Date(bucket.windowStart).getTime() >
      WINDOW_MINUTES * 60_000
    : true;
  const nextAttempts = windowExpired ? 1 : (bucket?.attempts ?? 0) + 1;
  const shouldLock = nextAttempts >= MAX_ATTEMPTS;
  const windowStart =
    windowExpired || !bucket ? now.toISOString() : bucket.windowStart;
  const lockedUntil = shouldLock
    ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000).toISOString()
    : null;

  if (bucket) {
    await payload.update({
      collection: "pin-rate-limits",
      id: bucket.id,
      data: {
        attempts: nextAttempts,
        windowStart,
        lockedUntil,
      },
      overrideAccess: true,
    });
  } else {
    await payload.create({
      collection: "pin-rate-limits",
      data: {
        bucketKey,
        attempts: nextAttempts,
        windowStart,
        lockedUntil,
      },
      overrideAccess: true,
    });
  }

  if (shouldLock) {
    return { ok: false, status: 429, message: PIN_LOCKOUT_MESSAGE };
  }
  return { ok: false, status: 401, message: PIN_INVALID_MESSAGE };
}
