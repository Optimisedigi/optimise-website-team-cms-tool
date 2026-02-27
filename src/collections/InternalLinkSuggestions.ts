import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";
import { logActivity } from "../lib/activity-log";

export const InternalLinkSuggestions: CollectionConfig = {
  slug: "internal-link-suggestions",
  labels: {
    singular: "Internal Link Suggestion",
    plural: "Internal Link Suggestions",
  },
  admin: {
    useAsTitle: "anchorText",
    group: "SEO",
    defaultColumns: ["sourceUrl", "targetUrl", "anchorText", "confidenceScore", "status", "createdAt"],
    description: "Auto-generated internal link suggestions from the Topic Cluster engine",
  },
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "link_suggestion_created",
            title: `Link suggestion: ${doc.anchorText}`,
            description: `${doc.sourceUrl} → ${doc.targetUrl} (confidence: ${doc.confidenceScore})`,
            user: req.user?.id,
          }).catch(() => {});
        }
      },
    ],
  },
  access: {
    read: ({ req }) => !!req.user || hasValidApiKey(req),
    update: ({ req }) => !!req.user || hasValidApiKey(req),
    delete: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
    create: ({ req }) => !!req.user || hasValidApiKey(req),
  },
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "sourceUrl",
          type: "text",
          required: true,
          admin: { width: "50%" },
        },
        {
          name: "targetUrl",
          type: "text",
          required: true,
          admin: { width: "50%" },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "anchorText",
          type: "text",
          required: true,
          admin: { width: "50%" },
        },
        {
          name: "confidenceScore",
          type: "number",
          required: true,
          min: 0,
          max: 100,
          admin: { width: "25%" },
        },
        {
          name: "status",
          type: "select",
          required: true,
          defaultValue: "pending",
          options: [
            { label: "Pending", value: "pending" },
            { label: "Approved", value: "approved" },
            { label: "Rejected", value: "rejected" },
          ],
          admin: { width: "25%" },
        },
      ],
    },
    {
      name: "contextSnippet",
      type: "textarea",
      admin: {
        description: "Why this link was suggested",
      },
    },
    {
      name: "estimatedPageRankLift",
      type: "number",
      admin: {
        description: "Estimated PageRank lift in basis points",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "clusterRelation",
          type: "select",
          options: [
            { label: "Same Cluster", value: "same_cluster" },
            { label: "Cross Cluster", value: "cross_cluster" },
            { label: "Orphan Rescue", value: "orphan_rescue" },
          ],
          admin: { width: "50%" },
        },
        {
          name: "clusterName",
          type: "text",
          admin: { width: "50%" },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "approvedBy",
          type: "text",
          admin: {
            width: "50%",
            condition: (data) => data?.status === "approved",
          },
        },
        {
          name: "approvedAt",
          type: "date",
          admin: {
            width: "50%",
            condition: (data) => data?.status === "approved",
          },
        },
      ],
    },
    {
      name: "runId",
      type: "number",
      admin: {
        description: "Topic cluster run ID from Growth Tools",
      },
    },
  ],
};
