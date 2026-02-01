import type { CollectionConfig } from "payload";

/**
 * Clients Collection
 *
 * Each client represents a website/business you manage.
 * Blog posts are associated with specific clients.
 */
export const Clients: CollectionConfig = {
  slug: "clients",
  admin: {
    useAsTitle: "name",
    group: "Settings",
    description: "Manage client websites",
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      admin: {
        description: "Client/business name (e.g., 'Acme Corp')",
      },
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "URL-friendly identifier (e.g., 'acme-corp')",
      },
    },
    {
      name: "websiteUrl",
      type: "text",
      admin: {
        description: "Client website URL (e.g., 'https://acmecorp.com')",
      },
    },
    {
      name: "apiKey",
      type: "text",
      admin: {
        description: "API key for this client (auto-generated)",
        readOnly: true,
      },
      hooks: {
        beforeChange: [
          ({ value, operation }) => {
            if (operation === "create" && !value) {
              return `key_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
            }
            return value;
          },
        ],
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description: "Enable/disable content publishing for this client",
      },
    },
  ],
};
