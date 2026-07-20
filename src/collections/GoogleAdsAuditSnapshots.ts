import type { CollectionConfig } from "payload";
import { cleanupSnapshotEvidenceBlobs } from "@/lib/google-ads-audit-snapshots/evidence-storage";

const isAdmin = ({ req }: { req: { user?: { role?: string } | null } }) => req.user?.role === "admin";

export const GoogleAdsAuditSnapshots: CollectionConfig = {
  slug: "google-ads-audit-snapshots",
  labels: { singular: "Google Ads Audit Snapshot", plural: "Google Ads Audit Snapshots" },
  admin: {
    group: "Growth Tools",
    useAsTitle: "customerId",
    defaultColumns: ["client", "status", "periodStart", "periodEnd", "capturedAt"],
    description: "Immutable audit evidence metadata and compact deterministic analysis. Raw evidence is stored in private compressed objects when configured."
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
    beforeDelete: [async ({ id, req }) => {
      if (!req.context?.googleAdsSnapshotInternal) throw new Error("Google Ads audit snapshots cannot be deleted through ordinary requests");
      await cleanupSnapshotEvidenceBlobs(req.payload, id);
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
    { name: "accountName", type: "text", required: true },
    { name: "currencyCode", type: "text", required: true },
    { name: "requestedAt", type: "date", required: true, index: true },
    { name: "capturedAt", type: "date" },
    { name: "finalizedAt", type: "date" },
    { name: "periodStart", type: "date", required: true },
    { name: "periodEnd", type: "date", required: true },
    { name: "earliestAvailableActivityDate", type: "date", required: true },
    { name: "retentionCaveat", type: "textarea" },
    { name: "schemaVersion", type: "number", required: true, defaultValue: 3 },
    { name: "rubricVersion", type: "text", required: true, defaultValue: "2026-07-complete-evidence-v3", admin: { readOnly: true } },
    { name: "websiteUrl", type: "text", admin: { readOnly: true } },
    { name: "businessName", type: "text", required: true, admin: { readOnly: true } },
    { name: "businessType", type: "text", admin: { readOnly: true } },
    { name: "brandTerms", type: "json", required: true, admin: { readOnly: true } },
    { name: "conversionObjectives", type: "json", required: true, admin: { readOnly: true } },
    { name: "searchLocation", type: "text", required: true, admin: { readOnly: true } },
    { name: "searchLanguage", type: "text", required: true, admin: { readOnly: true } },
    { name: "competitorSeedQueries", type: "json", required: true, admin: { readOnly: true } },
    { name: "captureContext", type: "json", required: true, admin: { readOnly: true, description: "Frozen business, targeting, and rubric context for reproducible evidence capture" } },
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
    { name: "analysisBlobUrl", type: "text" },
    { name: "analysisBlobPathname", type: "text", index: true },
    { name: "analysisBlobChecksum", type: "text" },
    { name: "analysisBlobEncoding", type: "select", options: ["gzip"] },
    { name: "analysisBlobCompressedBytes", type: "number", min: 0 },
    { name: "analysisBlobUncompressedBytes", type: "number", min: 0 }
  ],
};
