import type { CollectionConfig } from "payload";
import { canAccess } from "../lib/access";

export const AgencyKpiSnapshots: CollectionConfig = {
  slug: "agency-kpi-snapshots",
  labels: {
    singular: "Agency KPI Snapshot",
    plural: "Agency KPI Snapshots",
  },
  admin: {
    useAsTitle: "month",
    group: "Reports",
    description: "Monthly agency KPI snapshots used for dashboard month-on-month comparisons.",
    defaultColumns: ["month", "activeClients", "activeLeads", "arr", "monthlyRetainer", "mtdCosts"],
    hidden: true,
  },
  access: {
    read: canAccess("nav:dashboard"),
    create: canAccess("nav:dashboard"),
    update: canAccess("nav:dashboard"),
    delete: canAccess("nav:dashboard"),
  },
  defaultSort: "-month",
  fields: [
    {
      name: "month",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description: "Month key in YYYY-MM format.",
      },
    },
    { name: "activeClients", type: "number", required: true, defaultValue: 0 },
    { name: "activeLeads", type: "number", required: true, defaultValue: 0 },
    { name: "arr", type: "number", required: true, defaultValue: 0 },
    { name: "monthlyRetainer", type: "number", required: true, defaultValue: 0 },
    { name: "retainerYTD", type: "number", required: true, defaultValue: 0 },
    { name: "oneOffYTD", type: "number", required: true, defaultValue: 0 },
    { name: "leadConversion", type: "number", required: true, defaultValue: 0 },
    { name: "mtdCosts", type: "number", required: true, defaultValue: 0 },
  ],
};
