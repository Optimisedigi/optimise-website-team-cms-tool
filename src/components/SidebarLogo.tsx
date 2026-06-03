"use client";

import { useAuth } from "@payloadcms/ui";
import { usePathname } from "next/navigation";
import { userHasFeature } from "../lib/access";

const IconChart = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
)

const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const SidebarLogo = () => {
  const { user } = useAuth();
  const pathname = usePathname();
  const showDashboard = userHasFeature(user, "nav:dashboard");
  const dashboardActive = pathname === "/admin";
  const showAnalytics = userHasFeature(user, "nav:google-analytics");
  const showSearchConsole = userHasFeature(user, "nav:search-console");
  // Hide the entire Performance group if the user has none of the items.
  const showPerfGroup = showAnalytics || showSearchConsole;

  return (
    <>
      <div className="sidebar-sticky-head">
        {/* Logo wrapper — fixed 60px height with the image vertically centered
            so its midline lines up with the collapse-button midline
            (collapse btn: top:12 + 8 padding + 10 (half of 20px svg) = 30px). */}
        <div
          style={{
            height: 60,
            padding: "0 8px 0 4px",
            display: "flex",
            alignItems: "center",
            overflow: "visible",
          }}
        >
          <img
            src="/optimise-digital-logo-white-no-rocket.png"
            alt="Optimise Digital"
            style={{
              maxWidth: 170,
              width: "100%",
              height: "auto",
              objectFit: "contain",
            }}
          />
        </div>
        {showDashboard && (
          <a
            href="/admin"
            className={`sidebar-dashboard-link${dashboardActive ? " sidebar-dashboard-link--active" : ""}`}
          >
            Dashboard
          </a>
        )}
      </div>
      {showPerfGroup && (
        <div id="nav-group-Performance" className="nav-group sidebar-extras__group">
          <button type="button" className="nav-group__toggle" tabIndex={-1}>
            Performance
          </button>
          <div className="nav-group__content">
            {showAnalytics && (
              <a href="/admin/performance/analytics" className="nav__link sidebar-extras__link">
                <IconChart />
                <span className="nav__link-label">Google Analytics</span>
              </a>
            )}
            {showSearchConsole && (
              <a href="/admin/performance/search-console" className="nav__link sidebar-extras__link">
                <IconSearch />
                <span className="nav__link-label">Search Console</span>
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default SidebarLogo;
