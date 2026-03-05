"use client";

import { useEffect } from "react";

const SidebarLogo = () => {
  useEffect(() => {
    const container = document.querySelector(
      "#nav-group-Performance .nav-group__content"
    );
    if (!container || container.querySelector('[data-injected="search-console"]'))
      return;

    const link = document.createElement("a");
    link.href = "/admin/performance/search-console";
    link.className = "nav__link sidebar-extras__link";
    link.setAttribute("data-injected", "search-console");
    link.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span class="nav__link-label">Search Console</span>`;
    container.appendChild(link);
  }, []);

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
    </>
  );
};

export default SidebarLogo;
