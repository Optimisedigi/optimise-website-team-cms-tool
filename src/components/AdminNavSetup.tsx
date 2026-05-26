"use client";

import { useEffect } from "react";
import { usePreferences } from "@payloadcms/ui";

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
