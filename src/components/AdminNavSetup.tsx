"use client";

import { useEffect } from "react";
import { usePreferences } from "@payloadcms/ui";

/**
 * Payload admin `beforeNav` component — renders nothing visually, but runs
 * on every page load inside the admin shell (where PreferencesProvider is active).
 *
 * Payload stores nav group open/closed state under PREFERENCE_KEYS.NAV → groups.
 * If "Clients" has never been persisted (undefined), it defaults to open.
 * Once the user toggles it, their preference takes over.
 */
export function AdminNavSetup(): null {
  const { getPreference, setPreference } = usePreferences();

  useEffect(() => {
    const openClientsGroupInDom = () => {
      const group = document.getElementById("nav-group-Clients");
      if (!group) return;

      group.classList.remove("nav-group--collapsed");
      const toggle = group.querySelector(".nav-group__toggle");
      toggle?.classList.remove("nav-group__toggle--collapsed");
      toggle?.classList.add("nav-group__toggle--open");

      const animatedWrapper = group.querySelector<HTMLElement>(".nav-group__content")?.parentElement;
      if (animatedWrapper) {
        animatedWrapper.style.height = "auto";
        animatedWrapper.style.overflow = "visible";
      }
    };

    const ensureClientsOpen = async () => {
      try {
        const navPrefs = (await getPreference("nav")) as
          | { groups?: Record<string, { open?: boolean }> }
          | undefined;
        const groups = navPrefs?.groups ?? {};

        if (groups["Clients"]?.open !== true) {
          await setPreference(
            "nav",
            { groups: { ...groups, Clients: { ...groups["Clients"], open: true } } },
            true,
          );
        }
      } catch {
        // Silently ignore — must not break the admin if preferences fail.
      } finally {
        openClientsGroupInDom();
      }
    };

    void ensureClientsOpen();
    const interval = window.setInterval(openClientsGroupInDom, 250);
    return () => window.clearInterval(interval);
  }, [getPreference, setPreference]);

  return null;
}

export default AdminNavSetup;
