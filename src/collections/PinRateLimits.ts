import type { CollectionConfig } from "payload";

/**
 * PIN attempt buckets — per-target (audit/proposal/client), NOT per-IP.
 *
 * 4-digit PIN endpoints have a 9000-value keyspace (1000..9999), making them
 * trivial to brute-force without server-side lockout. The previous in-memory
 * `Map` keyed on `x-forwarded-for` was bypassable two ways:
 *
 *   1. Vercel serverless fan-out: each cold lambda instance has its own Map,
 *      so an attacker hitting the same endpoint from many concurrent requests
 *      lands on fresh counters.
 *   2. XFF spoofing: `x-forwarded-for` is client-controllable, so rotating
 *      the header value per request bypasses the limit entirely.
 *
 * This collection persists attempt counts to Turso/libSQL, keyed on the
 * TARGET (e.g. `audit:42`, `proposal:7`). After 5 failed attempts inside a
 * 15-minute window, the bucket is locked for 15 minutes regardless of source
 * IP. Successful auth resets the bucket.
 *
 * The table is fully hidden from the admin and locked down to no public
 * access — only server-side code with `overrideAccess: true` (the shared
 * `pin-auth` module) ever touches it.
 */
export const PinRateLimits: CollectionConfig = {
  slug: "pin-rate-limits",
  admin: { hidden: true },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: "bucketKey",
      type: "text",
      required: true,
      index: true,
      unique: true,
    },
    {
      name: "attempts",
      type: "number",
      required: true,
      defaultValue: 0,
    },
    { name: "lockedUntil", type: "date" },
    { name: "windowStart", type: "date", required: true },
  ],
  timestamps: true,
};
