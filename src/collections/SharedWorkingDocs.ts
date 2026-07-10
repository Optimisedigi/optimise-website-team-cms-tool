import type { CollectionConfig } from "payload";

export const SharedWorkingDocs: CollectionConfig = {
  slug: "shared-working-docs",
  // Public working docs are autosaved via API routes and do not need Payload's
  // admin document-lock relationship. Keeping locks off avoids requiring a
  // payload_locked_documents_rels column before migrations have run.
  lockDocuments: false,
  admin: {
    group: "Clients",
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "updatedAt"],
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "clientSlug",
      type: "text",
      required: true,
      index: true,
    },
    {
      name: "deckSlug",
      type: "text",
      required: true,
      index: true,
    },
    {
      name: "contentMarkdown",
      type: "textarea",
      required: true,
    },
    {
      name: "lastEditedBy",
      type: "text",
    },
    {
      name: "lastSavedAt",
      type: "date",
    },
    {
      name: "changeLog",
      type: "array",
      admin: { description: "Recent public working-doc saves." },
      fields: [
        { name: "savedAt", type: "date", required: true },
        { name: "savedBy", type: "text" },
        { name: "summary", type: "text" },
      ],
    },
  ],
};
