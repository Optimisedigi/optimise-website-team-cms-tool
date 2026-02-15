import type { CollectionConfig } from "payload";
import matter from "gray-matter";

/**
 * Blog Posts Collection
 *
 * SEO-optimized blog posts with proper heading structure.
 * Each post is associated with a client.
 */
export const BlogPosts: CollectionConfig = {
  slug: "blog-posts",
  admin: {
    useAsTitle: "title",
    group: "Content",
    defaultColumns: ["title", "client", "status", "publishedDate"],
    description: "Create and manage blog posts for clients",
  },
  versions: {
    drafts: true,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (!data?.markdownSource) return data;

        try {
          const { data: frontmatter, content: body } = matter(
            data.markdownSource
          );

          if (frontmatter.title) data.title = frontmatter.title;
          if (frontmatter.excerpt) data.excerpt = frontmatter.excerpt;
          if (frontmatter.readingTime) data.readingTime = frontmatter.readingTime;
          if (frontmatter.metaTitle) data.metaTitle = frontmatter.metaTitle;
          if (frontmatter.metaDescription) data.metaDescription = frontmatter.metaDescription;
          if (frontmatter.status) data.status = frontmatter.status;

          if (body.trim()) {
            data.markdownContent = body.trim();
          }
        } catch {
          // If parsing fails, leave fields unchanged
        }

        return data;
      },
    ],
  },
  fields: [
    // Client Selection (at the top for visibility)
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      admin: {
        description: "Select which client this blog post belongs to",
        position: "sidebar",
      },
    },

    // SEO Tab
    {
      type: "tabs",
      tabs: [
        {
          label: "Content",
          fields: [
            {
              name: "title",
              type: "text",
              required: true,
              admin: {
                description:
                  "The H1 title. Make it intent-led: describe what the reader will learn + who it's for.",
              },
            },
            {
              name: "excerpt",
              type: "textarea",
              required: true,
              maxLength: 160,
              admin: {
                description:
                  "Brief summary for SEO meta description (max 160 characters). This appears in search results.",
              },
            },
            {
              name: "content",
              type: "richText",
              required: true,
              admin: {
                description:
                  "Main blog content. Use H2 for main sections, H3 for subsections. See the style guide below.",
              },
            },
            {
              name: "readingTime",
              type: "text",
              admin: {
                description:
                  "Estimated reading time (e.g., '5 min read').",
              },
            },
            {
              name: "markdownContent",
              type: "textarea",
              admin: {
                description:
                  "Raw markdown content. If provided, this will be used instead of the rich text editor on the website.",
              },
            },
          ],
        },
        {
          label: "SEO & Meta",
          fields: [
            {
              name: "slug",
              type: "text",
              required: true,
              unique: true,
              admin: {
                description:
                  "URL slug (e.g., 'how-to-improve-website-speed'). Use hyphens, lowercase, no spaces.",
              },
              hooks: {
                beforeValidate: [
                  ({ value, data }) => {
                    if (!value && data?.title) {
                      return data.title
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, "");
                    }
                    return value;
                  },
                ],
              },
            },
            {
              name: "metaTitle",
              type: "text",
              maxLength: 60,
              admin: {
                description:
                  "SEO title for search results (max 60 chars). Leave blank to use the main title.",
              },
            },
            {
              name: "metaDescription",
              type: "textarea",
              maxLength: 160,
              admin: {
                description:
                  "SEO description. Leave blank to use the excerpt.",
              },
            },
            {
              name: "canonicalUrl",
              type: "text",
              admin: {
                description:
                  "Only set if this content exists elsewhere and you want to point to the original.",
              },
            },
          ],
        },
        {
          label: "Media & Display",
          fields: [
            {
              name: "generateImage",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GenerateBlogImageButton",
                },
              },
            },
            {
              name: "featuredImage",
              type: "upload",
              relationTo: "media",
              admin: {
                description:
                  "Main image for the blog post. Will be used as thumbnail and social sharing image.",
              },
            },
            {
              name: "featuredImageAlt",
              type: "text",
              admin: {
                description:
                  "Describe the image for accessibility and SEO (e.g., 'Developer working on laptop in office').",
              },
            },
          ],
        },
        {
          label: "Categorization",
          fields: [
            {
              name: "category",
              type: "text",
              admin: {
                description: "Primary category for this post.",
                components: {
                  Field: "./components/ClientCategorySelect",
                },
              },
            },
            {
              name: "tags",
              type: "json",
              admin: {
                description: "Add relevant tags for filtering and SEO.",
                components: {
                  Field: "./components/ClientTagsSelect",
                },
              },
            },
          ],
        },
        {
          label: "Publishing",
          fields: [
            {
              name: "author",
              type: "text",
              required: true,
              admin: {
                description: "Author name as it should appear on the post.",
                components: {
                  Field: "./components/ClientAuthorSelect",
                },
              },
            },
            {
              name: "publishedDate",
              type: "date",
              required: true,
              admin: {
                date: {
                  pickerAppearance: "dayOnly",
                },
                description: "Publication date (for display and sorting).",
              },
            },
            {
              name: "status",
              type: "select",
              options: [
                { label: "Draft", value: "draft" },
                { label: "Ready for Review", value: "review" },
                { label: "Published", value: "published" },
              ],
              defaultValue: "draft",
              required: true,
              admin: {
                position: "sidebar",
                description: "Only 'Published' posts appear on the website.",
              },
            },
          ],
        },
        {
          label: "Import",
          fields: [
            {
              name: "markdownSource",
              type: "textarea",
              admin: {
                description:
                  "Paste a full markdown file here (with frontmatter). On save, the frontmatter will auto-populate the fields above and the body will be stored as markdown content.",
              },
            },
          ],
        },
      ],
    },
  ],
};
