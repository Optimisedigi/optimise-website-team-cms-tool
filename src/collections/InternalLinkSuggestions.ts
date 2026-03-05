import type { CollectionConfig } from "payload";

export const InternalLinkSuggestions: CollectionConfig = {
  slug: "internal-link-suggestions",
  labels: { singular: "Internal Link Suggestion", plural: "Internal Link Suggestions" },
  admin: {
    group: "Audits",
    defaultColumns: ["sourceUrl", "targetUrl", "confidenceScore", "status", "createdAt"],
    useAsTitle: "anchorText",
    components: {
      views: {
        list: {
          Component: "./components/InternalLinkSuggestionsListView",
        },
      },
    },
  },
  access: {
    read: () => true,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => !!req.user,
  },
  fields: [
    {
      name: "sourceUrl",
      type: "text",
      required: true,
      label: "Source URL",
    },
    {
      name: "targetUrl",
      type: "text",
      required: true,
      label: "Target URL",
    },
    {
      name: "anchorText",
      type: "text",
      required: true,
      label: "Anchor Text",
    },
    {
      name: "contextSnippet",
      type: "textarea",
      label: "Context",
    },
    {
      name: "confidenceScore",
      type: "number",
      required: true,
      label: "Confidence Score",
      min: 0,
      max: 100,
    },
    {
      name: "estimatedPageRankLift",
      type: "number",
      label: "Est. PageRank Lift (bps)",
    },
    {
      name: "clusterRelation",
      type: "text",
      label: "Cluster Relation",
    },
    {
      name: "clusterName",
      type: "text",
      label: "Cluster Name",
    },
    {
      name: "status",
      type: "select",
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
      ],
    },
    {
      name: "runId",
      type: "number",
      label: "Run ID",
    },
  ],
};
