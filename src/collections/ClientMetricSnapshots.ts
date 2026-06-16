import type { CollectionConfig } from "payload";
import { canAccess } from "../lib/access";

export const ClientMetricSnapshots: CollectionConfig = {
  slug: "client-metric-snapshots",
  labels: {
    singular: "Client Metric Snapshot",
    plural: "Client Metric Snapshots",
  },
  admin: {
    useAsTitle: "date",
    group: "Reports",
    description: "Daily aggregate client KPI snapshots from external systems. Stores counts only, never patient/person-level data.",
    defaultColumns: ["date", "client", "source", "assessmentsCompleted", "prescriptions", "asOf"],
    hidden: true,
  },
  access: {
    read: canAccess("nav:dashboard"),
    create: canAccess("nav:dashboard"),
    update: canAccess("nav:dashboard"),
    delete: canAccess("nav:dashboard"),
  },
  defaultSort: "-date",
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      index: true,
    },
    {
      name: "source",
      type: "text",
      required: true,
      defaultValue: "website-we-can-quit",
      index: true,
      admin: {
        description: "External system that supplied the aggregate counts.",
      },
    },
    {
      name: "date",
      type: "text",
      required: true,
      index: true,
      admin: {
        description: "Snapshot date in YYYY-MM-DD, derived from the source asOf timestamp.",
      },
    },
    {
      name: "trackingStartDate",
      type: "text",
      required: true,
      admin: {
        description: "Inclusive tracking start date in YYYY-MM-DD.",
      },
    },
    { name: "assessmentsCompleted", type: "number", required: true, min: 0, defaultValue: 0 },
    { name: "prescriptions", type: "number", required: true, min: 0, defaultValue: 0 },
    { name: "assessmentTarget", type: "number", required: true, min: 0, defaultValue: 500 },
    { name: "prescriptionTarget", type: "number", required: true, min: 0, defaultValue: 500 },
    {
      name: "asOf",
      type: "date",
      required: true,
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        description: "When the source system computed these counts.",
      },
    },
  ],
};
