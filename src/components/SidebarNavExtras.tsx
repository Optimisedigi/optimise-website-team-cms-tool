'use client'

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
            <span className="nav__link-label">Search Console</span>
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
            <span className="nav__link-label">Integrations</span>
          </a>
        </div>
      </div>
    </>
  )
}

export default SidebarNavExtras
