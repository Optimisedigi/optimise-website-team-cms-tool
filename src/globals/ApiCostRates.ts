import type { GlobalConfig } from "payload";

export const ApiCostRates: GlobalConfig = {
  slug: "api-cost-rates",
  label: "API Cost Rates",
  admin: {
    group: "Cost Setup",
    description: "Configurable cost-per-unit rates (AUD) for each API tool. Update when provider prices change.",
  },
  access: {
    read: ({ req }) => !!req.user,
    update: ({ req }) => req.user?.role === "admin",
  },
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
};
