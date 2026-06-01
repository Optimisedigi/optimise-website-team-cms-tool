import type { CollectionConfig } from "payload";
import { adminOnlyDelete, canAccess } from "../lib/access";

export const ForecastScenarios: CollectionConfig = {
  slug: "forecast-scenarios",
  labels: {
    singular: "Forecast Scenario",
    plural: "Forecast Scenarios",
  },
  admin: {
    useAsTitle: "title",
    group: "Reports",
    description: "Saved Forecast Lab scenarios for client growth planning. Managed from each Client's Forecast Scenarios tab.",
    defaultColumns: ["title", "client", "scenarioType", "status", "publishedAt"],
    hidden: true,
  },
  access: {
    read: canAccess("clients"),
    create: canAccess("clients"),
    update: canAccess("clients"),
    delete: adminOnlyDelete,
  },
  defaultSort: "-updatedAt",
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "proposal", type: "relationship", relationTo: "client-proposals", index: true },
    { name: "title", type: "text", required: true },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      index: true,
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" },
      ],
    },
    {
      name: "scenarioType",
      type: "select",
      required: true,
      defaultValue: "custom",
      options: [
        { label: "Google Ads Budget", value: "google_ads_budget" },
        { label: "Organic Growth", value: "organic_growth" },
        { label: "Blended Growth", value: "blended_growth" },
        { label: "Custom", value: "custom" },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "baselinePeriodStart", type: "date", admin: { width: "50%" } },
        { name: "baselinePeriodEnd", type: "date", admin: { width: "50%" } },
      ],
    },
    {
      name: "assumptions",
      type: "group",
      fields: [
        { name: "monthlyAdSpend", type: "number" },
        { name: "targetMonthlyAdSpend", type: "number" },
        { name: "currentCpa", type: "number" },
        { name: "targetCpa", type: "number" },
        { name: "conversionRate", type: "number", admin: { description: "Decimal rate, e.g. 0.03 for 3%." } },
        { name: "averageOrderValue", type: "number" },
        { name: "leadCloseRate", type: "number", admin: { description: "Decimal rate, e.g. 0.25 for 25%." } },
        { name: "averageClientValue", type: "number" },
        { name: "organicClickGrowthPct", type: "number" },
        { name: "confidenceLevel", type: "number", admin: { description: "Optional 0-1 confidence score." } },
      ],
    },
    {
      name: "outputs",
      type: "json",
      admin: {
        description: "Scenario bands JSON: conservative/base/optimistic leads, revenue, CPA/ROAS, organic clicks/impressions.",
      },
    },
    { name: "publishedAt", type: "date" },
    { name: "notes", type: "textarea" },
    { name: "clientSummary", type: "textarea" },
  ],
};
