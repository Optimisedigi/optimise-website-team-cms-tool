import type { CollectionConfig, FieldAccess } from "payload";

const staffOnly: FieldAccess = ({ req }) => Boolean(req.user);
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

export const InternalLinkSuggestions: CollectionConfig = {
  slug: "internal-link-suggestions",
  labels: { singular: "Internal Link Suggestion", plural: "Internal Link Suggestions" },
  admin: {
    group: "Growth Tools",
    defaultColumns: ["sourceUrl", "targetUrl", "confidenceScore", "status", "createdAt"],
    useAsTitle: "anchorText",
    components: {
      views: {
        list: {
          Component: "./components/InternalLinkSuggestionsListView",
        },
      },
    },
    hidden: hideUnlessFeature("internal-link-suggestions"),
  },
  access: {
    // Public read — used by the website to fetch link suggestions.
    read: () => true,
    create: canAccess("internal-link-suggestions"),
    update: canAccess("internal-link-suggestions"),
    delete: adminOnlyDelete,
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
      name: "client",
      type: "relationship",
      relationTo: "clients",
      index: true,
    },
    {
      name: "origin",
      type: "select",
      options: [
        { label: "Topic Clusters", value: "topic-clusters" },
        { label: "Content Map", value: "content-map" },
      ],
    },
    {
      name: "opportunityKey",
      type: "text",
      index: true,
      admin: { description: "Content Map opportunity key (source>target)." },
    },
    {
      name: "runId",
      type: "number",
      label: "Run ID",
    },
    // Content Map link action: the AI-drafted edit that writes this link into
    // its source page, and whether it has been applied. Staff-only: the
    // collection itself is publicly readable and drafts may quote unpublished
    // articles.
    {
      type: "collapsible",
      label: "Link edit",
      admin: { initCollapsed: true, condition: (data) => data?.origin === "content-map" },
      fields: [
        {
          name: "actionStatus",
          type: "select",
          access: { read: staffOnly },
          admin: { readOnly: true },
          options: [
            { label: "Drafted", value: "drafted" },
            { label: "Applied", value: "applied" },
            { label: "Failed", value: "failed" },
            { label: "Already linked", value: "already-linked" },
          ],
        },
        {
          name: "actionSource",
          type: "select",
          access: { read: staffOnly },
          admin: { readOnly: true },
          options: [
            { label: "CMS article", value: "cms-article" },
            { label: "Live page", value: "live-page" },
          ],
        },
        { name: "blogPost", type: "relationship", relationTo: "blog-posts", access: { read: staffOnly }, admin: { readOnly: true } },
        { name: "editOriginal", type: "textarea", access: { read: staffOnly }, admin: { readOnly: true } },
        { name: "editReplacement", type: "textarea", access: { read: staffOnly }, admin: { readOnly: true } },
        { name: "actionNote", type: "text", access: { read: staffOnly }, admin: { readOnly: true } },
        { name: "actionModel", type: "text", access: { read: staffOnly }, admin: { readOnly: true } },
        { name: "appliedAt", type: "date", access: { read: staffOnly }, admin: { readOnly: true } },
        { name: "appliedBy", type: "text", access: { read: staffOnly }, admin: { readOnly: true } },
      ],
    },
  ],
};
