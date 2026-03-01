import type { CollectionConfig } from "payload";

export const BlogPrompts: CollectionConfig = {
  slug: "blog-prompts",
  labels: { singular: "Blog Prompter", plural: "Blog Prompter" },
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
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => !!req.user,
  },
  fields: [
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
  ],
};
