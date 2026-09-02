/**
 * Shared option lists for the `clients` collection.
 *
 * Extracted so agents (AdminMate) validate staged values against the exact same
 * enums the collection renders, instead of a second hand-maintained copy.
 */
export const CLIENT_SERVICE_OPTIONS = [
  { label: "Google Ads", value: "google_ads" },
  { label: "SEO", value: "seo" },
  { label: "Paid Social", value: "paid_social" },
  { label: "Website Build", value: "website_build" },
  { label: "Automations", value: "automations" },
] as const;

export const CLIENT_TYPE_OPTIONS = [
  { label: "Recurring", value: "recurring" },
  { label: "One-off", value: "one_off" },
  { label: "Paused", value: "paused" },
] as const;

export type ClientService = (typeof CLIENT_SERVICE_OPTIONS)[number]["value"];
export type ClientType = (typeof CLIENT_TYPE_OPTIONS)[number]["value"];
