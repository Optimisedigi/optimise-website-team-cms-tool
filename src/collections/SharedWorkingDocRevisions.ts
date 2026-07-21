import type { CollectionConfig } from "payload";

export const SharedWorkingDocRevisions: CollectionConfig = {
  slug: "shared-working-doc-revisions",
  lockDocuments: false,
  admin: {
    hidden: true,
    group: "Clients",
    useAsTitle: "revision",
    defaultColumns: ["workingDoc", "revision", "savedBy", "savedAt", "source"],
    description: "Immutable working-document snapshots retained for conflict recovery.",
  },
  indexes: [{ fields: ["workingDoc", "revision"], unique: true }],
  access: {
    read: ({ req }) => Boolean(req.user),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: "workingDoc",
      type: "relationship",
      relationTo: "shared-working-docs",
      required: true,
      index: true,
    },
    { name: "revision", type: "number", required: true, index: true },
    { name: "contentMarkdown", type: "textarea", required: true },
    { name: "contentHash", type: "text", required: true, index: true },
    { name: "savedBy", type: "text", required: true },
    { name: "savedAt", type: "date", required: true, index: true },
    {
      name: "source",
      type: "select",
      required: true,
      options: ["public-editor", "cms-editor", "legacy-handoff", "migration-seed"],
    },
  ],
};
