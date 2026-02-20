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
  access: {
    read: () => true,
  },
  admin: {
    useAsTitle: "title",
    group: "Content",
    defaultColumns: ["title", "client", "status", "publishedDate"],
    description: "Create and manage blog posts for clients",
    listSearchableFields: ["title", "slug", "author"],
    components: {
      beforeListTable: ["./components/BlogPostsClientFilter"],
    },
  },
  versions: {
    drafts: true,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (!data?.markdownSource) return data;

        try {
          const { data: frontmatter, content: rawBody } = matter(
            data.markdownSource
          );

          // Build a case-insensitive lookup for frontmatter keys
          // Handles: title, Title, meta_title, metaTitle, "Meta title", etc.
          const fm: Record<string, string> = {};
          for (const [key, value] of Object.entries(frontmatter)) {
            if (value != null) {
              fm[key.toLowerCase().replace(/[\s_-]/g, "")] = String(value);
            }
          }

          // If gray-matter found no frontmatter, try parsing "Key: Value" lines from the top
          let body = rawBody;
          if (Object.keys(fm).length === 0) {
            const lines = data.markdownSource.split("\n");
            const metaLines: string[] = [];
            for (const line of lines) {
              const match = line.match(/^([A-Za-z][A-Za-z\s_-]*?):\s*(.+)$/);
              if (match && metaLines.length < 20) {
                const key = match[1].toLowerCase().replace(/[\s_-]/g, "");
                fm[key] = match[2].trim();
                metaLines.push(line);
              } else if (line.trim() === "" && metaLines.length > 0) {
                metaLines.push(line);
              } else {
                break;
              }
            }
            // Strip parsed metadata lines from the body
            if (metaLines.length > 0) {
              body = lines.slice(metaLines.length).join("\n");
            }
          }

          // Map frontmatter to fields (checking multiple key variations)
          if (fm.title) data.title = fm.title;
          if (fm.excerpt || fm.description) data.excerpt = fm.excerpt || fm.description;
          if (fm.readingtime) data.readingTime = fm.readingtime;
          if (fm.metatitle) data.metaTitle = fm.metatitle;
          if (fm.metadescription) data.metaDescription = fm.metadescription;
          if (fm.status) data.status = fm.status;

          // Extract title from H1 heading if not found in frontmatter
          if (!data.title?.trim()) {
            const h1Match = body.match(/^# (.+)$/m);
            if (h1Match) data.title = h1Match[1].trim();
          }

          // Strip metadata sections formatted as markdown headings
          // (e.g. "## Meta title\nContent\n\n") and extract their values
          const metaSections = [
            { pattern: /^##\s*meta\s*title\s*\n([\s\S]*?)(?=\n##?\s|\n*$)/im, field: 'metaTitle' as const },
            { pattern: /^##\s*meta\s*description\s*\n([\s\S]*?)(?=\n##?\s|\n*$)/im, field: 'metaDescription' as const },
            { pattern: /^##\s*excerpt\s*\n([\s\S]*?)(?=\n##?\s|\n*$)/im, field: 'excerpt' as const },
          ];

          for (const { pattern, field } of metaSections) {
            const match = body.match(pattern);
            if (match) {
              const value = match[1].trim();
              if (value && !data[field]?.trim()) {
                data[field] = value.slice(0, field === 'metaDescription' ? 160 : field === 'excerpt' ? 160 : 60);
              }
              body = body.replace(match[0], '');
            }
          }

          // Strip "Estimated reading time: ..." line
          body = body.replace(/^Estimated reading time:.*$/im, '');

          // Strip horizontal rules (---)
          body = body.replace(/^---+\s*$/gm, '');

          // Clean up excessive blank lines left after stripping
          body = body.replace(/\n{3,}/g, '\n\n');

          if (body.trim()) {
            data.markdownContent = body.trim();

            // Auto-generate excerpt from body if missing
            if (!data.excerpt?.trim()) {
              const plain = body.replace(/[#*_`>\[\]()!|~-]/g, "").trim();
              const firstParagraph = plain.split(/\n\s*\n/)[0]?.trim() || "";
              data.excerpt = firstParagraph.slice(0, 157) + (firstParagraph.length > 157 ? "..." : "");
            }

            // Auto-generate slug from title if missing
            if (!data.slug?.trim() && data.title) {
              data.slug = data.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "");
            }

            // Auto-calculate reading time from word count
            const wordCount = body.trim().split(/\s+/).length;
            const minutes = Math.max(1, Math.ceil(wordCount / 200));
            data.readingTime = `${minutes} min read`;

            // Set metaTitle and metaDescription
            if (!data.metaTitle?.trim() && data.title) {
              data.metaTitle = data.title.slice(0, 60);
            }
            if (!data.metaDescription?.trim() && data.excerpt) {
              data.metaDescription = data.excerpt.slice(0, 160);
            }
          }

          // Clear markdownSource after import so it doesn't overwrite
          // markdownContent on subsequent saves
          data.markdownSource = '';
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
    {
      name: "clientConfirmed",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description:
          "Confirm the selected client is correct before saving or publishing",
      },
    },
    {
      name: "markdownGuide",
      type: "ui",
      admin: {
        position: "sidebar",
        components: {
          Field: "./components/MarkdownGuide",
        },
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
              admin: {
                description:
                  "Brief summary for SEO meta description (max 160 characters). This appears in search results.",
              },
              validate: (value: string | null | undefined, args: { siblingData: Record<string, unknown> }) => {
                if (value && value.length > 160 && args.siblingData?._status === "published") {
                  return "Excerpt must be 160 characters or fewer to publish (currently " + value.length + ").";
                }
                return true;
              },
            },
            {
              name: "content",
              type: "richText",
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
              admin: {
                description:
                  "SEO title for search results (max 60 chars). Leave blank to use the main title.",
              },
              validate: (value: string | null | undefined, args: { siblingData: Record<string, unknown> }) => {
                if (value && value.length > 60 && args.siblingData?._status === "published") {
                  return "Meta title must be 60 characters or fewer to publish (currently " + value.length + ").";
                }
                return true;
              },
            },
            {
              name: "metaDescription",
              type: "textarea",
              admin: {
                description:
                  "SEO description (max 160 chars). Leave blank to use the excerpt.",
              },
              validate: (value: string | null | undefined, args: { siblingData: Record<string, unknown> }) => {
                if (value && value.length > 160 && args.siblingData?._status === "published") {
                  return "Meta description must be 160 characters or fewer to publish (currently " + value.length + ").";
                }
                return true;
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
              name: "imagePromptOverride",
              type: "textarea",
              admin: {
                description:
                  "Override the auto-generated image prompt. If filled, the image will be generated from this prompt instead of the title/excerpt. Leave blank to auto-generate from title and excerpt.",
              },
            },
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
