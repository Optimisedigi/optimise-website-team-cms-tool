import type { CollectionConfig } from "payload";

export const ActivityLog: CollectionConfig = {
  slug: "activity-log",
  labels: {
    singular: "Activity Log",
    plural: "Activity Log",
  },
  admin: {
    useAsTitle: "title",
    group: "Admin",
    // Not `hidden: true` — Payload's List view throws not-found for hidden
    // collections, which broke the dashboard "See all" link. The nav entry is
    // hidden via CSS in custom.scss instead, keeping the list route reachable.
    defaultColumns: ["type", "title", "user", "client", "createdAt"],
    description: "Automatic feed of team activity",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: () => false,
    delete: ({ req }) => req.user?.role === "admin",
  },
  defaultSort: "-createdAt",
  fields: [
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Blog Published", value: "blog_published" },
        { label: "SEO Audit Completed", value: "seo_audit_completed" },
        { label: "CRO Audit Completed", value: "cro_audit_completed" },
        { label: "Keyword Analysis", value: "keyword_analysis" },
        { label: "Client Added", value: "client_added" },
        { label: "Retainer Changed", value: "retainer_changed" },
        { label: "Proposal Created", value: "proposal_created" },
        { label: "GSC Snapshot", value: "gsc_snapshot" },
        { label: "Time Tracked", value: "time_tracked" },
        { label: "Google Ads Audit Created", value: "google_ads_audit_created" },
        { label: "Google Ads Proposal Created", value: "google_ads_proposal_created" },
        { label: "Link Suggestion Created", value: "link_suggestion_created" },
        { label: "Negative Sweep Completed", value: "negative_sweep_completed" },
        { label: "Negative Sweep Synced", value: "negative_sweep_synced" },
        { label: "Contract Created", value: "contract_created" },
        { label: "Contract Agency Signed", value: "contract_agency_signed" },
        { label: "Contract Sent", value: "contract_sent" },
        { label: "Contract Client Signed", value: "contract_client_signed" },
        { label: "Contract Reminder Sent", value: "contract_reminder_sent" },
        { label: "Contract Reminder Failed", value: "contract_reminder_failed" },
        { label: "Lead Created", value: "lead_created" },
        { label: "Lead Stage Changed", value: "lead_stage_changed" },
        { label: "Template Created", value: "template_created" },
        { label: "Timeline Created", value: "timeline_created" },
        { label: "Process Started", value: "process_started" },
        { label: "Meeting Scheduled", value: "meeting_scheduled" },
        { label: "Meeting Confirmed", value: "meeting_confirmed" },
        { label: "Meeting Accepted", value: "meeting_response_accepted" },
        { label: "Meeting Declined", value: "meeting_response_declined" },
        { label: "AI Visibility Snapshot Created", value: "ai_visibility_snapshot_created" },
        { label: "SERP Displacement Snapshot Created", value: "serp_displacement_snapshot_created" },
        { label: "SERP Displacement Alert Created", value: "serp_displacement_alert_created" },
        { label: "Google Ads Budget Pushed", value: "google_ads_budget_pushed" },
        { label: "Google Ads Anomaly Detected", value: "google_ads_anomaly_detected" },
        { label: "Agent Approval — Approved", value: "agent_approval_approved" },
        { label: "Agent Approval — Rejected", value: "agent_approval_rejected" },
        // Optimate agent step types
        { label: "Agent Tool Call", value: "agent_tool_call" },
        { label: "Agent Reasoning", value: "agent_reasoning" },
        { label: "Agent Final Output", value: "agent_final_output" },
        { label: "Agent Error", value: "agent_error" },
        { label: "Agent Auth Event", value: "agent_auth_event" },
        // Match Type Violation activity types
        { label: "Match Type Violation Sync", value: "match_type_violation_sync" },
        { label: "Match Type Violation Approved", value: "match_type_violation_approved" },
        { label: "Match Type Violation Rejected", value: "match_type_violation_rejected" },
        { label: "Match Type Violation Keyword Added", value: "match_type_violation_keyword_added" },
        { label: "Monthly Negatives Need Review", value: "monthly_negative_needs_review" },
      ],
    },
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "description",
      type: "text",
    },
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      admin: {
        description: "User who triggered this activity",
      },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      admin: {
        description: "Related client",
      },
    },
    // Optimate agent step fields. All optional; populated only on agent-emitted rows.
    {
      name: "agentRunId",
      type: "text",
      index: true,
      admin: { description: "Optimate agents: groups all step rows for one agent run." },
    },
    {
      name: "agentName",
      type: "text",
      index: true,
      admin: { description: "Optimate agents: which agent emitted this step, e.g. optimate-google-ads." },
    },
    {
      name: "step",
      type: "number",
      admin: { description: "Optimate agents: turn number within the run." },
    },
    {
      name: "toolName",
      type: "text",
      admin: { description: "Optimate agents: tool invoked on this step (when type=agent_tool_call)." },
    },
    {
      name: "input",
      type: "json",
      admin: { description: "Optimate agents: tool input arguments." },
    },
    {
      name: "output",
      type: "json",
      admin: { description: "Optimate agents: tool output, or final assistant message." },
    },
    {
      name: "reasoning",
      type: "textarea",
      admin: {
        description:
          "Optimate agents: model reasoning between tool calls. Hidden by default in UI; never rendered to client surfaces.",
      },
    },
    {
      name: "model",
      type: "text",
      admin: { description: "Optimate agents: canonical model name that served this step." },
    },
    {
      name: "source",
      type: "select",
      options: [
        { label: "OAuth", value: "oauth" },
        { label: "API key", value: "api-key" },
        { label: "API key fallback", value: "api-key-fallback" },
      ],
      admin: { description: "Optimate agents: which credential path served the request." },
    },
    {
      name: "durationMs",
      type: "number",
      admin: { description: "Optimate agents: wall-time of the step in milliseconds." },
    },
  ],
};
