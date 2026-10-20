import crypto from "crypto";
import type { Payload } from "payload";
import { checkReviewAccess, isWellFormedReviewToken, type ReviewAccess } from "@/lib/contract-review";

/** 32 random bytes as hex (256 bits). Server only. */
export function generateReviewToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export type LoadedReview =
  | { ok: true; doc: any }
  | Extract<ReviewAccess, { ok: false }>;

/**
 * Resolve a public review token to its contract and confirm review is open.
 * Malformed tokens are rejected before touching the database; every failure
 * is reported without saying which check failed beyond expired / closed.
 */
export async function loadReviewContract(payload: Payload, token: unknown, now: Date): Promise<LoadedReview> {
  if (!isWellFormedReviewToken(token)) {
    return checkReviewAccess(null, now) as Extract<ReviewAccess, { ok: false }>;
  }
  const results = await payload.find({
    collection: "contracts",
    where: { reviewToken: { equals: token } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const doc = results.docs[0] as any;
  const access = checkReviewAccess(doc, now);
  if (!access.ok) return access;
  return { ok: true, doc };
}
