export const SNAPSHOT_SCHEMA_VERSION = 3;

export const SNAPSHOT_DATASET_KEYS = [
  "customer_metadata", "monthly_account_metrics", "monthly_campaign_metrics", "campaigns", "ad_groups", "keywords",
  "search_terms", "conversion_actions", "conversion_action_performance", "campaign_conversion_action_performance_30d", "campaign_impression_share",
  "campaign_negative_keywords", "shared_negative_keywords", "campaign_shared_set_assignments", "ads", "ad_assets", "landing_page_views",
  "customer_conversion_goals", "campaign_conversion_goals", "campaign_goal_configs", "campaign_location_criteria",
  "campaign_language_criteria", "campaign_ad_schedules", "device_performance", "audience_segments", "negative_change_history",
  "website_assessment", "paid_serp_competitors", "competitor_ad_creatives", "capture_diagnostics",
] as const;

export type SnapshotDatasetKey = (typeof SNAPSHOT_DATASET_KEYS)[number];
export type SnapshotStorageMode = "database_json" | "private_blob_gzip_v1";
export type SnapshotBlobEncoding = "gzip";
export type EvidenceProvider = "google_ads" | "direct_http" | "scrapling" | "serper" | "ads_transparency" | "blob_storage";
export type EvidenceCaptureStatus = "completed" | "unavailable" | "failed";

export interface CaptureDiagnostic {
  datasetKey: SnapshotDatasetKey;
  provider: EvidenceProvider;
  capturedAt: string;
  status: EvidenceCaptureStatus;
  failureReason?: string;
  observedStart?: string;
  observedEnd?: string;
}

export interface FrozenAuditContext {
  websiteUrl?: string;
  businessName: string;
  businessType?: string;
  brandTerms: string[];
  conversionObjectives: string[];
  searchLocation: string;
  searchLanguage: string;
  competitorSeedQueries: string[];
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  rubricVersion: string;
}

export interface WebsitePageEvidence {
  requestedUrl: string;
  finalUrl?: string;
  capturedAt: string;
  status: "completed" | "unavailable" | "failed";
  provider: "direct_http" | "scrapling";
  httpStatus?: number;
  redirectTarget?: string;
  canonical?: string;
  indexable?: boolean;
  title?: string;
  h1?: string;
  bodyIntentTerms?: string[];
  ctaTexts?: string[];
  primaryCtaCount?: number;
  aboveFoldCtaCount?: number;
  formCount?: number;
  formFieldCount?: number;
  phoneLinkCount?: number;
  emailLinkCount?: number;
  trustSignalCount?: number;
  navigationLinkCount?: number;
  intentAlignment?: "pass" | "fail" | "unknown";
  contentHash?: string;
  sourceHash?: string;
  failureReason?: string;
  discoveredLinks?: string[];
}

export interface WebsiteAssessment {
  websiteUrl?: string;
  sampledLandingPages: string[];
  pages: WebsitePageEvidence[];
  categoryPages: string[];
}

export interface SnapshotWindow {
  requestedAt: string;
  periodStart: string;
  periodEnd: string;
  earliestAvailableActivityDate: string;
  accountTimeZone: string;
  accountName: string;
  currencyCode: string;
  retentionCaveat: string;
  captureContext: FrozenAuditContext;
}

export interface SnapshotManifestItem {
  datasetKey: SnapshotDatasetKey;
  chunkIndex: number;
  rowCount: number;
  checksum: string;
  storageMode?: SnapshotStorageMode;
  blobUrl?: string;
  blobPathname?: string;
  encoding?: SnapshotBlobEncoding;
  compressedBytes?: number;
  uncompressedBytes?: number;
}

export interface SnapshotBlobMetadata {
  storageMode: "private_blob_gzip_v1";
  blobUrl: string;
  blobPathname: string;
  encoding: SnapshotBlobEncoding;
  checksum: string;
  compressedBytes: number;
  uncompressedBytes: number;
}
