"use client";

import dynamic from "next/dynamic";

/**
 * Wrapper that lazy-loads the AccountStructureTree from the `/partners`
 * scaffold so the GoogleAdsDashboard bundle doesn't include it until the
 * "Account Structure View" tab is opened.
 *
 * Data path: the tree's apiPath is set to `/api/client/<slug>/google-ads/
 * account-structure`, which forwards (with x-internal-key) to the live
 * growth-tools endpoint at `/api/google-ads/account-structure/:customerId`.
 */

// Disable SSR — the tree uses browser fetch + date inputs and the dashboard
// page that hosts it is already client-rendered.
const AccountStructureTree = dynamic(
  () =>
    import(
      "@/app/(frontend)/partners/[clientSlug]/account-structure/AccountStructureTree"
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 py-12 justify-center text-sm text-slate-500">
        <svg
          className="animate-spin h-4 w-4 text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading account structure…
      </div>
    ),
  },
);

interface AccountStructureTabProps {
  /** Client slug (e.g. "berendsen-client") used to build the CMS API path. */
  slug: string;
  /** Display name shown in the tree's header. */
  clientName: string;
  /** Google Ads customer ID (with or without dashes) shown next to the name. */
  googleAdsCustomerId: string | null;
}

export function AccountStructureTab({ slug, clientName, googleAdsCustomerId }: AccountStructureTabProps) {
  return (
    <AccountStructureTree
      clientSlug={slug}
      clientName={clientName}
      googleAdsCustomerId={googleAdsCustomerId}
      apiPath={`/api/client/${slug}/google-ads/account-structure`}
    />
  );
}
