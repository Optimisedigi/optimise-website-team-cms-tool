import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";

/**
 * Official Google Search Status Dashboard incidents (core / spam / Discover
 * updates and serving outages). Polled daily from
 * https://status.search.google.com/incidents.json — no scraping, no key.
 * The Watchtower page is the front door, hence admin.hidden.
 */
export const GoogleSearchStatusIncidents: CollectionConfig = {
  slug: "google-search-status-incidents" as any,
  labels: {
    singular: "Google Search Status Incident",
    plural: "Google Search Status Incidents",
  },
  admin: {
    hidden: true,
    useAsTitle: "title",
    defaultColumns: ["title", "kind", "begin", "end", "severity"],
    description: "Confirmed Google Search algorithm updates and serving incidents.",
  },
  access: {
    read: ({ req }) => Boolean(req.user) || hasValidApiKey(req),
    create: ({ req }) => Boolean(req.user) || hasValidApiKey(req),
    update: ({ req }) => Boolean(req.user) || hasValidApiKey(req),
    delete: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
  },
  defaultSort: "-begin",
  fields: [
    {
      name: "incidentId",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { description: "Google's incident id — the dedupe key across cron runs." },
    },
    { name: "title", type: "text", required: true },
    {
      name: "kind",
      type: "select",
      required: true,
      index: true,
      defaultValue: "other",
      options: [
        { label: "Core update", value: "core" },
        { label: "Spam update", value: "spam" },
        { label: "Discover update", value: "discover" },
        { label: "Serving incident", value: "serving" },
        { label: "Other", value: "other" },
      ],
    },
    { name: "begin", type: "text", index: true },
    { name: "end", type: "text" },
    { name: "modified", type: "text" },
    { name: "statusImpact", type: "text" },
    { name: "severity", type: "text" },
    { name: "serviceName", type: "text" },
    { name: "latestUpdate", type: "textarea" },
    { name: "sourceUri", type: "text" },
    {
      name: "notifiedAt",
      type: "text",
      admin: { description: "Set once admins have been bell-notified about this incident." },
    },
    { name: "raw", type: "json" },
  ],
};
