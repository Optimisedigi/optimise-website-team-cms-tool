/**
 * Route: /partners/autotrader/google-ads-audit
 * Standalone audit deck for AutoTrader NZ — Google Ads audit Jan 2024 – Jul 2026.
 *
 * PIN gate resolves slug `autotrader/google-ads-audit` to the AutoTrader client
 * record's `clientPin`. Deck must also be listed in the client's
 * `presentations[]` with deckSlug="google-ads-audit".
 *
 * Unlike the Away Digital / Custom Fluid Power decks, this audit was built from
 * manually exported Google Ads UI CSVs (no API access — the client would only
 * share login credentials). It therefore has NO stored snapshot in the
 * google_ads_audit_snapshots table and NO 13-category rubric score: the scoring
 * engine consumes an API-shaped snapshot this audit never produced. The
 * audit-score and category-breakdown slides render every category as
 * "not assessed" rather than inventing numbers.
 *
 * Every figure in the deck is hardcoded from the verified analysis in
 * website-optimise-digital/website-growth-tools/.data/autotrader-audit/output/
 * (Parts 1–4, 35/35 headline figures verified against the source CSVs).
 */

export const metadata = {
  title: 'AutoTrader — Google Ads Audit, Jan 2024 – Jul 2026',
  description:
    'Google Ads account review covering conversion tracking integrity, spend allocation, search-term relevance, landing-page quality and account structure for AutoTrader NZ.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function AutoTraderAuditLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
