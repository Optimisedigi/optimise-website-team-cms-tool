'use client'

const IconIntegrations = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
  </svg>
)

const SidebarNavExtras = () => {
  return (
    <>
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
