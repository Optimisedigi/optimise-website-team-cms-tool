import type { CollectionConfig } from "payload";

export const ClientWishlistItems: CollectionConfig = {
  slug: "client-wishlist-items",
  labels: {
    singular: "Client Wishlist Item",
    plural: "Client Wishlist",
  },
  admin: {
    useAsTitle: "idealClient",
    group: "Clients",
    hidden: true,
    description: "Ideal clients the team would like to work with.",
    defaultColumns: ["idealClient", "addedBy"],
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => req.user?.role === "admin",
  },
  fields: [
    {
      name: "idealClient",
      label: "Ideal Client",
      type: "text",
      required: true,
      admin: {
        description: "The business, brand or client type you would love Optimise Digital to work with.",
      },
    },
    {
      name: "addedBy",
      label: "Who Added It",
      type: "relationship",
      relationTo: "users",
      admin: {
        readOnly: true,
        description: "Automatically set to the logged-in team member who created this wishlist item.",
      },
      hooks: {
        beforeChange: [
          ({ req, value, operation }) => {
            if (operation === "create" && req.user?.id) return req.user.id;
            return value;
          },
        ],
      },
    },
  ],
};
