import type { CollectionConfig } from "payload";

/**
 * Job Posts Collection
 *
 * Manage job listings that appear on the careers page.
 * Only published posts are shown on the website.
 */
export const JobPosts: CollectionConfig = {
  slug: "job-posts",
  admin: {
    useAsTitle: "jobTitle",
    group: "Content",
    defaultColumns: ["jobTitle", "department", "location", "employmentType", "status"],
    description: "Manage open roles displayed on the careers page",
    hidden: ({ user }) => user?.role === "specialist",
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return false;
      return ["admin", "manager"].includes(req.user.role);
    },
    create: ({ req }) => {
      if (!req.user) return false;
      return ["admin", "manager"].includes(req.user.role);
    },
    update: ({ req }) => {
      if (!req.user) return false;
      return ["admin", "manager"].includes(req.user.role);
    },
    delete: ({ req }) => {
      if (!req.user) return false;
      return ["admin", "manager"].includes(req.user.role);
    },
  },
  versions: {
    drafts: true,
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      admin: {
        description: "Select which client this job post belongs to",
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
      type: "tabs",
      tabs: [
        {
          label: "Role Details",
          fields: [
            {
              name: "jobTitle",
              type: "text",
              required: true,
              admin: {
                description: "Job title as it should appear on the careers page (e.g. 'Senior SEO Specialist').",
              },
            },
            {
              name: "excerpt",
              type: "textarea",
              required: true,
              maxLength: 200,
              admin: {
                description: "One-liner summary shown in the job card (max 200 characters).",
              },
            },
            {
              name: "description",
              type: "richText",
              required: true,
              admin: {
                description: "Full job description — responsibilities, what the role involves, and what success looks like.",
              },
            },
          ],
        },
        {
          label: "Classification",
          fields: [
            {
              name: "department",
              type: "select",
              required: true,
              options: [
                { label: "SEO", value: "seo" },
                { label: "Paid Media", value: "paid-media" },
                { label: "CRO & UX", value: "cro" },
                { label: "Strategy", value: "strategy" },
                { label: "Development", value: "development" },
                { label: "Design", value: "design" },
                { label: "Operations", value: "operations" },
              ],
              admin: {
                description: "Which department or team this role sits in.",
              },
            },
            {
              name: "employmentType",
              type: "select",
              required: true,
              options: [
                { label: "Full-time", value: "full-time" },
                { label: "Part-time", value: "part-time" },
                { label: "Contract", value: "contract" },
                { label: "Freelance", value: "freelance" },
              ],
              defaultValue: "full-time",
              admin: {
                description: "Type of employment.",
              },
            },
            {
              name: "location",
              type: "text",
              required: true,
              defaultValue: "Remote",
              admin: {
                description: "Where the role is based (e.g. 'Remote', 'Sydney, AU', 'Hybrid — Melbourne').",
              },
            },
          ],
        },
        {
          label: "SEO & URL",
          fields: [
            {
              name: "slug",
              type: "text",
              required: true,
              unique: true,
              admin: {
                description: "URL slug (e.g. 'senior-seo-specialist'). Auto-generated from the job title if left blank.",
              },
              hooks: {
                beforeValidate: [
                  ({ value, data }) => {
                    if (!value && data?.jobTitle) {
                      return data.jobTitle
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, "");
                    }
                    return value;
                  },
                ],
              },
            },
          ],
        },
        {
          label: "Publishing",
          fields: [
            {
              name: "publishedDate",
              type: "date",
              required: true,
              admin: {
                date: {
                  pickerAppearance: "dayOnly",
                },
                description: "Date this role was posted.",
              },
            },
            {
              name: "status",
              type: "select",
              options: [
                { label: "Draft", value: "draft" },
                { label: "Published", value: "published" },
                { label: "Closed", value: "closed" },
              ],
              defaultValue: "draft",
              required: true,
              admin: {
                position: "sidebar",
                description: "Only 'Published' roles appear on the careers page.",
              },
            },
          ],
        },
      ],
    },
  ],
};
