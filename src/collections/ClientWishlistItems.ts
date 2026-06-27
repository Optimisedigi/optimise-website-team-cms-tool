import type { CollectionConfig } from "payload";
import { hideUnlessAnyFeature } from "../lib/access";

export const ClientWishlistItems: CollectionConfig = {
  slug: "client-wishlist-items",
  labels: {
    singular: "Client Wishlist Item",
    plural: "Client Wishlist",
  },
  admin: {
    useAsTitle: "idealClient",
    group: "Clients",
    hidden: hideUnlessAnyFeature("clients", "clients-basic"),
    description: "Ideal clients the team would like to work with.",
    defaultColumns: ["idealClient", "website", "addedBy", "why"],
    components: {
      views: {
        list: {
          Component: "./components/ClientWishlistGrid",
        },
      },
    },
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
      label: "Name",
      type: "text",
      required: true,
      admin: {
        description: "The business, brand or client type you would love Optimise Digital to work with.",
      },
    },
    {
      name: "website",
      label: "Website",
      type: "text",
      admin: {
        description: "The client or brand website.",
      },
    },
    {
      name: "why",
      label: "Why",
      type: "textarea",
      admin: {
        description: "Why this business would be a great fit for Optimise Digital.",
      },
    },
    {
      name: "addedBy",
      label: "Person Adding It",
      type: "relationship",
      relationTo: "users",
      admin: {
        description: "The team member who added this wishlist item.",
      },
      hooks: {
        beforeChange: [
          ({ req, value, operation }) => {
            if (operation === "create" && !value && req.user?.id) return req.user.id;
            return value;
          },
        ],
      },
    },
  ],
};
