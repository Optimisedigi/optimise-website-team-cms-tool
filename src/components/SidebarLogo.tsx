"use client";

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
  return (
    <>
      <div style={{ padding: "11px 8px 8px 4px", overflow: "visible" }}>
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
      <a
        href="/admin"
        className="sidebar-dashboard-link"
      >
        Dashboard
      </a>
      {/* Performance group — custom since no collections use this group */}
      <div id="nav-group-Performance" className="nav-group sidebar-extras__group">
        <button type="button" className="nav-group__toggle" tabIndex={-1}>
          Performance
        </button>
        <div className="nav-group__content">
          <a href="/admin/performance/analytics" className="nav__link sidebar-extras__link">
            <IconChart />
            <span className="nav__link-label">Google Analytics</span>
          </a>
          <a href="/admin/performance/search-console" className="nav__link sidebar-extras__link">
            <IconSearch />
            <span className="nav__link-label">Search Console</span>
          </a>
        </div>
      </div>
    </>
  );
};

export default SidebarLogo;
