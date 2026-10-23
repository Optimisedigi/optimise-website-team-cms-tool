/**
 * Categories for the top-bar notifications bell: each notification `kind`
 * (see src/collections/Notifications.ts) belongs to one category, which sets
 * its colour and the small label on its row. Unknown kinds fall back to "Other".
 */

export type NotificationCategoryKey = "email" | "google-ads" | "agents" | "seo" | "billing" | "meetings" | "team" | "other";

export interface NotificationCategory {
  key: NotificationCategoryKey;
  label: string;
  /** Left bar, dot and label colour. */
  color: string;
}

export const NOTIFICATION_CATEGORIES: Record<NotificationCategoryKey, NotificationCategory> = {
  email: { key: "email", label: "Email", color: "#dc2626" },
  "google-ads": { key: "google-ads", label: "Google Ads", color: "#1a73e8" },
  agents: { key: "agents", label: "Agents", color: "#7c3aed" },
  seo: { key: "seo", label: "SEO & site", color: "#16a34a" },
  billing: { key: "billing", label: "Contracts & billing", color: "#ea580c" },
  meetings: { key: "meetings", label: "Meetings", color: "#0d9488" },
  team: { key: "team", label: "Team", color: "#db2777" },
  other: { key: "other", label: "Other", color: "#6b7280" },
};

const CATEGORY_BY_KIND: Record<string, NotificationCategoryKey> = {
  "client-email-received": "email",
  "mail-follow-up-due": "email",
  "negative-keywords-needs-review": "google-ads",
  "negative-keywords-removed": "google-ads",
  "consolidation-pending": "google-ads",
  "google-ads-budget-review": "google-ads",
  "google-ads-keyword-cost-finder-usage": "google-ads",
  "google-automation-detected": "google-ads",
  "agent-approval-pending": "agents",
  "goal-run-escalation": "agents",
  "site-health-regression": "seo",
  "google-search-update": "seo",
  "node-security-release": "seo",
  "nextjs-security-advisory": "seo",
  "contract-annual-review-11mo": "billing",
  "contract-annual-review-11.5mo": "billing",
  "invoice-statements-ready": "billing",
  "hosting-duplicate-subscription": "billing",
  "meeting-response-accepted": "meetings",
  "meeting-response-declined": "meetings",
  "meeting-confirmed": "meetings",
  "team-task-mention": "team",
};

export function notificationCategory(kind: string | null | undefined): NotificationCategory {
  return NOTIFICATION_CATEGORIES[CATEGORY_BY_KIND[kind ?? ""] ?? "other"];
}
