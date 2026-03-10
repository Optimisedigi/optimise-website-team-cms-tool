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
    hidden: true,
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
        { label: "Lead Created", value: "lead_created" },
        { label: "Lead Stage Changed", value: "lead_stage_changed" },
        { label: "Template Created", value: "template_created" },
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
  ],
};
