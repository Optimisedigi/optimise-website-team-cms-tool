import type { CollectionConfig } from "payload";
import crypto from "crypto";

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
      type: "tabs",
      tabs: [
        {
          label: "Business",
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
                      return `key_${crypto.randomBytes(24).toString("hex")}`;
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
            {
              name: "notes",
              type: "textarea",
              admin: {
                description: "Goals, notes, and context about this client",
              },
            },
          ],
        },
        {
          label: "Blog Settings",
          fields: [
            {
              name: "blogCategories",
              type: "textarea",
              admin: {
                description: "Blog categories for this client (one per line)",
              },
            },
            {
              name: "blogTags",
              type: "textarea",
              admin: {
                description: "Available tags for this client (one per line)",
              },
            },
          ],
        },
        {
          label: "Authors",
          fields: [
            {
              name: "authors",
              type: "array",
              maxRows: 10,
              admin: {
                description: "Author profiles for this client (up to 10)",
              },
              fields: [
                {
                  name: "name",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Author's display name",
                  },
                },
                {
                  name: "jobTitle",
                  type: "text",
                  admin: {
                    description: "Author's job title (e.g., 'Senior SEO Strategist')",
                  },
                },
                {
                  name: "blurb",
                  type: "textarea",
                  admin: {
                    description: "Short bio or description of the author",
                  },
                },
                {
                  name: "image",
                  type: "upload",
                  relationTo: "media",
                  admin: {
                    description: "Author's profile photo",
                  },
                },
                {
                  name: "expertiseTags",
                  type: "array",
                  admin: {
                    description: "Tags highlighting this author's areas of expertise",
                  },
                  fields: [
                    {
                      name: "tag",
                      type: "text",
                      required: true,
                    },
                  ],
                },
                {
                  name: "socialLinks",
                  type: "array",
                  maxRows: 6,
                  admin: {
                    description: "Social media and website links",
                  },
                  fields: [
                    {
                      name: "platform",
                      type: "select",
                      required: true,
                      options: [
                        { label: "Website", value: "website" },
                        { label: "LinkedIn", value: "linkedin" },
                        { label: "Twitter / X", value: "twitter" },
                        { label: "Facebook", value: "facebook" },
                        { label: "Instagram", value: "instagram" },
                        { label: "YouTube", value: "youtube" },
                      ],
                    },
                    {
                      name: "url",
                      type: "text",
                      required: true,
                      admin: {
                        description: "Full URL (e.g., 'https://linkedin.com/in/johndoe')",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
