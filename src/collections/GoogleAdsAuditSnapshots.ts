import type { CollectionConfig } from "payload";

const isAdmin = ({ req }: { req: { user?: { role?: string } | null } }) => req.user?.role === "admin";

export const GoogleAdsAuditSnapshots: CollectionConfig = {
  slug: "google-ads-audit-snapshots",
  labels: { singular: "Google Ads Audit Snapshot", plural: "Google Ads Audit Snapshots" },
  admin: {
    group: "Growth Tools",
    useAsTitle: "customerId",
    defaultColumns: ["client", "status", "periodStart", "periodEnd", "capturedAt"],
    description: "Immutable audit evidence and deterministic analysis. Raw source rows are stored in bounded hidden chunks.",
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [({ operation, originalDoc, req }) => {
      if (operation === "update" && originalDoc?.status === "completed" && !req.context?.googleAdsSnapshotInternal) {
        throw new Error("Completed Google Ads audit snapshots are immutable");
      }
    }],
    beforeDelete: [({ req }) => {
      if (!req.context?.googleAdsSnapshotInternal) throw new Error("Google Ads audit snapshots cannot be deleted through ordinary requests");
    }],
  },
  indexes: [
    { fields: ["audit", "status"] },
    { fields: ["client", "requestedAt"] },
  ],
  fields: [
    { name: "audit", type: "relationship", relationTo: "google-ads-audits", required: true, index: true },
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "proposal", type: "relationship", relationTo: "client-proposals", index: true },
    { name: "customerId", type: "text", required: true, index: true },
    { name: "accountTimeZone", type: "text", required: true },
    { name: "currencyCode", type: "text", required: true },
    { name: "requestedAt", type: "date", required: true, index: true },
    { name: "capturedAt", type: "date" },
    { name: "finalizedAt", type: "date" },
    { name: "periodStart", type: "date", required: true },
    { name: "periodEnd", type: "date", required: true },
    { name: "earliestAvailableActivityDate", type: "date", required: true },
    { name: "retentionCaveat", type: "textarea" },
    { name: "schemaVersion", type: "number", required: true, defaultValue: 1 },
    {
      name: "status", type: "select", required: true, defaultValue: "pending", index: true,
      options: ["pending", "running", "completed", "failed"],
    },
    { name: "progress", type: "number", min: 0, max: 100, defaultValue: 0 },
    { name: "error", type: "textarea" },
    { name: "retryCount", type: "number", defaultValue: 0 },
    { name: "growthToolsJobId", type: "text", index: true },
    { name: "sourceRowCounts", type: "json" },
    { name: "chunkManifest", type: "json" },
    { name: "manifestChecksum", type: "text" },
    { name: "analysis", type: "json" },
  ],
};
