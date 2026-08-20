/**
 * Away Digital Teams identity, in one place.
 *
 * The client slug moved from `away-digital` to `away-digital-teams` because a
 * DIFFERENT client now owns the shorter slug. That makes `away-digital` someone
 * else's identity, so it must never alias back to Away — a slug alias here
 * would let the other client's dashboard token unlock Away's HubSpot leads.
 * Old links 404 by design; the client re-enters their PIN under the new slug.
 */
export const AWAY_DIGITAL_CUSTOMER_ID = "3425353766";

export const AWAY_DIGITAL_SLUG = "away-digital-teams";

export function isAwayDigitalSlug(slug: string): boolean {
  return slug.trim().toLowerCase() === AWAY_DIGITAL_SLUG;
}

/**
 * Feature-gate only. Callers must already have authorized the request for this
 * slug AND confirmed the customer id belongs to that client's own record —
 * never gate on a customer id taken straight from the request.
 */
export function isAwayDigitalAccount(slug: string, customerId: string): boolean {
  return (
    isAwayDigitalSlug(slug) ||
    customerId.replace(/-/g, "") === AWAY_DIGITAL_CUSTOMER_ID
  );
}
