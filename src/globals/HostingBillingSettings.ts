import type { GlobalConfig } from "payload";
import { globalAccess, hideGlobalUnlessFeature } from "../lib/access";

export const HostingBillingSettings: GlobalConfig = {
  slug: "hosting-billing-settings",
  label: "Hosting Billing Settings",
  admin: { group: "Finance", hidden: hideGlobalUnlessFeature("hosting-billing-settings"), description: "Plans, disclosed card surcharge and capacity-change notice terms." },
  access: globalAccess("hosting-billing-settings"),
  fields: [
    { type: "tabs", tabs: [
      { label: "Billing", fields: [
        { name: "currency", type: "text", required: true, defaultValue: "aud", validate: (v: unknown) => /^[a-z]{3}$/.test(String(v || "")) || "Use a three-letter ISO currency code." },
        { name: "cardSurchargePercentage", type: "number", required: true, defaultValue: 0, min: 0, max: 99.99, admin: { description: "Disclosed card processing percentage. Finance/legal approval is required before production use." } },
        { name: "cardSurchargeFixedCents", type: "number", required: true, defaultValue: 0, min: 0 },
        { name: "surchargeEffectiveFrom", type: "date" },
        { name: "minimumNoticeDays", type: "number", required: true, defaultValue: 30, min: 1 },
      ] },
      { label: "Hosting plans", fields: [{ name: "plans", type: "array", admin: { description: "Edits affect future offers only. Issued offers and subscriptions retain their snapshots." }, fields: [
        { name: "name", type: "text", required: true }, { name: "description", type: "textarea" }, { name: "includedAllowance", type: "textarea", required: true },
        { name: "monthlyBaseCents", type: "number", required: true, min: 1 }, { name: "annualBaseCents", type: "number", required: true, min: 1 }, { name: "active", type: "checkbox", defaultValue: true },
      ] }] },
      { label: "Client terms", fields: [
        { name: "capacityChangeClause", type: "textarea", required: true, defaultValue: "If hosting capacity exceeds the included allowance, we may propose a future price change with written notice. The change will take effect at a future renewal only." },
        { name: "noticeEmailSubject", type: "text", required: true, defaultValue: "Hosting capacity price change notice for {{clientName}}" },
        { name: "noticeEmailBody", type: "textarea", required: true, defaultValue: "Hello {{clientName}},\n\nWe are proposing a hosting price change from {{currentPrice}} to {{newPrice}}, effective on {{effectiveDate}}. Reason: {{reason}}." },
      ] },
    ] },
  ],
};
