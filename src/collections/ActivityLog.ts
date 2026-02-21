import type { CollectionConfig } from "payload";

export const ActivityLog: CollectionConfig = {
  slug: "activity-log",
  labels: {
    singular: "Activity Log",
    plural: "Activity Log",
  },
  admin: {
    useAsTitle: "title",
    group: "Admin",
    defaultColumns: ["type", "title", "user", "client", "createdAt"],
    description: "Automatic feed of team activity",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: () => true,
    update: () => false,
    delete: ({ req }) => req.user?.role === "admin",
  },
  defaultSort: "-createdAt",
  fields: [
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Blog Published", value: "blog_published" },
        { label: "SEO Audit Completed", value: "seo_audit_completed" },
        { label: "CRO Audit Completed", value: "cro_audit_completed" },
        { label: "Keyword Analysis", value: "keyword_analysis" },
        { label: "Client Added", value: "client_added" },
        { label: "Retainer Changed", value: "retainer_changed" },
        { label: "GSC Snapshot", value: "gsc_snapshot" },
      ],
    },
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "description",
      type: "text",
    },
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      admin: {
        description: "User who triggered this activity",
      },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      admin: {
        description: "Related client",
      },
    },
  ],
};
