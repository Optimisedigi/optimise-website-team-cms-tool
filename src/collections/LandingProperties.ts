import type { CollectionConfig } from "payload";
import { canAccess } from "../lib/access";

/**
 * Registry of client landing-page deployments allowed to talk to the landing
 * manifest and ingestion routes.
 *
 * `propertyKey` is a PUBLIC identifier shipped inside landing-page JavaScript.
 * It identifies a property; it never grants authority. Tenant scope, allowed
 * origins and experiment eligibility are all resolved server-side from this
 * record, so a copied key alone cannot reach another client's data.
 */
export const LandingProperties: CollectionConfig = {
  slug: "landing-properties",
  labels: { singular: "Landing Property", plural: "Landing Properties" },
  admin: {
    useAsTitle: "name",
    group: "Reports",
    description:
      "Client landing deployments permitted to send experiment and behaviour events. propertyKey is public; allowedOrigins is the real gate.",
    defaultColumns: ["name", "client", "propertyKey", "status"],
  },
  access: {
    read: canAccess("nav:dashboard"),
    create: canAccess("nav:dashboard"),
    update: canAccess("nav:dashboard"),
    delete: canAccess("nav:dashboard"),
  },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    {
      name: "propertyKey",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          "Public key embedded in the landing page. Identification only — never treat it as a credential.",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "active",
      index: true,
      options: [
        { label: "Active", value: "active" },
        { label: "Paused", value: "paused" },
      ],
    },
    {
      name: "allowedOrigins",
      type: "array",
      required: true,
      minRows: 1,
      admin: {
        description:
          "Exact scheme://host[:port] origins permitted to call the landing routes. Anything else is refused.",
      },
      fields: [{ name: "origin", type: "text", required: true }],
    },
    {
      name: "activeExperiment",
      type: "relationship",
      relationTo: "landing-experiments",
      admin: {
        description: "Leave empty to serve default content with no experiment assignment.",
      },
    },
    {
      name: "consentVersion",
      type: "text",
      required: true,
      defaultValue: "2026-08-14",
      admin: { description: "Bump to force re-consent across every deployment of this property." },
    },
    {
      name: "retentionDays",
      type: "number",
      required: true,
      defaultValue: 90,
      min: 1,
      max: 400,
      admin: { description: "Days of landing events retained before pruning." },
    },
  ],
};
