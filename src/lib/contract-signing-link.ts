/** How long a contract signing link stays valid after it is generated. */
export const SIGNING_LINK_TTL_DAYS = 7;

export type SigningLinkExpiry =
  | { state: "none" }
  | { state: "active"; expiresAt: Date }
  | { state: "expired"; expiresAt: Date };

/**
 * Expiry state of a contract's signing link, from its saved
 * `signingTokenExpiresAt`. Mirrors the sign route's check (expired once the
 * expiry time has passed). `now` is injected so callers and tests are deterministic.
 */
export function signingLinkExpiry(expiresAt: string | null | undefined, now: Date): SigningLinkExpiry {
  if (!expiresAt) return { state: "none" };
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return { state: "none" };
  return date < now ? { state: "expired", expiresAt: date } : { state: "active", expiresAt: date };
}
