/**
 * Fuzzy matching between Xero contact names and CMS client records.
 *
 * Xero bills the full legal entity ("Berendsen Fluid Power") while the CMS
 * often stores the short working name ("Berendsen"), so an exact string
 * comparison misses real clients and drops their retainer/tenure from reports.
 * Kept as a pure module (no Payload import) so it can be unit-tested directly.
 */

export interface MatchableClient {
  id: number | string;
  name?: string | null;
  tradingName?: string | null;
  monthlyRetainer?: number | null;
  clientStartDate?: string | null;
  retainerStartDate?: string | null;
}

/**
 * Lowercase, strip company-entity suffixes and all non-alphanumerics, so
 * "Acme Pty Ltd", "acme" and "ACME." collapse to the same key.
 */
export function normaliseClientName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(pty\.?|ltd\.?|limited|inc\.?|llc)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Shortest normalised name accepted for a prefix match. Stops junk values in
 * `tradingName` (one client has a literal "a") from matching everything.
 */
const MIN_PREFIX_MATCH_LEN = 5;

/**
 * Build a lookup keyed by normalised `name` AND `tradingName`. `name` wins on
 * collision, and blank/whitespace values are skipped.
 */
export function indexClientsByName<T extends MatchableClient>(
  clients: T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const doc of clients) {
    if (doc.tradingName) {
      const key = normaliseClientName(doc.tradingName);
      if (key && !map.has(key)) map.set(key, doc);
    }
  }
  for (const doc of clients) {
    if (doc.name) {
      const key = normaliseClientName(doc.name);
      if (key) map.set(key, doc);
    }
  }
  return map;
}

/**
 * Resolve a Xero contact name to a CMS client.
 *
 * Exact normalised match first, then a prefix match in either direction. The
 * fallback only applies when exactly ONE client qualifies — an ambiguous
 * prefix is left unmatched rather than risk attributing the wrong retainer to
 * the wrong client.
 */
export function matchClientByName<T extends MatchableClient>(
  clientsByName: Map<string, T>,
  contactName: string,
): T | null {
  const key = normaliseClientName(contactName ?? "");
  if (!key) return null;

  const exact = clientsByName.get(key);
  if (exact) return exact;

  const candidates = new Set<T>();
  for (const [candidateKey, record] of clientsByName) {
    if (candidateKey.length < MIN_PREFIX_MATCH_LEN) continue;
    if (key.startsWith(candidateKey) || candidateKey.startsWith(key)) {
      candidates.add(record);
    }
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}
