export const SNAPSHOT_SCHEMA_VERSION = 1;

export const SNAPSHOT_DATASET_KEYS = [
  "customer_metadata", "monthly_account_metrics", "monthly_campaign_metrics", "campaigns", "ad_groups", "keywords",
  "search_terms", "conversion_actions", "conversion_action_performance", "campaign_impression_share", "auction_insights",
  "campaign_negative_keywords", "shared_negative_keywords", "campaign_shared_set_assignments", "ads", "ad_assets", "landing_page_views",
] as const;

export type SnapshotDatasetKey = (typeof SNAPSHOT_DATASET_KEYS)[number];

export interface SnapshotWindow {
  requestedAt: string;
  periodStart: string;
  periodEnd: string;
  earliestAvailableActivityDate: string;
  accountTimeZone: string;
  currencyCode: string;
  retentionCaveat: string;
}

export interface SnapshotManifestItem {
  datasetKey: SnapshotDatasetKey;
  chunkIndex: number;
  rowCount: number;
  checksum: string;
}
