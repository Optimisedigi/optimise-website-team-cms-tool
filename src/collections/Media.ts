import type { CollectionConfig } from "payload";

/**
 * Media Collection
 *
 * Handles image uploads with automatic optimization.
 */
export const Media: CollectionConfig = {
  slug: "media",
  admin: {
    group: "Content",
    description: "Upload and manage images",
  },
  access: {
    read: () => true,
  },
  upload: {
    staticDir: "../public/media",
    mimeTypes: ["image/*"],
    imageSizes: [
      {
        name: "thumbnail",
        width: 400,
        height: 300,
        position: "centre",
      },
      {
        name: "card",
        width: 768,
        height: 432,
        position: "centre",
      },
      {
        name: "hero",
        width: 1920,
        height: 1080,
        position: "centre",
      },
    ],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
      admin: {
        description:
          "Describe the image for accessibility and SEO. Be specific (e.g., 'Team meeting in modern office with whiteboard').",
      },
    },
    {
      name: "caption",
      type: "text",
      admin: {
        description: "Optional caption to display below the image.",
      },
    },
  ],
};
