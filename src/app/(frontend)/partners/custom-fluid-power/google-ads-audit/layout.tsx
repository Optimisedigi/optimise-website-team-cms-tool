/**
 * Route: /partners/custom-fluid-power/google-ads-audit
 * Standalone audit deck for Custom Fluid Power — Google Ads audit Feb 2021–Jul 2026.
 *
 * PIN gate resolves slug `custom-fluid-power/google-ads-audit` to the Custom Fluid Power
 * client record's `clientPin`. Deck must also be listed in the client's
 * `presentations[]` with deckSlug="google-ads-audit". Content uses the Custom Fluid Power Google Ads audit JSON and the exact
 * Away Digital audit deck structure.
 */

export const metadata = {
  title: 'Custom Fluid Power — Google Ads Audit, Feb 2021 – Jul 2026',
  description:
    'Positive Google Ads optimisation review covering account health, measurement quality, search intent, and budget opportunities for Custom Fluid Power.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function CustomFluidPowerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
