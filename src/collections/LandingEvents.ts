import type { CollectionConfig } from "payload";
import { canAccess } from "../lib/access";

/**
 * Consent-gated landing behaviour events.
 *
 * Deliberately NOT stored: raw IP, full user agent, form values, free text,
 * email addresses. The ingestion route strips anything outside the documented
 * contract before a record reaches this collection, so a compromised landing
 * page cannot turn this table into a PII store.
 *
 * Writes happen only through the ingestion route using Payload's local API.
 * Every access rule below is admin-facing and requires an authenticated user.
 */
export const LandingEvents: CollectionConfig = {
  slug: "landing-events",
  labels: { singular: "Landing Event", plural: "Landing Events" },
  admin: {
    useAsTitle: "eventType",
    group: "Reports",
    hidden: true,
    description:
      "Consent-gated landing behaviour events. No raw IP, user agent, form values or free text is retained.",
    defaultColumns: ["eventType", "property", "variantId", "occurredAt"],
  },
  access: {
    read: canAccess("nav:dashboard"),
    create: () => false,
    update: () => false,
    delete: canAccess("nav:dashboard"),
  },
  defaultSort: "-occurredAt",
  fields: [
    {
      name: "eventId",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { description: "Client-generated UUID used for idempotent retries." },
    },
    { name: "property", type: "relationship", relationTo: "landing-properties", required: true, index: true },
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    {
      name: "eventType",
      type: "select",
      required: true,
      index: true,
      options: [
        "page_view",
        "section_view",
        "section_engaged",
        "cta_click",
        "form_start",
        "form_step",
        "form_error",
        "form_submit",
        "booking_open",
        "booking_complete",
        "scroll_depth",
        "section_dwell",
      ].map((value) => ({ label: value, value })),
    },
    { name: "occurredAt", type: "date", required: true, index: true },
    { name: "receivedAt", type: "date", required: true },
    { name: "sessionId", type: "text", required: true, index: true },
    { name: "pageViewId", type: "text", required: true },
    {
      name: "visitorId",
      type: "text",
      index: true,
      admin: { description: "Present only when the visitor granted analytics consent." },
    },
    { name: "experimentId", type: "text", index: true },
    { name: "variantId", type: "text", index: true },
    { name: "allocationVersion", type: "text", index: true },
    { name: "contentProfileId", type: "text" },
    { name: "route", type: "text", index: true },
    {
      name: "referrerClass",
      type: "text",
      admin: { description: "Coarse class such as search or social. Never the full referrer URL." },
    },
    { name: "deviceClass", type: "text" },
    {
      name: "attribution",
      type: "json",
      admin: { description: "Allowlisted Google Ads and UTM values only." },
    },
    {
      name: "properties",
      type: "json",
      admin: { description: "Bounded scalars only. Form values and free text are rejected at ingestion." },
    },
  ],
};
