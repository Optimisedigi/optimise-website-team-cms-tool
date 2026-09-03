import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";

/**
 * Google Ads change_event rows, persisted daily.
 *
 * The Google Ads API only serves change_event for the trailing ~30 days, so
 * anything not polled and stored here is lost forever. The custom
 * /admin/google-ads-automation page is the front door (same convention as
 * AgentApprovalQueue), hence admin.hidden.
 */
export const GoogleAdsAutomationEvents: CollectionConfig = {
  slug: "google-ads-automation-events" as any,
  labels: {
    singular: "Google Ads Automation Event",
    plural: "Google Ads Automation Events",
  },
  admin: {
    hidden: true,
    useAsTitle: "summary",
    defaultColumns: ["client", "changeDateTime", "changeResourceType", "clientType", "reviewStatus"],
    description: "Changes Google made to managed Ads accounts, polled daily from change_event.",
  },
  access: {
    read: ({ req }) => Boolean(req.user) || hasValidApiKey(req),
    create: ({ req }) => Boolean(req.user) || hasValidApiKey(req),
    update: ({ req }) => Boolean(req.user) || hasValidApiKey(req),
    delete: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
  },
  defaultSort: "-changeDateTime",
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", index: true },
    { name: "customerId", type: "text", index: true },
    {
      name: "changeDateTime",
      type: "text",
      index: true,
      admin: { description: "Google-reported change timestamp, account time zone." },
    },
    {
      name: "resourceName",
      type: "text",
      required: true,
      index: true,
      unique: true,
      admin: { description: "change_event.resource_name — the dedupe key across runs." },
    },
    { name: "changeResourceType", type: "text", index: true },
    { name: "resourceChangeOperation", type: "text" },
    {
      name: "clientType",
      type: "text",
      index: true,
      admin: { description: "change_event.client_type, e.g. GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION." },
    },
    { name: "userEmail", type: "text" },
    { name: "campaignId", type: "text", index: true },
    { name: "campaignName", type: "text" },
    { name: "changedFields", type: "json" },
    { name: "oldValues", type: "json" },
    { name: "newValues", type: "json" },
    {
      name: "isGoogleAutomated",
      type: "checkbox",
      index: true,
      defaultValue: false,
      admin: { description: "True when client_type is one of Google's own automation sources." },
    },
    { name: "summary", type: "text", admin: { description: "One human sentence describing the change." } },
    {
      name: "impact",
      type: "group",
      admin: { description: "Campaign spend/conversions 7 days before vs after, from google-ads-snapshots." },
      fields: [
        {
          type: "row",
          fields: [
            { name: "spendBefore", type: "number", admin: { width: "25%" } },
            { name: "spendAfter", type: "number", admin: { width: "25%" } },
            { name: "convBefore", type: "number", admin: { width: "25%" } },
            { name: "convAfter", type: "number", admin: { width: "25%" } },
          ],
        },
        { name: "computedAt", type: "text" },
      ],
    },
    {
      name: "reviewStatus",
      type: "select",
      defaultValue: "unreviewed",
      index: true,
      options: [
        { label: "Unreviewed", value: "unreviewed" },
        { label: "Flagged", value: "flagged" },
        { label: "Accepted", value: "accepted" },
        { label: "Reverted", value: "reverted" },
      ],
    },
    { name: "relatedApproval", type: "relationship", relationTo: "agent-approval-queue" as any },
  ],
};
