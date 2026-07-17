import type { CollectionConfig } from "payload";

const isAdmin = ({ req }: { req: { user?: { role?: string } | null } }) => req.user?.role === "admin";

export const GoogleAdsAuditSnapshotChunks: CollectionConfig = {
  slug: "google-ads-audit-snapshot-chunks",
  labels: { singular: "Google Ads Audit Snapshot Chunk", plural: "Google Ads Audit Snapshot Chunks" },
  admin: { hidden: true, useAsTitle: "identity" },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: {
    beforeValidate: [({ data }) => {
      if (data) data.identity = `${typeof data.snapshot === "object" ? data.snapshot?.id : data.snapshot}:${data.datasetKey}:${data.chunkIndex}`;
      return data;
    }],
    beforeChange: [({ operation, req }) => {
      if (operation === "update" && !req.context?.googleAdsSnapshotInternal) throw new Error("Audit source chunks are immutable");
    }],
    beforeDelete: [({ req }) => {
      if (!req.context?.googleAdsSnapshotInternal) throw new Error("Audit source chunks cannot be deleted through ordinary requests");
    }],
  },
  indexes: [{ fields: ["snapshot", "datasetKey", "chunkIndex"], unique: true }],
  fields: [
    { name: "identity", type: "text", required: true, unique: true, index: true },
    { name: "snapshot", type: "relationship", relationTo: "google-ads-audit-snapshots" as any, required: true, index: true },
    {
      name: "datasetKey", type: "select", required: true, index: true,
      options: [
        "customer_metadata", "monthly_account_metrics", "monthly_campaign_metrics", "campaigns", "ad_groups", "keywords",
        "search_terms", "conversion_actions", "conversion_action_performance", "campaign_impression_share", "auction_insights",
        "campaign_negative_keywords", "shared_negative_keywords", "campaign_shared_set_assignments", "ads", "ad_assets", "landing_page_views",
      ],
    },
    { name: "chunkIndex", type: "number", required: true, min: 0, index: true },
    { name: "rowCount", type: "number", required: true, min: 0 },
    { name: "checksum", type: "text", required: true },
    { name: "rows", type: "json", required: true },
  ],
};
