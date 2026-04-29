import type { CollectionConfig } from "payload";
import { FEATURE_KEYS, adminOnlyAccess, adminOnlyField } from "../lib/access";

/**
 * Permission Profiles
 *
 * Reusable bundles of feature access. Admins create profiles like
 * "Content Specialist", "Account Manager", etc., then assign them to
 * users. A user's effective feature set is the union of:
 *  - the profile's `features`, for every assigned profile
 *  - the user's own `featureAccess` overrides
 *  - any auto-granted features (e.g. `clients-basic`)
 *
 * Admins ignore profiles entirely \u2014 they always have full access.
 */
export const PermissionProfiles: CollectionConfig = {
  slug: "permission-profiles",
  admin: {
    useAsTitle: "name",
    group: "Admin",
    description:
      "Reusable feature-access bundles assignable to users (e.g. 'Content Specialist').",
    defaultColumns: ["name", "description", "featuresCount"],
    // Only admins see this in the sidebar.
    hidden: ({ user }) => (user as any)?.role !== "admin",
  },
  access: {
    // Read: all logged-in users (so the picker on the User edit screen can
    // resolve profile names), but only admins can list/manage in the UI.
    read: ({ req }) => !!req.user,
    create: adminOnlyAccess,
    update: adminOnlyAccess,
    delete: adminOnlyAccess,
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "Display name (e.g. 'Content Specialist', 'Account Manager').",
      },
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description: "Optional summary of what this profile is for.",
      },
    },
    {
      name: "features",
      type: "select",
      hasMany: true,
      options: FEATURE_KEYS as unknown as { label: string; value: string }[],
      access: {
        update: adminOnlyField,
      },
      admin: {
        description:
          "Features granted by this profile. Auto-grants (like clients-basic) apply automatically when this profile is assigned to a user.",
        components: {
          Field: "./components/FeatureAccessPicker",
        },
      },
    },
    {
      name: "featuresCount",
      type: "number",
      virtual: true,
      admin: {
        readOnly: true,
        hidden: true, // virtual \u2014 used only for the list column
      },
      hooks: {
        afterRead: [
          ({ siblingData }) =>
            Array.isArray((siblingData as any)?.features)
              ? (siblingData as any).features.length
              : 0,
        ],
      },
    },
  ],
};
