"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useNav, usePreferences } from "@payloadcms/ui";
import { applyFieldInputHints } from "@/lib/field-input-hints";

const PHONE_QUERY = "(max-width: 768px)";
export const PHONE_COLLAPSED_ATTR = "data-od-phone-collapsed";

/** True when the group holds the page being viewed. */
function groupHoldsPage(group: Element, pathname: string): boolean {
  if (group.querySelector(".od-nav-active, [aria-current='page'], .nav__link--active")) return true;
  return Array.from(group.querySelectorAll<HTMLAnchorElement>("a[href]")).some((link) => {
    const href = link.getAttribute("href") ?? "";
    return href !== "/admin" && (pathname === href || pathname.startsWith(`${href}/`));
  });
}

/**
 * Phones only: when the drawer opens, every titled group except the one
 * holding the current page starts collapsed, so the drawer shows a short list
 * of group headers instead of every link. Tapping a header expands or
 * collapses it for this visit without touching the saved (desktop) open/closed
 * preference. Desktop is untouched.
 */
export function collapseOtherNavGroups(nav: ParentNode, pathname: string): void {
  nav.querySelectorAll(".nav-group").forEach((group) => {
    if (!group.querySelector(":scope > .nav-group__toggle")) return;
    if (groupHoldsPage(group, pathname)) group.removeAttribute(PHONE_COLLAPSED_ATTR);
    else group.setAttribute(PHONE_COLLAPSED_ATTR, "true");
  });
}

/** URL / email / number keyboards on the matching admin text fields. */
function useFieldInputHints(): void {
  useEffect(() => {
    applyFieldInputHints(document);
    const observer = new MutationObserver(() => applyFieldInputHints(document));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}

function usePhoneNavFocus(): void {
  const { navOpen } = useNav();
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (!navOpen || !window.matchMedia(PHONE_QUERY).matches) return;
    const nav = document.querySelector("aside.nav, .nav");
    if (nav) collapseOtherNavGroups(nav, pathname);
  }, [navOpen, pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (!window.matchMedia(PHONE_QUERY).matches) return;
      const toggle = (event.target as Element | null)?.closest?.(".nav .nav-group__toggle");
      const group = toggle?.parentElement;
      if (!toggle || !group?.classList.contains("nav-group")) return;
      event.preventDefault();
      event.stopPropagation();
      if (group.hasAttribute(PHONE_COLLAPSED_ATTR)) group.removeAttribute(PHONE_COLLAPSED_ATTR);
      else group.setAttribute(PHONE_COLLAPSED_ATTR, "true");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

/**
 * Payload admin `beforeNav` component — renders nothing visually, but runs
 * on every page load inside the admin shell (where PreferencesProvider is active).
 *
 * Payload stores nav group open/closed state under PREFERENCE_KEYS.NAV → groups.
 * The Clients group is mission-critical, so every admin-shell load resets it
 * to open. This intentionally overrides stale collapsed preferences.
 */
export function AdminNavSetup(): null {
  const { getPreference, setPreference } = usePreferences();
  usePhoneNavFocus();
  useFieldInputHints();

  useEffect(() => {
    const ensureClientsOpen = async () => {
      try {
        const navPrefs = (await getPreference("nav")) as
          | { groups?: Record<string, { open?: boolean }> }
          | undefined;
        const groups = navPrefs?.groups ?? {};

        if (groups["Clients"]?.open !== true) {
          await setPreference("nav", { groups: { Clients: { open: true } } }, true);
        }
      } catch {
        // Silently ignore — must not break the admin if preferences fail.
      }
    };

    void ensureClientsOpen();
  }, [getPreference, setPreference]);

  return null;
}

export default AdminNavSetup;
