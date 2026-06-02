import type { GlobalConfig } from "payload";
import { globalAccess } from "../lib/access";

export const CalendarAuth: GlobalConfig = {
  slug: "calendar-auth",
  label: "Google Calendar Auth",
  admin: {
    group: "Settings",
    description:
      "Google Calendar OAuth token for checking availability and creating meeting events. Connect once to enable meeting scheduling.",
    hidden: true,
  },
  access: globalAccess("calendar-auth"),
  fields: [
    {
      name: "refreshToken",
      type: "text",
      admin: {
        hidden: true,
      },
    },
    {
      name: "connectedEmail",
      type: "text",
      admin: {
        readOnly: true,
        description: "Google account connected for Calendar access",
      },
    },
    {
      name: "connectedAt",
      type: "date",
      admin: {
        readOnly: true,
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "connectCalendar",
      type: "ui",
      admin: {
        components: {
          Field: "./components/ConnectCalendarButton",
        },
      },
    },
  ],
};
