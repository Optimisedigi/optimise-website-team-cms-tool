"use client";

/**
 * DashboardGate
 *
 * Wraps children so that users WITHOUT the `nav:dashboard` feature get
 * redirected away from the agency Dashboard route (`/admin`) to the first
 * collection / page they DO have access to.
 *
 * Renders a full-page cover over the dashboard while the redirect is in
 * flight so the user never sees the agency Dashboard component flash with
 * a "Could not load dashboard data" error before being kicked elsewhere.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@payloadcms/ui";
import { getEffectiveFeatures, userHasFeature } from "../lib/access";

const DashboardGate = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Only block render on the dashboard route, when the user is loaded and
  // explicitly lacks `nav:dashboard`. While `user` is still being resolved
  // we let children render normally so we don't flash a cover for admins.
  const onDashboardRoute = pathname === "/admin";
  const shouldBlock =
    onDashboardRoute && !!user && !userHasFeature(user, "nav:dashboard");

  useEffect(() => {
    if (!shouldBlock) return;

    const features = getEffectiveFeatures(user);
    // Prefer collection slugs (no `nav:` prefix, exclude globals) for landing.
    const firstCollection = [...features].find(
      (f) =>
        !f.startsWith("nav:") &&
        f !== "email-templates" &&
        f !== "api-cost-rates" &&
        f !== "sheets-auth" &&
        f !== "calendar-auth",
    );
    router.replace(
      firstCollection ? `/admin/collections/${firstCollection}` : "/admin/account",
    );
  }, [shouldBlock, user, router]);

  if (shouldBlock) {
    // Full-bleed cover that hides the Dashboard component completely while
    // the router.replace() above is in flight. Matches the admin background.
    return (
      <>
        <style>{`
          .dashboard-gate-cover {
            position: fixed;
            inset: 0;
            z-index: 9000;
            background: var(--theme-bg, #fff);
          }
        `}</style>
        <div className="dashboard-gate-cover" aria-hidden="true" />
        {children}
      </>
    );
  }

  return <>{children}</>;
};

export default DashboardGate;
