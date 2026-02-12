import type { CollectionConfig } from "payload";

/**
 * Media Collection
 *
 * Handles image and video uploads with automatic optimization.
 *
 * Upload limits (to control Vercel Blob storage costs):
 * - Images: max 800 KB per file
 * - Videos: max 10 MB per file, no bulk upload
 */
export const Media: CollectionConfig = {
  slug: "media",
  admin: {
    group: "Content",
    description:
      "Upload and manage media. Images: max 800 KB. Videos: max 10 MB (no bulk upload).",
  },
  access: {
    read: () => true,
  },
  upload: {
    staticDir: "../public/media",
    mimeTypes: ["image/*", "video/*"],
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
    bulkUpload: false,
  },
  hooks: {
    beforeValidate: [
      ({ data, req }) => {
        const file = req.file;
        if (!file) return data;

        const isImage = file.mimetype?.startsWith("image/");
        const isVideo = file.mimetype?.startsWith("video/");
        const maxImageSize = 800 * 1024; // 800 KB
        const maxVideoSize = 10 * 1024 * 1024; // 10 MB

        if (isImage && file.size > maxImageSize) {
          throw new Error(
            `Image too large (${(file.size / 1024).toFixed(0)} KB). Maximum is 800 KB. Please compress the image before uploading.`
          );
        }

        if (isVideo && file.size > maxVideoSize) {
          throw new Error(
            `Video too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 10 MB.`
          );
        }

        return data;
      },
    ],
  },
  fields: [
    {
      name: "alt",
      type: "text",
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
