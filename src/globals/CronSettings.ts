import type { GlobalConfig } from "payload";
import { globalAccess } from "../lib/access";

export const CronSettings: GlobalConfig = {
  slug: "cron-settings",
  label: "Cron Settings",
  admin: {
    group: "Settings",
    description:
      "Timezone and scheduling for automated cron jobs. Times are evaluated in the agency's timezone, including DST.",
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
          "IANA timezone for all agency cron jobs, e.g. Australia/Sydney, Europe/London, America/New_York. Handles DST automatically.",
      },
    },
    {
      name: "matchTypeMonitorSyncHour",
      type: "number",
      defaultValue: 9,
      min: 0,
      max: 23,
      required: true,
      admin: {
        description:
          "Hour (0–23, in agency timezone) when match type violations are synced from Google Ads. Defaults to 9 (9am).",
      },
    },
  ],
};
