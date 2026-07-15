import type { CollectionConfig } from "payload";
import { FEATURE_KEYS, adminOnlyField } from "../lib/access";

export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    // Per-user API key feature is intentionally OFF — nothing in this
    // codebase consumes Payload's per-user API keys. Service-to-service
    // calls use the shared AUDIT_API_KEY env var checked via the
    // x-api-key header (see src/collections/api-key-access.ts).
    maxLoginAttempts: 5,
    // 2-hour token lifetime, but treated as an IDLE timeout rather than an
    // absolute one: src/components/IdleSessionKeepAlive.tsx slides this window
    // forward on user activity (across all open tabs), so the "stay logged in"
    // prompt only appears after ~2h of genuine inactivity. Keep this value in
    // sync with SESSION_TTL_MS in that component.
    tokenExpiration: 7200,
  },
  admin: {
    useAsTitle: "email",
    group: "Admin",
    // Hide Users tab from anyone except admins.
    hidden: ({ user }) => user?.role !== "admin",
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return false;
      if (req.user.role === "admin") return true;
      return { id: { equals: req.user.id } };
    },
    create: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
    update: ({ req }) => {
      if (!req.user) return false;
      if (req.user.role === "admin") return true;
      return { id: { equals: req.user.id } };
    },
    delete: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "role",
      type: "select",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Manager", value: "manager" },
        { label: "Specialist", value: "specialist" },
      ],
      defaultValue: "specialist",
      required: true,
      access: {
        update: adminOnlyField,
      },
      admin: {
        description:
          "Admins have full access to everything. Managers and Specialists are limited to the features ticked below.",
      },
    },
    {
      name: "permissionProfiles",
      type: "relationship",
      relationTo: "permission-profiles",
      hasMany: true,
      access: {
        update: adminOnlyField,
      },
      admin: {
        description:
          "Reusable feature bundles. The user inherits all features from each assigned profile, on top of their own per-user overrides below.",
        condition: (data) => data?.role !== "admin",
      },
    },
    {
      name: "featureAccess",
      type: "select",
      hasMany: true,
      options: FEATURE_KEYS as unknown as { label: string; value: string }[],
      access: {
        update: adminOnlyField,
      },
      admin: {
        // Custom grouped checkbox UI showing auto-granted features as ticked
        // + disabled. See src/components/FeatureAccessPicker.tsx.
        components: {
          Field: "./components/FeatureAccessPicker",
        },
        condition: (data) => data?.role !== "admin",
      },
    },
    {
      name: "setupCompleted",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description:
          "Whether this user has completed their first-login setup",
        condition: (_data, _siblingData, { user }) =>
          user?.role === "admin",
      },
    },
    // Gmail OAuth fields (per-user) — used by scheduled-agent-tasks to drop
    // recurring agent reports into the user's own Gmail Drafts folder.
    {
      name: "gmailConnected",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description:
          "Whether this user has connected their Gmail account for scheduled-task drafts.",
        readOnly: true,
      },
      access: {
        update: adminOnlyField,
      },
    },
    {
      name: "gmailEmail",
      type: "text",
      admin: {
        position: "sidebar",
        description: "The Gmail address associated with the connection.",
        readOnly: true,
      },
      access: {
        update: adminOnlyField,
      },
    },
    {
      name: "gmailAccessToken",
      type: "text",
      admin: {
        hidden: true,
      },
      access: {
        // Only the owner or an admin can read/write Gmail tokens.
        read: ({ req, doc }) => {
          if (!req.user) return false;
          if (req.user.role === "admin") return true;
          return doc?.id === req.user.id;
        },
        update: adminOnlyField,
        create: adminOnlyField,
      },
    },
    {
      name: "gmailRefreshToken",
      type: "text",
      admin: {
        hidden: true,
      },
      access: {
        read: ({ req, doc }) => {
          if (!req.user) return false;
          if (req.user.role === "admin") return true;
          return doc?.id === req.user.id;
        },
        update: adminOnlyField,
        create: adminOnlyField,
      },
    },
    {
      name: "gmailTokenExpiry",
      type: "date",
      admin: {
        hidden: true,
      },
      access: {
        read: ({ req, doc }) => {
          if (!req.user) return false;
          if (req.user.role === "admin") return true;
          return doc?.id === req.user.id;
        },
        update: adminOnlyField,
        create: adminOnlyField,
      },
    },
  ],
};
