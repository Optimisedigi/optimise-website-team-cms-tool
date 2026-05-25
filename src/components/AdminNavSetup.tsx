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
    const ensureClientsOpen = async () => {
      try {
        const navPrefs = (await getPreference("nav")) as
          | { groups?: Record<string, { open?: boolean }> }
          | undefined;
        const groups = navPrefs?.groups ?? {};

        if (groups["Clients"] === undefined) {
          await setPreference(
            "nav",
            { groups: { ...groups, Clients: { open: true } } },
            true,
          );
        }
      } catch {
        // Silently ignore — must not break the admin if preferences fail.
      }
    };

    void ensureClientsOpen();
  }, [getPreference, setPreference]);

  return null;
}
