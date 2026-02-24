'use client'

const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const IconCosts = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)

const IconIntegrations = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
  </svg>
)

const SidebarNavExtras = () => {
  return (
    <>
      {/* Performance group */}
      <div className="nav-group sidebar-extras__group">
        <button type="button" className="nav-group__toggle" tabIndex={-1}>
          Performance
        </button>
        <div className="nav-group__content">
          <a href="/admin/performance/search-console" className="nav__link sidebar-extras__link">
            <IconSearch />
            <span className="nav__link-label">Search Console</span>
          </a>
        </div>
      </div>

      {/* Finance — custom page (collections/globals are in Payload's Finance group) */}
      <div className="nav-group sidebar-extras__group">
        <button type="button" className="nav-group__toggle" tabIndex={-1}>
          Finance
        </button>
        <div className="nav-group__content">
          <a href="/admin/finance/costs" className="nav__link sidebar-extras__link">
            <IconCosts />
            <span className="nav__link-label">Costs Overview</span>
          </a>
        </div>
      </div>

      {/* Settings group */}
      <div className="nav-group sidebar-extras__group">
        <button type="button" className="nav-group__toggle" tabIndex={-1}>
          Settings
        </button>
        <div className="nav-group__content">
          <a href="/admin/settings/integrations" className="nav__link sidebar-extras__link">
            <IconIntegrations />
            <span className="nav__link-label">Integrations</span>
          </a>
        </div>
      </div>
    </>
  )
}

export default SidebarNavExtras
