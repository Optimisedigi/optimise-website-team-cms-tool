import type { CollectionConfig } from "payload";

export const MatchTypeSynonymRules: CollectionConfig = {
  slug: "match-type-synonym-rules",
  dbName: "match_type_synonym_rules",
  labels: {
    singular: "Match Type Synonym Rule",
    plural: "Match Type Synonym Rules",
  },
  admin: {
    group: "Growth Tools",
    useAsTitle: "termA",
    defaultColumns: ["termA", "termB", "contextTerms", "active", "updatedAt"],
    description:
      "Reviewer-taught synonym pairs used by Match Type Violations confidence categorization. These rules affect review confidence only, not Google Ads detection.",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
  },
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "termA",
          type: "text",
          required: true,
          label: "Term A",
          admin: {
            width: "50%",
            description: "One side of the synonym pair, e.g. support, help, ea, virtual.",
          },
        },
        {
          name: "termB",
          type: "text",
          required: true,
          label: "Term B",
          admin: {
            width: "50%",
            description: "The other side, e.g. services, personal assistant, outsourcing.",
          },
        },
      ],
    },
    {
      name: "contextTerms",
      type: "textarea",
      label: "Context Terms",
      admin: {
        description:
          "Optional comma/newline terms that must appear in the search term, triggering keyword, campaign, or ad group for this rule to apply. Leave blank for global rules.",
      },
    },
    {
      name: "active",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description: "Disable to keep the rule for history without using it in confidence scoring.",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "sourceSearchTerm",
          type: "text",
          label: "Source Search Term",
          admin: {
            width: "50%",
            description: "Search term that prompted this rule.",
          },
        },
        {
          name: "sourceTriggeringKeyword",
          type: "text",
          label: "Source Triggering Keyword",
          admin: {
            width: "50%",
            description: "Triggering keyword that prompted this rule.",
          },
        },
      ],
    },
    {
      name: "notes",
      type: "textarea",
      admin: {
        description: "Optional reviewer notes explaining why this synonym is valid.",
      },
    },
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        readOnly: true,
        description: "Reviewer who created the rule.",
      },
    },
  ],
  timestamps: true,
};
