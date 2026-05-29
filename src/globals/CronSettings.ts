import type { GlobalConfig } from "payload";
import { globalAccess } from "../lib/access";

export const CronSettings: GlobalConfig = {
  slug: "cron-settings",
  label: "System Schedules",
  admin: {
    group: "Settings",
    description:
      "Timezone and scheduled automation jobs for the whole CMS. Times are evaluated in the agency timezone, including DST.",
  },
  access: globalAccess("cron-settings"),
  fields: [
    {
      name: "timezone",
      type: "text",
      defaultValue: "Australia/Sydney",
      required: true,
      admin: {
        description:
          "Global timezone for the entire CMS. Every scheduled job below runs in this timezone. IANA format, e.g. Australia/Sydney, Europe/London, America/New_York. Handles DST automatically.",
      },
    },
    {
      type: "collapsible",
      label: "Schedule: Match Type Monitor",
      admin: {
        initCollapsed: false,
        description:
          "Syncs match type violations from Google Ads for clients with the monitor enabled.",
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "matchTypeMonitorEnabled",
              type: "checkbox",
              defaultValue: true,
              label: "Enabled",
              admin: {
                width: "30%",
                description: "Turn this scheduled sync on or off.",
              },
            },
            {
              name: "matchTypeMonitorSyncHour",
              type: "number",
              defaultValue: 9,
              min: 0,
              max: 23,
              required: true,
              label: "Run at hour",
              admin: {
                width: "70%",
                description:
                  "Hour of day (0–23, agency timezone) to run the sync. e.g. 9 = 9am.",
              },
            },
          ],
        },
      ],
    },
  ],
};
