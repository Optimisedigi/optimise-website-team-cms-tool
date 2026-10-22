/**
 * Hosting billing values the admin UI needs. Kept apart from hosting-billing.ts,
 * which uses Node's crypto: importing that file from a client component pulls a
 * ~400 KB browser crypto polyfill into every admin page.
 */

/** How long a hosting sign-up link works (same as one-off payment links). */
export const HOSTING_OFFER_LINK_DAYS = 14
