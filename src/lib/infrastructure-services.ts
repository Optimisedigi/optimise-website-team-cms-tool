/**
 * Infrastructure & Services inventory
 *
 * The single source of truth for every paid (or free-tier-but-relied-on)
 * external service used by either the Content CMS or the Website Growth
 * Tools repo. Rendered in the Usage Reports admin page as a visibility
 * table for the team.
 *
 * To add or change a service, edit this file. No DB writes, no API calls.
 */

export type ServiceCategory =
  | "Hosting"
  | "Database"
  | "File Storage"
  | "Email"
  | "AI / LLM"
  | "SERP / Search"
  | "Analytics"
  | "Advertising"
  | "Scraping / Screenshots"
  | "CMS Framework";

export type UsedBy = "CMS" | "Growth Tools" | "Both";

export interface InfrastructureService {
  /** Display name as it appears on the provider's dashboard. */
  name: string;
  category: ServiceCategory;
  usedBy: UsedBy;
  /**
   * Plan tier as labelled by the provider. Leave as "?" if you are not
   * sure of the current tier — the row stays visible, you can update it
   * in this file when confirmed.
   */
  plan: string;
  /**
   * Short, human-readable description of what the service is and why we
   * use it. Surfaced as a hover tooltip on the table row.
   */
  tooltip: string;
}

export const INFRASTRUCTURE_SERVICES: InfrastructureService[] = [
  // ── Hosting ──────────────────────────────────────────────────────────
  {
    name: "Vercel",
    category: "Hosting",
    usedBy: "CMS",
    plan: "?",
    tooltip:
      "Hosts the Next.js CMS (cms.optimisedigital.com.au) and proxies /ai-growth-tools/* to Railway. Provides serverless functions, cron jobs, and edge networking.",
  },
  {
    name: "Railway",
    category: "Hosting",
    usedBy: "Growth Tools",
    plan: "?",
    tooltip:
      "Runs the Express + Vite Growth Tools service. Reached publicly via the Vercel proxy on www.optimisedigital.online/ai-growth-tools/.",
  },

  // ── Database ─────────────────────────────────────────────────────────
  {
    name: "Neon (Postgres)",
    category: "Database",
    usedBy: "Both",
    plan: "?",
    tooltip:
      "Serverless Postgres. Stores Growth Tools data (projects, keywords, snapshots, product feeds) and CMS analytics tables (drip leads, dashboard data).",
  },
  {
    name: "Turso / libSQL",
    category: "Database",
    usedBy: "CMS",
    plan: "?",
    tooltip:
      "Hosted libSQL (SQLite) backing the Payload CMS collections. Used via @payloadcms/db-sqlite with DATABASE_AUTH_TOKEN for remote access.",
  },

  // ── File storage ─────────────────────────────────────────────────────
  {
    name: "Vercel Blob",
    category: "File Storage",
    usedBy: "CMS",
    plan: "?",
    tooltip:
      "Object storage for CMS media uploads (images, PDFs, audio). Configured via @payloadcms/storage-vercel-blob and BLOB_READ_WRITE_TOKEN.",
  },

  // ── Email ────────────────────────────────────────────────────────────
  {
    name: "Postmark",
    category: "Email",
    usedBy: "Both",
    plan: "?",
    tooltip:
      "Transactional email — audit reports, OptiMate alerts, contractor notifications. Used by both repos for outbound mail.",
  },
  {
    name: "SendGrid",
    category: "Email",
    usedBy: "CMS",
    plan: "?",
    tooltip:
      "Secondary email provider for the CMS via @sendgrid/mail.",
  },

  // ── AI / LLM ─────────────────────────────────────────────────────────
  {
    name: "Anthropic Claude",
    category: "AI / LLM",
    usedBy: "CMS",
    plan: "?",
    tooltip:
      "Primary LLM for the OptiMate Google Ads agent. Used via Claude Code OAuth impersonation (preferred) with ANTHROPIC_API_KEY as a fallback path.",
  },
  {
    name: "Moonshot / Kimi",
    category: "AI / LLM",
    usedBy: "Both",
    plan: "?",
    tooltip:
      "Kimi K2 LLM. Powers the Product Feed Optimizer 'Run AI' rules in Growth Tools (moonshot-v1-8k) and acts as the OAuth-fallback model in the CMS agent chain.",
  },
  {
    name: "MiniMax",
    category: "AI / LLM",
    usedBy: "CMS",
    plan: "?",
    tooltip:
      "MiniMax M2.7 LLM. Final fallback in the OptiMate agent chain when Claude OAuth and Kimi are unavailable.",
  },
  {
    name: "Google Gemini",
    category: "AI / LLM",
    usedBy: "CMS",
    plan: "?",
    tooltip:
      "Used for blog post image generation and audio transcription via @google/genai (GOOGLE_GENERATIVE_AI_API_KEY).",
  },
  {
    name: "OpenAI",
    category: "AI / LLM",
    usedBy: "Growth Tools",
    plan: "?",
    tooltip:
      "OpenAI API used by Growth Tools for embedding and ad-hoc LLM calls (openai npm package).",
  },

  // ── SERP / search data ───────────────────────────────────────────────
  {
    name: "Serper",
    category: "SERP / Search",
    usedBy: "Growth Tools",
    plan: "?",
    tooltip:
      "Google SERP API powering keyword tracking, SERP analyzer, and competitor analysis (SERPER_API_KEY).",
  },
  {
    name: "DataForSEO",
    category: "SERP / Search",
    usedBy: "Growth Tools",
    plan: "?",
    tooltip:
      "Alternate SERP provider with AI Overview detection — gated by SERP_PROVIDER=dataforseo|dataforseo_smart and used by the SERP Displacement Monitor and AI Search Erosion detector.",
  },
  {
    name: "Google Search Console API",
    category: "SERP / Search",
    usedBy: "CMS",
    plan: "Free (OAuth)",
    tooltip:
      "Pulls organic search performance and indexing data for CMS dashboards and the indexing helper. Free quota-based API authenticated via Google OAuth.",
  },

  // ── Analytics / performance ──────────────────────────────────────────
  {
    name: "Google Analytics 4 API",
    category: "Analytics",
    usedBy: "Both",
    plan: "Free (OAuth)",
    tooltip:
      "GA4 Data API for traffic, conversions, and channel reporting. Used by the CMS Team hub dashboards and Growth Tools AI Visibility snapshots.",
  },
  {
    name: "PageSpeed Insights",
    category: "Analytics",
    usedBy: "Both",
    plan: "Free (API key)",
    tooltip:
      "Google PageSpeed Insights API for Core Web Vitals and performance auditing. Used by both repos via GOOGLE_PAGESPEED_API_KEY.",
  },
  {
    name: "SimilarWeb",
    category: "Analytics",
    usedBy: "Growth Tools",
    plan: "?",
    tooltip:
      "Traffic and competitive intelligence data, used inside Growth Tools competitor analysis.",
  },

  // ── Advertising ──────────────────────────────────────────────────────
  {
    name: "Google Ads API",
    category: "Advertising",
    usedBy: "Growth Tools",
    plan: "Free (OAuth + developer token)",
    tooltip:
      "Powers the Google Ads audit suite, OptiMate agent monitoring, and keyword planner. Authenticated via GOOGLE_ADS_* OAuth credentials.",
  },
  {
    name: "Google Tag Manager API",
    category: "Advertising",
    usedBy: "Growth Tools",
    plan: "Free (OAuth)",
    tooltip:
      "Used by Tag Audit and Tag Deploy tools to read and write GTM containers. Auth via GOOGLE_TAG_AUDIT_REFRESH_TOKEN and GOOGLE_TAG_DEPLOY_REFRESH_TOKEN.",
  },
  {
    name: "Google Merchant Center",
    category: "Advertising",
    usedBy: "Growth Tools",
    plan: "Free (OAuth)",
    tooltip:
      "Reads product feed performance metrics for the Product Feed Optimizer. OAuth-based.",
  },
  {
    name: "Meta Ad Library",
    category: "Advertising",
    usedBy: "Growth Tools",
    plan: "?",
    tooltip:
      "Meta Ad Library API for competitor ad transparency. Authenticated via META_AD_LIBRARY_TOKEN.",
  },

  // ── Scraping / screenshots ───────────────────────────────────────────
  {
    name: "ScreenshotOne",
    category: "Scraping / Screenshots",
    usedBy: "CMS",
    plan: "?",
    tooltip:
      "Hosted screenshot API used by the CMS for proposal previews and report visuals (SCREENSHOTONE_ACCESS_KEY).",
  },
  {
    name: "Scrapling service",
    category: "Scraping / Screenshots",
    usedBy: "CMS",
    plan: "Self-hosted",
    tooltip:
      "Internal self-hosted scraping service (SCRAPLING_SERVICE_URL). Used by CMS audits when off-the-shelf scrapers are blocked.",
  },

  // ── CMS framework ────────────────────────────────────────────────────
  {
    name: "Payload CMS",
    category: "CMS Framework",
    usedBy: "CMS",
    plan: "Open source (self-hosted)",
    tooltip:
      "The headless CMS framework the content-cms repo is built on (payload@3.x). Self-hosted on Vercel.",
  },
];
