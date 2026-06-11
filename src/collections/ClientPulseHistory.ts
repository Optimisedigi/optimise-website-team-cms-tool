import type { CollectionConfig } from "payload";
import { canAccess } from "../lib/access";

export const ClientPulseHistory: CollectionConfig = {
  slug: "client-pulse-history",
  labels: {
    singular: "Client Pulse History",
    plural: "Client Pulse History",
  },
  admin: {
    useAsTitle: "date",
    group: "Reports",
    description: "Daily Client Pulse score snapshots used for trend sparklines.",
    defaultColumns: ["client", "date", "score", "status"],
    hidden: true,
  },
  access: {
    read: canAccess("clients"),
    create: canAccess("clients"),
    update: canAccess("clients"),
    delete: canAccess("clients"),
  },
  defaultSort: "-date",
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      index: true,
    },
    {
      name: "date",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Daily snapshot key in YYYY-MM-DD format." },
    },
    {
      name: "score",
      type: "number",
      required: true,
      min: 0,
      max: 100,
    },
    {
      name: "status",
      type: "select",
      required: true,
      options: [
        { label: "Good", value: "good" },
        { label: "Watch", value: "watch" },
        { label: "Risk", value: "risk" },
        { label: "Missing", value: "missing" },
        { label: "Not in scope", value: "not_in_scope" },
      ],
    },
    { name: "label", type: "text" },
    { name: "organicScore", type: "number", min: 0, max: 100 },
    { name: "paidSearchScore", type: "number", min: 0, max: 100 },
    { name: "serviceCoverageScore", type: "number", min: 0, max: 100 },
    { name: "neglectScore", type: "number", min: 0, max: 100 },
  ],
};
