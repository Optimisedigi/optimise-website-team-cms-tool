'use client'

const SidebarNavExtras = () => {
  return (
    <>
      {/* Performance group */}
      <div className="nav-group" style={{ marginTop: 8 }}>
        <div
          className="nav-group__toggle"
          style={{
            color: 'rgba(255, 255, 255, 0.5)',
            textTransform: 'uppercase',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            padding: '10px 0 6px',
          }}
        >
          Performance
        </div>
        <div className="nav-group__content">
          <a
            href="/admin/performance/search-console"
            className="nav__link"
            style={{
              display: 'block',
              padding: '4px 0 4px 12px',
              fontSize: 13,
              color: 'rgba(255, 255, 255, 0.7)',
              textDecoration: 'none',
            }}
          >
            Search Console
          </a>
        </div>
      </div>

      {/* Settings group */}
      <div className="nav-group" style={{ marginTop: 4 }}>
        <div
          className="nav-group__toggle"
          style={{
            color: 'rgba(255, 255, 255, 0.5)',
            textTransform: 'uppercase',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            padding: '10px 0 6px',
          }}
        >
          Settings
        </div>
        <div className="nav-group__content">
          <a
            href="/admin/settings/integrations"
            className="nav__link"
            style={{
              display: 'block',
              padding: '4px 0 4px 12px',
              fontSize: 13,
              color: 'rgba(255, 255, 255, 0.7)',
              textDecoration: 'none',
            }}
          >
            Integrations
          </a>
        </div>
      </div>
    </>
  )
}

export default SidebarNavExtras
