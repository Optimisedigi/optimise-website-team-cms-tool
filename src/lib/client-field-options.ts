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

/** Account Timeline options — shared by the collection, the AccountTimelineTable editor and AdminMate. */
export const ACCOUNT_TIMELINE_SERVICE_AREA_OPTIONS = [
  { label: "Google Ads", value: "google_ads" },
  { label: "SEO", value: "seo" },
  { label: "Analytics / Tracking", value: "analytics" },
  { label: "Website", value: "website" },
  { label: "Social / Meta", value: "social" },
  { label: "Content", value: "content" },
  { label: "Contracts / Legal", value: "contracts" },
  { label: "Onboarding", value: "onboarding" },
  { label: "General", value: "general" },
] as const;

export const ACCOUNT_TIMELINE_ACTION_TYPE_OPTIONS = [
  // Account lifecycle
  { label: "Client First Reached Out", value: "first_contact" },
  { label: "Client Account Created", value: "client_created" },
  { label: "Account Takeover", value: "account_takeover" },
  { label: "Account Access Granted", value: "access_granted" },
  { label: "Onboarding Started", value: "onboarding_started" },
  { label: "Onboarding Completed", value: "onboarding_completed" },
  // Contracts & agreements
  { label: "Contract Start Date", value: "contract_start" },
  { label: "Retainer Start Date", value: "retainer_start" },
  { label: "Contract Sent", value: "contract_sent" },
  { label: "Contract Signed", value: "contract_signed" },
  { label: "Contract Renewed", value: "contract_renewed" },
  { label: "Scope of Work Changed", value: "scope_changed" },
  // Meetings & communication
  { label: "Kickoff Meeting", value: "kickoff_meeting" },
  { label: "Strategy Meeting", value: "strategy_meeting" },
  { label: "Review Meeting", value: "review_meeting" },
  { label: "Client Presentation", value: "client_presentation" },
  { label: "Presentation Analysis Done", value: "presentation_analysis" },
  // Audits
  { label: "Account Audit", value: "account_audit" },
  // Tracking & tagging
  { label: "Tagging Updated", value: "tagging_updated" },
  { label: "Conversion Tracking Changed", value: "conversion_tracking_changed" },
  { label: "GA4 Setup / Migration", value: "ga4_setup" },
  { label: "GTM Setup / Updated", value: "gtm_updated" },
  // Google Ads
  { label: "Campaign Start Date", value: "campaign_start" },
  { label: "Google Ads Account Linked", value: "google_ads_account_linked" },
  { label: "Campaign Structure Proposed", value: "campaign_structure_proposed" },
  { label: "Campaign Structure Implemented", value: "campaign_structure_implemented" },
  { label: "Budget Changed", value: "budget_changed" },
  { label: "Negative Keyword List Added", value: "negative_keywords_added" },
  { label: "Bid Strategy Changed", value: "bid_strategy_changed" },
  { label: "Ad Copy Generated", value: "ad_copy_generated" },
  { label: "Ad Copy Updated", value: "ad_copy_updated" },
  { label: "Landing Pages Changed", value: "landing_pages_changed" },
  // SEO
  { label: "SEO / Website Migration", value: "site_migration" },
  // Reporting & dashboards
  { label: "Dashboard Created", value: "dashboard_created" },
  { label: "Reporting Started", value: "reporting_started" },
  // General
  { label: "Strategy Change", value: "strategy_change" },
  { label: "Process Milestone", value: "process_milestone" },
  { label: "Other", value: "other" },
] as const;

/** The label an admin sees for a stored option value; unknown values pass through unchanged. */
export function optionLabel(
  options: ReadonlyArray<{ label: string; value: string }>,
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return options.find((option) => option.value === value)?.label ?? value;
}

export type ClientService = (typeof CLIENT_SERVICE_OPTIONS)[number]["value"];
export type ClientType = (typeof CLIENT_TYPE_OPTIONS)[number]["value"];
