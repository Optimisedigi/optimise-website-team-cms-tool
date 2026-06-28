import type { CollectionConfig } from "payload";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

export const BlogPrompts: CollectionConfig = {
  slug: "blog-prompts",
  labels: { singular: "Blog Prompter", plural: "Blog Prompter" },
  hooks: {
    afterChange: [
      async ({ doc, previousDoc }) => {
        if (
          doc.source === "topic-clusters" &&
          doc.gapStatus &&
          doc.gapStatus !== previousDoc?.gapStatus
        ) {
          const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
          const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
          if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) return;

          fetch(`${GROWTH_TOOLS_URL}/api/topic-clusters/gaps/sync-status`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Key": INTERNAL_API_KEY,
            },
            body: JSON.stringify({
              gaps: [
                {
                  targetKeyword: doc.primaryKeywords || doc.blogIdea,
                  status: doc.gapStatus,
                },
              ],
            }),
          }).catch((err) =>
            console.error("[BlogPrompts] Gap sync failed:", (err as Error).message)
          );
        }
      },
    ],
  },
  admin: {
    group: "Content",
    defaultColumns: ["blogIdea", "titleIdea", "status", "source", "createdAt"],
    components: {
      views: {
        list: {
          Component: "./components/BlogPrompterListView",
        },
      },
    },
    hidden: hideUnlessFeature("blog-prompts"),
  },
  access: {
    read: canAccess("blog-prompts"),
    create: canAccess("blog-prompts"),
    update: canAccess("blog-prompts"),
    delete: adminOnlyDelete,
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      admin: {
        description: "Client this saved blog prompt belongs to.",
      },
    },
    {
      name: "blogIdea",
      type: "text",
      required: true,
      label: "Blog Idea",
    },
    {
      name: "titleIdea",
      type: "text",
      label: "Title Idea",
    },
    {
      name: "category",
      type: "text",
      label: "Category",
    },
    {
      name: "tag",
      type: "text",
      label: "Tag",
    },
    {
      name: "mainPoint",
      type: "textarea",
      label: "Main Point of the Content",
    },
    {
      name: "keyPoints",
      type: "textarea",
      label: "Key Points That Must Be Included",
    },
    {
      name: "primaryKeywords",
      type: "text",
      label: "Primary Keywords",
    },
    {
      name: "secondaryKeywords",
      type: "text",
      label: "Secondary Keywords",
    },
    {
      name: "pointsToAvoid",
      type: "textarea",
      label: "Points to Avoid",
    },
    {
      name: "targetAudience",
      type: "text",
      label: "Target Audience",
    },
    {
      name: "supportingContent",
      type: "textarea",
      label: "Content to Support",
    },
    {
      name: "generatedPrompt",
      type: "textarea",
      label: "Generated Prompt",
      admin: { readOnly: true },
    },
    {
      name: "workflowStatus",
      type: "select",
      label: "Blog status",
      defaultValue: "idea_phase",
      options: [
        { label: "Idea phase", value: "idea_phase" },
        { label: "In progress", value: "in_progress" },
        { label: "Published", value: "published" },
      ],
      admin: {
        description: "Tracks the prompt from idea, to generated draft, to published blog post.",
      },
    },
    {
      name: "blogPost",
      type: "relationship",
      relationTo: "blog-posts",
      admin: {
        description: "Generated Blog Post draft created from this prompt.",
      },
    },
    {
      name: "status",
      type: "select",
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Client Submitted", value: "client-submitted" },
        { label: "Ready", value: "ready" },
      ],
    },
    {
      name: "source",
      type: "select",
      defaultValue: "internal",
      options: [
        { label: "Internal", value: "internal" },
        { label: "Client", value: "client" },
        { label: "Topic Clusters", value: "topic-clusters" },
      ],
    },
    {
      name: "archivedAt",
      type: "date",
      admin: { hidden: true },
    },
    {
      name: "gapStatus",
      type: "select",
      options: [
        { label: "Open", value: "open" },
        { label: "In Progress", value: "in_progress" },
        { label: "Published", value: "published" },
      ],
      defaultValue: "open",
      admin: {
        condition: (data: any) => data?.source === "topic-clusters",
        description: "Syncs back to Growth Tools content gap tracker",
      },
    },
  ],
};
