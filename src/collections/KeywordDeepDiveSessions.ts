import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";
import { canAccessOrApiKey, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

export type KeywordDeepDiveSessionStatus =
  | "pending"
  | "applied"
  | "archived";

const KeywordDeepDiveSessions: CollectionConfig = {
  slug: "keyword-deep-dive-sessions",
  labels: {
    singular: "Negative Keyword Submit",
    plural: "Negative Keyword Submits",
  },
  admin: {
    // Sidebar entry is hidden via CSS in src/app/(payload)/custom.scss so
    // the collection still has working edit routes (Payload's `hidden: true`
    // excludes it from routes too, which would break the Apply to NKL flow).
    // Non-admins without the feature key are blocked the standard way.
    hidden: hideUnlessFeature("keyword-deep-dive-sessions"),
    useAsTitle: "title",
    defaultColumns: ["client", "googleAdsAudit", "keywordCount", "status", "appliedToNKL", "createdAt"],
    listSearchableFields: ["client", "title"],
    pagination: {
      defaultLimit: 25,
    },
  },
  access: {
    read: canAccessOrApiKey("keyword-deep-dive-sessions", hasValidApiKey),
    create: canAccessOrApiKey("keyword-deep-dive-sessions", hasValidApiKey),
    update: canAccessOrApiKey("keyword-deep-dive-sessions", hasValidApiKey),
    delete: adminOnlyDelete,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data?.keywords) {
          data.keywordCount = Array.isArray(data.keywords)
            ? data.keywords.length
            : 0;
        }
        // Auto-generate title if not provided
        if (!data?.title && data?.client) {
          const timestamp = new Date().toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
          data.title = `Negative Keyword Submit — ${timestamp}`;
        }
        return data;
      },
    ],
  },
  fields: [
    // Sidebar
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      admin: {
        position: "sidebar",
        description: "The client this session belongs to",
      },
    },
    {
      name: "googleAdsAudit",
      type: "relationship",
      relationTo: "google-ads-audits",
      admin: {
        position: "sidebar",
        description: "Which audit this session was created from (optional)",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      options: [
        { label: "Pending Review", value: "pending" },
        { label: "Applied to NKL", value: "applied" },
        { label: "Archived", value: "archived" },
      ],
      admin: {
        position: "sidebar",
        description: "Whether these keywords have been applied to a Negative Keyword List",
      },
    },
    {
      name: "appliedToNKL",
      type: "relationship",
      relationTo: "negative-keyword-lists",
      admin: {
        position: "sidebar",
        description: "The NKL these keywords were applied to",
        condition: (data) => data?.status === "applied",
      },
    },
    {
      name: "title",
      type: "text",
      required: true,
      admin: {
        description: "Session title (auto-generated if left blank)",
      },
    },
    {
      name: "notes",
      type: "textarea",
      admin: {
        description: "Internal notes about this session",
      },
    },
    {
      name: "keywordCount",
      type: "number",
      defaultValue: 0,
      admin: {
        readOnly: true,
        description: "Auto-calculated keyword count",
      },
    },
    // Keywords array — displayed via a custom UI component below
    {
      name: "keywords",
      type: "array",
      admin: {
        description: "Search terms the client submitted from the Keyword Deep Dive tool",
        initCollapsed: true,
      },
      fields: [
        {
          name: "keyword",
          type: "text",
          required: true,
          admin: {
            description: "The search term",
          },
        },
        {
          name: "matchType",
          type: "select",
          required: true,
          defaultValue: "exact",
          options: [
            { label: "Broad", value: "broad" },
            { label: "Phrase", value: "phrase" },
            { label: "Exact", value: "exact" },
          ],
          admin: {
            width: "25%",
          },
        },
        {
          name: "flaggedForRemoval",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description: "Exclude from applying to NKL",
            width: "20%",
          },
        },
      ],
    },
    // Apply to NKL UI component
    {
      name: "applyToNKL",
      type: "ui",
      admin: {
        components: {
          Field: "./components/ApplyToNKLButton",
        },
      },
    },
  ],
};

export default KeywordDeepDiveSessions;
