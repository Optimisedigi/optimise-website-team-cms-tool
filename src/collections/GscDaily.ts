import type { CollectionConfig } from "payload";

export const GscDaily: CollectionConfig = {
  slug: "gsc-daily",
  labels: {
    singular: "GSC Daily",
    plural: "GSC Daily",
  },
  admin: {
    hidden: true,
    defaultColumns: ["client", "date", "clicks", "impressions"],
    description: "Daily Google Search Console metrics for historical archival",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      index: true,
    },
    {
      name: "date",
      type: "text",
      required: true,
      index: true,
      admin: {
        description: "YYYY-MM-DD",
      },
    },
    {
      name: "clicks",
      type: "number",
      required: true,
    },
    {
      name: "impressions",
      type: "number",
      required: true,
    },
    {
      name: "ctr",
      type: "number",
      admin: {
        description: "Click-through rate as percentage (e.g. 3.45)",
      },
    },
    {
      name: "position",
      type: "number",
      admin: {
        description: "Average position (e.g. 14.2)",
      },
    },
  ],
};
