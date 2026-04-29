import type { GlobalConfig } from "payload";

export const SheetsAuth: GlobalConfig = {
  slug: "sheets-auth",
  label: "Google Sheets Auth",
  admin: {
    group: "Settings",
    description:
      "Google Sheets OAuth token for writing negative keywords to client spreadsheets. Connect once to enable all clients.",
  },
  access: {
    read: ({ req }) => !!req.user,
    update: ({ req }) => req.user?.role === "admin",
  },
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
        description: "Google account connected for Sheets access",
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
      name: "connectSheets",
      type: "ui",
      admin: {
        components: {
          Field: "./components/ConnectSheetsButton",
        },
      },
    },
  ],
};
