import type { CollectionConfig } from "payload";
import { SNAPSHOT_DATASET_KEYS } from "@/lib/google-ads-audit-snapshots/types";

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
      if (operation === "update" && !req.context?.googleAdsSnapshotInternal && req.user?.role !== "admin") throw new Error("Audit source chunks are immutable");
    }],
    beforeDelete: [({ req }) => {
      if (!req.context?.googleAdsSnapshotInternal && req.user?.role !== "admin") throw new Error("Audit source chunks cannot be deleted through ordinary requests");
    }],
  },
  indexes: [{ fields: ["snapshot", "datasetKey", "chunkIndex"], unique: true }],
  fields: [
    { name: "identity", type: "text", required: true, unique: true, index: true },
    { name: "snapshot", type: "relationship", relationTo: "google-ads-audit-snapshots" as any, required: true, index: true },
    {
      name: "datasetKey", type: "select", required: true, index: true,
      options: [...SNAPSHOT_DATASET_KEYS],
    },
    { name: "chunkIndex", type: "number", required: true, min: 0, index: true },
    { name: "rowCount", type: "number", required: true, min: 0 },
    { name: "checksum", type: "text", required: true },
    { name: "storageMode", type: "select", required: true, defaultValue: "database_json", options: ["database_json", "private_blob_gzip_v1"], index: true },
    { name: "rows", type: "json" },
    { name: "blobUrl", type: "text" },
    { name: "blobPathname", type: "text", index: true },
    { name: "encoding", type: "select", options: ["gzip"] },
    { name: "compressedBytes", type: "number", min: 0 },
    { name: "uncompressedBytes", type: "number", min: 0 }
  ],
};
