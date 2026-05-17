import type { GlobalConfig } from "payload";
import { globalAccess, hideGlobalUnlessFeature } from "../lib/access";

export const ApiCostRates: GlobalConfig = {
  slug: "api-cost-rates",
  label: "API Cost Rates",
  admin: {
    group: "Costs Overview",
    description: "Configurable cost-per-unit rates (AUD) and monthly subscriptions. Update when provider prices change.",
    hidden: hideGlobalUnlessFeature("api-cost-rates"),
  },
  access: globalAccess("api-cost-rates"),
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "API Usage Rates",
          fields: [
            {
              name: "seoAuditCost",
              type: "number",
              defaultValue: 0.012,
              admin: { description: "Cost per SEO audit (AUD)" },
            },
            {
              name: "croAuditCost",
              type: "number",
              defaultValue: 0.005,
              admin: { description: "Cost per CRO audit (AUD)" },
            },
            {
              name: "keywordSnapshotCost",
              type: "number",
              defaultValue: 0.008,
              admin: { description: "Cost per keyword snapshot (AUD)" },
            },
            {
              name: "competitorAnalysisCost",
              type: "number",
              defaultValue: 0.01,
              admin: { description: "Cost per competitor analysis (AUD)" },
            },
            {
              name: "contentResearchCost",
              type: "number",
              defaultValue: 0.004,
              admin: { description: "Cost per content research (AUD)" },
            },
            {
              name: "blogImageCost",
              type: "number",
              defaultValue: 0.031,
              admin: { description: "Cost per blog image generation (AUD)" },
            },
          ],
        },
        {
          label: "Subscriptions",
          description: "Monthly fixed costs for LLM services and infrastructure. These are included in the usage dashboard.",
          fields: [
            {
              name: "subscriptions",
              type: "array",
              admin: {
                description: "Monthly subscription costs. These recur until removed.",
              },
              fields: [
                {
                  name: "name",
                  type: "text",
                  required: true,
                  admin: { description: "Service name (e.g. Gemini, Kimi, Claude)" },
                },
                {
                  name: "category",
                  type: "select",
                  defaultValue: "llm",
                  options: [
                    { label: "LLM / AI", value: "llm" },
                    { label: "Infrastructure", value: "infra" },
                    { label: "Other", value: "other" },
                  ],
                },
                {
                  name: "monthlyCostAud",
                  type: "number",
                  required: true,
                  min: 0,
                  admin: { description: "Monthly cost in AUD", step: 0.01 },
                },
                {
                  name: "startDate",
                  type: "date",
                  required: true,
                  admin: { description: "When this subscription started. Only included in cost calculations from this date." },
                },
                {
                  name: "isActive",
                  type: "checkbox",
                  defaultValue: true,
                  admin: { description: "Uncheck to stop including in cost calculations" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
