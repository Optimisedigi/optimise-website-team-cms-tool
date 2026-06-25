import type { CollectionConfig } from "payload";

export const MatchTypeAllowListTerms: CollectionConfig = {
  slug: "match-type-allow-list-terms",
  dbName: "match_type_allow_list_terms",
  labels: {
    singular: "Match Type Allow List Term",
    plural: "Match Type Allow List Terms",
  },
  admin: {
    group: "Growth Tools",
    useAsTitle: "term",
    defaultColumns: ["term", "category", "active", "updatedAt"],
    description:
      "Words/acronyms that should never be treated as unknown brand/person/company-name drift in Match Type Violations confidence scoring.",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
  },
  fields: [
    {
      name: "term",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "Single word/acronym to allow, e.g. it, hr, seo, ea, va, cpa.",
      },
    },
    {
      name: "category",
      type: "select",
      required: true,
      defaultValue: "acronym",
      options: [
        { label: "Acronym", value: "acronym" },
        { label: "Job title", value: "job_title" },
        { label: "Industry term", value: "industry_term" },
        { label: "Client jargon", value: "client_jargon" },
        { label: "Other", value: "other" },
      ],
    },
    {
      name: "active",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description: "Disable to keep the term for history without using it in confidence scoring.",
      },
    },
    {
      name: "notes",
      type: "textarea",
      admin: {
        description: "Optional notes explaining why this term should be allowed.",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "sourceSearchTerm",
          type: "text",
          label: "Source Search Term",
          admin: { width: "50%" },
        },
        {
          name: "sourceTriggeringKeyword",
          type: "text",
          label: "Source Triggering Keyword",
          admin: { width: "50%" },
        },
      ],
    },
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        readOnly: true,
        description: "Reviewer who created the allow-list term.",
      },
    },
  ],
  timestamps: true,
};
