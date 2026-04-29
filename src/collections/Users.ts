import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    useAPIKey: true,
    maxLoginAttempts: 5,
  },
  admin: {
    useAsTitle: "email",
    group: "Admin",
    hidden: ({ user }) => user?.role === "specialist",
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return false;
      if (req.user.role === "admin") return true;
      return { id: { equals: req.user.id } };
    },
    create: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
    update: ({ req }) => {
      if (!req.user) return false;
      if (req.user.role === "admin") return true;
      return { id: { equals: req.user.id } };
    },
    delete: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "role",
      type: "select",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Manager", value: "manager" },
        { label: "Specialist", value: "specialist" },
      ],
      defaultValue: "specialist",
      required: true,
      access: {
        update: ({ req }) => req.user?.role === "admin",
      },
    },
    {
      name: "setupCompleted",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description:
          "Whether this user has completed their first-login setup",
        condition: (_data, _siblingData, { user }) =>
          user?.role === "admin",
      },
    },
  ],
};
