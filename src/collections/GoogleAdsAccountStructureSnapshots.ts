import type { CollectionConfig } from "payload";

export const GoogleAdsAccountStructureSnapshots: CollectionConfig = {
  slug: "google-ads-account-structure-snapshots",
  labels: {
    singular: "Google Ads Account Structure Snapshot",
    plural: "Google Ads Account Structure Snapshots",
  },
  admin: {
    hidden: true,
    useAsTitle: "clientSlug",
    defaultColumns: ["clientSlug", "customerId", "capturedAt", "source"],
    description:
      "Latest full Account Structure Explorer payload per client. Used to avoid live Growth Tools calls on every page load.",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => !!req.user && req.user.role === "admin",
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      index: true,
    },
    {
      name: "clientSlug",
      type: "text",
      required: true,
      index: true,
    },
    {
      name: "customerId",
      type: "text",
      required: true,
      index: true,
    },
    {
      name: "capturedAt",
      type: "date",
      required: true,
      index: true,
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
      },
    },
    {
      name: "dateRangeStart",
      type: "text",
      admin: {
        description: "Window start date (YYYY-MM-DD).",
      },
    },
    {
      name: "dateRangeEnd",
      type: "text",
      admin: {
        description: "Window end date (YYYY-MM-DD).",
      },
    },
    {
      name: "source",
      type: "select",
      required: true,
      defaultValue: "cron",
      options: [
        { label: "Cron", value: "cron" },
        { label: "Manual refresh", value: "manual_refresh" },
      ],
    },
    {
      name: "payload",
      type: "json",
      required: true,
      admin: {
        description: "Full AccountStructureResponse JSON from Growth Tools.",
      },
    },
    {
      name: "error",
      type: "text",
      admin: {
        description: "Last refresh error, if any. Successful snapshots keep this empty.",
      },
    },
  ],
};
