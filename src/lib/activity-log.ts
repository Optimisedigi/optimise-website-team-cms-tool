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
  | "contract_reminder_sent"
  | "contract_reminder_failed"
  | "lead_created"
  | "lead_stage_changed"
  | "tag_audit_completed"
  | "template_created"
  | "process_started"
  | "timeline_created"
  | "process_step_completed"
  | "meeting_scheduled"
  | "meeting_confirmed"
  | "ai_visibility_snapshot_created"
  | "serp_displacement_snapshot_created"
  | "serp_displacement_alert_created"
  | "invoice_statements_swept"
  | "invoice_statements_sweep_aborted"
  | "invoice_statement_approved"
  | "invoice_statement_rejected"
  | "invoice_statement_send_failed"
  | "invoice_statement_cap_tripped"
  | "invoice_statement_cooldown_override"
  | "google_ads_budget_pushed"
  | "google_ads_budget_recommendations"
  | "agent_approval_approved"
  | "agent_approval_rejected"
  | "match_type_violation_sync"
  | "match_type_violation_approved"
  | "match_type_violation_rejected"
  | "consolidation_approved"
  | "consolidation_rejected"
  | "google_ads_anomaly_detected";

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
    overrideAccess: true,
  });
}
