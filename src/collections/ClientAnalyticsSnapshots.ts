import type { CollectionConfig } from "payload";
import { canAccess } from "../lib/access";

/** Aggregate GA4 reporting windows for Client Pulse. No visitor-level data is stored. */
export const ClientAnalyticsSnapshots: CollectionConfig = {
  slug: "client-analytics-snapshots",
  labels: { singular: "Client Analytics Snapshot", plural: "Client Analytics Snapshots" },
  admin: {
    useAsTitle: "dateRangeLabel",
    group: "Reports",
    hidden: true,
    description: "Aggregate GA4 reporting windows used by Client Pulse. Contains no person-level data.",
    defaultColumns: ["client", "dateRangeLabel", "periodStart", "periodEnd", "sessions", "keyEvents"],
  },
  access: {
    read: canAccess("nav:dashboard"),
    create: canAccess("nav:dashboard"),
    update: canAccess("nav:dashboard"),
    delete: canAccess("nav:dashboard"),
  },
  defaultSort: "-periodEnd",
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "source", type: "select", required: true, defaultValue: "ga4", options: [{ label: "Google Analytics 4", value: "ga4" }], index: true },
    { name: "dateRangeLabel", type: "text", required: true, index: true, admin: { description: "Stable reporting window key, such as MONTH_2026-07 or ROLLING_30D_CURRENT." } },
    { name: "periodStart", type: "date", required: true, index: true },
    { name: "periodEnd", type: "date", required: true, index: true },
    { name: "sessions", type: "number", min: 0 },
    { name: "keyEvents", type: "number", min: 0 },
    { name: "conversions", type: "number", min: 0 },
  ],
};
