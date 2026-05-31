import type { CollectionConfig } from "payload";
import { logActivity } from "../lib/activity-log";
import { createLedgerItem } from "../lib/client-value-ledger";
import { adminOnlyDelete, canAccess, hideUnlessFeature } from "../lib/access";

export const QuarterlyOrganicGrowthSnapshots: CollectionConfig = {
  slug: "quarterly-organic-growth-snapshots",
  labels: {
    singular: "Quarterly Organic Growth Snapshot",
    plural: "Quarterly Organic Growth Snapshots",
  },
  admin: {
    useAsTitle: "snapshotDate",
    group: "Reports",
    description: "Ongoing organic growth snapshots for client hub reporting.",
    defaultColumns: ["client", "snapshotDate", "snapshotType", "periodStart", "periodEnd"],
    hidden: hideUnlessFeature("clients"),
  },
  access: {
    read: canAccess("clients"),
    create: canAccess("clients"),
    update: canAccess("clients"),
    delete: adminOnlyDelete,
  },
  defaultSort: "-snapshotDate",
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== "create") return;
        const clientId = typeof doc.client === "object" ? doc.client?.id : doc.client;
        if (!clientId) return;
        logActivity(req.payload, {
          type: "organic_growth_snapshot_created",
          title: `Organic growth snapshot created (${doc.snapshotDate})`,
          description: doc.summary || "Quarterly organic growth tracker snapshot created.",
          user: req.user?.id,
          client: clientId,
        }).catch(() => {});
        createLedgerItem(req.payload, {
          client: clientId,
          occurredAt: doc.snapshotDate || new Date().toISOString(),
          category: "seo",
          title: "Organic growth snapshot created",
          summary: doc.summary || "Organic search performance was captured for the growth tracker.",
          impactType: "organic_clicks",
          impactValue: doc.organic?.totalClicks ?? 0,
          impactUnit: "clicks",
          confidence: "measured",
          visibility: "client_visible",
          source: "quarterly-organic-growth-snapshots.afterChange",
          dedupeKey: `organic-growth-snapshot:${doc.id}`,
        }).catch(() => {});
      },
    ],
  },
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "proposal", type: "relationship", relationTo: "client-proposals" },
    { name: "seoAuditProposal", type: "relationship", relationTo: "seo-audit-proposals" },
    { name: "snapshotDate", type: "date", required: true, index: true },
    {
      type: "row",
      fields: [
        { name: "periodStart", type: "date", required: true, admin: { width: "50%" } },
        { name: "periodEnd", type: "date", required: true, admin: { width: "50%" } },
      ],
    },
    {
      name: "snapshotType",
      type: "select",
      required: true,
      defaultValue: "manual",
      index: true,
      options: [
        { label: "Month 1", value: "month_1" },
        { label: "Quarterly", value: "quarterly" },
        { label: "Manual", value: "manual" },
      ],
    },
    {
      name: "organic",
      type: "group",
      fields: [
        { name: "totalClicks", type: "number", defaultValue: 0 },
        { name: "totalImpressions", type: "number", defaultValue: 0 },
        { name: "avgCtr", type: "number", defaultValue: 0 },
        { name: "avgPosition", type: "number", defaultValue: 0 },
        { name: "brandClicks", type: "number", defaultValue: 0 },
        { name: "brandImpressions", type: "number", defaultValue: 0 },
        { name: "brandCtr", type: "number", defaultValue: 0 },
        { name: "brandPosition", type: "number", defaultValue: 0 },
        { name: "nonBrandClicks", type: "number", defaultValue: 0 },
        { name: "nonBrandImpressions", type: "number", defaultValue: 0 },
        { name: "nonBrandCtr", type: "number", defaultValue: 0 },
        { name: "nonBrandPosition", type: "number", defaultValue: 0 },
      ],
    },
    {
      name: "categories",
      type: "array",
      dbName: "qogs_categories",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "score", type: "number" },
        { name: "rankPosition", type: "number" },
        { name: "clicks", type: "number" },
        { name: "impressions", type: "number" },
        { name: "topQueries", type: "json" },
        { name: "relatedPages", type: "json" },
      ],
    },
    {
      name: "topicAssociations",
      type: "array",
      dbName: "qogs_topic_associations",
      fields: [
        { name: "topic", type: "text", required: true },
        { name: "cluster", type: "text" },
        { name: "blogPosts", type: "relationship", relationTo: "blog-posts", hasMany: true },
        { name: "contentUrls", type: "json" },
        { name: "publishedCount", type: "number", defaultValue: 0 },
        { name: "firstPublishedAt", type: "date" },
        { name: "latestPublishedAt", type: "date" },
        { name: "associatedQueries", type: "json" },
        { name: "notes", type: "textarea" },
      ],
    },
    {
      name: "workDelivered",
      type: "array",
      dbName: "qogs_work_delivered",
      fields: [
        { name: "date", type: "date", required: true },
        {
          name: "type",
          type: "select",
          required: true,
          options: [
            { label: "Blog", value: "blog" },
            { label: "Technical Fix", value: "technical_fix" },
            { label: "Internal Link", value: "internal_link" },
            { label: "Page Update", value: "page_update" },
            { label: "Audit", value: "audit" },
            { label: "Other", value: "other" },
          ],
        },
        { name: "title", type: "text", required: true },
        { name: "url", type: "text" },
      ],
    },
    { name: "summary", type: "textarea" },
    { name: "wins", type: "textarea" },
    { name: "risks", type: "textarea" },
    { name: "nextFocus", type: "textarea" },
    { name: "sourceGscSnapshot", type: "relationship", relationTo: "gsc-snapshots" },
  ],
};
