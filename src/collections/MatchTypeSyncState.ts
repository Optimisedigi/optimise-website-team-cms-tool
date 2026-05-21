import type { CollectionConfig } from "payload";

export const MatchTypeSyncState: CollectionConfig = {
  slug: "match-type-sync-state",
  dbName: "match_type_sync_state",
  labels: {
    singular: "Match Type Sync State",
    plural: "Match Type Sync States",
  },
  admin: {
    hidden: true,
    group: "Growth Tools",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: () => false,
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      unique: true,
    },
    {
      name: "lastRunAt",
      type: "date",
      required: true,
      label: "Last Run",
      admin: {
        date: { pickerAppearance: "dayAndTime" },
        description: "ISO timestamp of last successful cron run",
      },
    },
  ],
};
