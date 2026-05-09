/**
 * Brand-term parsing utilities.
 *
 * `clients.brandKeywords` is the single source of truth for brand-vs-generic
 * classification across the platform: GSC monitoring, Google Ads dashboard,
 * AI Visibility, AI Search Erosion Detector, negative-sweep, quality score
 * analysis, and per-audit Google Ads work.
 *
 * Per-audit overrides live on each Google Ads audit's `brandTerms` field and
 * are resolved via `resolveBrandTerms()`.
 */

/**
 * Parse brand terms from a free-text client field.
 * Accepts newline-, comma-, or semicolon-separated values.
 * Trims, dedupes (case-insensitive), drops entries shorter than 3 chars
 * (catastrophic-match guard — e.g. "a" would otherwise match every query).
 */
export function parseBrandTerms(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\r\n,;]+/)) {
    const t = part.trim();
    if (t.length < 3) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Resolve the canonical brand terms for a client, with optional per-audit override.
 *
 * Order:
 *   1. `googleAdsAudits.brandTerms` (per-audit override, if non-empty)
 *   2. `clients.brandKeywords` (canonical)
 *   3. `[]`
 *
 * Used by Google Ads audit / proposal / sweep paths that may want to override
 * brand terms for a specific audit run without polluting the client-level field.
 */
export function resolveBrandTerms(
  clientBrandKeywords: string | null | undefined,
  auditBrandTerms?: string | null | undefined,
): string[] {
  const audit = parseBrandTerms(auditBrandTerms);
  if (audit.length > 0) return audit;
  return parseBrandTerms(clientBrandKeywords);
}
