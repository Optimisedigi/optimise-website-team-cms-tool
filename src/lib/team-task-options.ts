export const TEAM_TASK_TYPE_OPTIONS = [
  { label: "Blog Post", value: "blog_post" },
  { label: "Email", value: "email" },
  { label: "Product Page", value: "product_page" },
  { label: "Product Update", value: "product_update" },
  { label: "Research", value: "research" },
  { label: "Website Content", value: "website_content" },
  { label: "SEO", value: "seo" },
  { label: "Internal Documentation", value: "internal_documentation" },
  { label: "Reporting", value: "reporting" },
  { label: "Google Ads", value: "google_ads" },
  { label: "Schema Fix", value: "schema_fix" },
  { label: "FAQ Schema", value: "faq_schema" },
  { label: "Product Feed", value: "product_feed" },
  { label: "Google Sheet", value: "google_sheet" },
  { label: "Other", value: "other" },
] as const;

export const TEAM_TASK_PRIORITY_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
] as const;

export type TeamTaskType = (typeof TEAM_TASK_TYPE_OPTIONS)[number]["value"];
export type TeamTaskPriority = (typeof TEAM_TASK_PRIORITY_OPTIONS)[number]["value"];
