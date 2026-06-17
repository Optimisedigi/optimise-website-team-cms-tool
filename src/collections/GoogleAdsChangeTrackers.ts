import type { CollectionConfig } from "payload";

export const GoogleAdsChangeTrackers: CollectionConfig = {
  slug: "google-ads-change-trackers",
  labels: {
    singular: "Google Ads Change Tracker",
    plural: "Google Ads Change Trackers",
  },
  admin: {
    hidden: true,
    useAsTitle: "name",
    defaultColumns: ["name", "updatedAt"],
    description: "Saved Google Ads change-tracker workspaces shared by the internal admin team.",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => !!req.user && req.user.role === "admin",
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      index: true,
      defaultValue: "Default Google Ads Change Tracker",
    },
    {
      name: "workspaceKey",
      type: "text",
      required: true,
      index: true,
      defaultValue: "default",
      admin: {
        description: "Stable key for the shared tracker workspace.",
      },
    },
    {
      name: "view",
      type: "select",
      required: true,
      defaultValue: "daily",
      options: [
        { label: "Daily", value: "daily" },
        { label: "Weekly", value: "weekly" },
      ],
    },
    {
      name: "graphs",
      type: "json",
      required: true,
      admin: {
        description: "Serialized graph settings: client, campaigns, metrics, change date, labels, trend line, and title.",
      },
    },
  ],
};
