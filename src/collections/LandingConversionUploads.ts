import type { CollectionConfig } from "payload";
import { canAccess } from "../lib/access";

/**
 * Ledger of landing-page leads replayed to Google Ads through the Data
 * Manager API (see src/lib/landing-conversions/sync.ts).
 *
 * One row per ad click per property. `transactionId` is what Google dedupes
 * on, so a row in `sent` state means the lead will not be sent again from
 * here. Click-ID only: no contact data is stored.
 */
export const LandingConversionUploads: CollectionConfig = {
  slug: "landing-conversion-uploads",
  labels: { singular: "Landing Conversion Upload", plural: "Landing Conversion Uploads" },
  admin: {
    group: "Reports",
    useAsTitle: "transactionId",
    defaultColumns: ["property", "leadOccurredAt", "status", "clickIdType", "detail"],
    description: "Landing-page leads sent server-side to Google Ads, one per ad click. Written by the daily sync; read-only in practice.",
  },
  access: {
    read: canAccess("nav:dashboard"),
    create: () => false,
    update: () => false,
    delete: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
  },
  defaultSort: "-leadOccurredAt",
  fields: [
    { name: "property", type: "relationship", relationTo: "landing-properties", required: true, index: true },
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "customerId", type: "text", required: true },
    { name: "conversionActionId", type: "text", required: true },
    { name: "transactionId", type: "text", required: true, index: true },
    { name: "clickIdType", type: "select", options: ["gclid", "gbraid", "wbraid", "none"], required: true },
    { name: "leadOccurredAt", type: "date", required: true, index: true },
    { name: "eventIds", type: "textarea", admin: { description: "landing_events.event_id values collapsed into this upload, one per line." } },
    { name: "status", type: "select", options: ["sent", "validated", "skipped", "failed"], required: true, index: true },
    { name: "detail", type: "text" },
    { name: "requestId", type: "text", admin: { description: "Data Manager request ID, for Google support." } },
  ],
};
