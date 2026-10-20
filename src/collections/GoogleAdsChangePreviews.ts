import type { CollectionConfig } from "payload";
import { ownerOrAdmin } from "./ClientEmails";

/**
 * Live Google Ads changes OptiMate has prepared but not sent. The agent's
 * `execute_google_ads_action` tool stores the exact Growth Tools request here;
 * only an admin tapping "Apply live" in chat sends it
 * (/api/optimate/google-ads-changes/:id/apply). Written only by server code
 * through raw SQL (src/lib/agents/optimate-google-ads/change-previews.ts), so
 * the pending -> applying claim is atomic. Kept as an audit trail of who
 * applied what.
 */
export const GoogleAdsChangePreviews: CollectionConfig = {
  slug: "google-ads-change-previews",
  labels: { singular: "Google Ads Change Preview", plural: "Google Ads Change Previews" },
  lockDocuments: false,
  admin: { hidden: true, useAsTitle: "action", group: "OptiMate" },
  defaultSort: "-createdAt",
  access: {
    read: ownerOrAdmin,
    create: () => false,
    update: () => false,
    delete: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
  },
  fields: [
    { name: "owner", type: "relationship", relationTo: "users", required: true, index: true },
    {
      name: "status",
      type: "select",
      defaultValue: "pending",
      required: true,
      index: true,
      options: ["pending", "applying", "applied", "failed", "cancelled"],
    },
    { name: "customerId", type: "text", required: true, index: true },
    { name: "auditId", type: "number" },
    { name: "clientId", type: "number" },
    { name: "agentRunId", type: "text", index: true },
    { name: "action", type: "text", required: true },
    { name: "method", type: "text", required: true },
    { name: "path", type: "text", required: true },
    { name: "requestBody", type: "json" },
    { name: "summary", type: "text" },
    { name: "expiresAt", type: "date", required: true },
    { name: "appliedAt", type: "date" },
    { name: "result", type: "json" },
    { name: "lastError", type: "text" },
  ],
};
