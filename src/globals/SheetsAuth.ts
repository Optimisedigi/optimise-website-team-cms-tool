import type { GlobalConfig } from "payload";
import { globalAccess, hideGlobalUnlessFeature } from "../lib/access";

export const SheetsAuth: GlobalConfig = {
  slug: "sheets-auth",
  label: "Google Sheets Auth",
  admin: {
    group: "Integrations",
    description:
      "Google Sheets OAuth token for writing negative keywords to client spreadsheets. Connect once to enable all clients.",
    hidden: hideGlobalUnlessFeature("sheets-auth"),
  },
  access: globalAccess("sheets-auth"),
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
