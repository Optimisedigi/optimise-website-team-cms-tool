import type { Payload } from "payload";

type ActivityType =
  | "blog_published"
  | "seo_audit_completed"
  | "cro_audit_completed"
  | "keyword_analysis"
  | "client_added"
  | "retainer_changed"
  | "proposal_created"
  | "gsc_snapshot"
  | "time_tracked"
  | "google_ads_audit_created"
  | "google_ads_proposal_created"
  | "link_suggestion_created"
  | "negative_sweep_completed"
  | "negative_sweep_synced"
  | "contract_created"
  | "contract_agency_signed"
  | "contract_sent"
  | "contract_client_signed"
  | "contract_link_generated"
  | "lead_created"
  | "lead_stage_changed";

interface ActivityEntry {
  type: ActivityType;
  title: string;
  description?: string;
  user?: string | number;
  client?: string | number;
}

export async function logActivity(
  payload: Payload,
  entry: ActivityEntry,
): Promise<void> {
  await payload.create({
    collection: "activity-log" as any,
    data: entry as any,
  });
}
