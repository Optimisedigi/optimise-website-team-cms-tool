/**
 * Route: /partners/away-digital/google-ads-audit
 * Standalone audit deck for Away Digital Teams — Google Ads audit Jan 2025–Apr 2026.
 *
 * PIN gate resolves slug `away-digital/google-ads-audit` to the Away Digital
 * client record's `clientPin`. Deck must also be listed in the client's
 * `presentations[]` with deckSlug="google-ads-audit". Content ported from
 * website-growth-tools/output/away-digital-audit-may-2026.html.
 */

export const metadata = {
  title: 'Away Digital Teams — Google Ads Audit, Jan 2025 – Apr 2026',
  description:
    'Deep-dive Google Ads audit and optimisation plan to reverse rising CPL and improve lead volume for Away Digital Teams.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function AwayDigitalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
