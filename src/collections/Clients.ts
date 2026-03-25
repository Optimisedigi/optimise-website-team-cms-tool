import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import crypto from "crypto";
import { logActivity } from "../lib/activity-log";

function monthsBetween(start: Date, end: Date): number {
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  return Math.max(0, months);
}

const trackRetainerChange: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
  operation,
}) => {
  if (operation !== "update" || !data || !originalDoc) return data;

  const oldAmount = originalDoc.monthlyRetainer ?? 0;
  const newAmount = data.monthlyRetainer ?? 0;

  if (oldAmount === newAmount) return data;

  const historyEntry = {
    amount: newAmount,
    previousAmount: oldAmount,
    effectiveDate: new Date().toISOString(),
    changedBy: req.user?.email || req.user?.name || "system",
  };

  const existing = Array.isArray(originalDoc.retainerHistory)
    ? originalDoc.retainerHistory
    : [];
  data.retainerHistory = [historyEntry, ...existing];

  // Log retainer change activity (fire-and-forget)
  logActivity(req.payload, {
    type: "retainer_changed",
    title: `Retainer changed for ${originalDoc.name || "client"}`,
    description: `$${oldAmount.toLocaleString()} → $${newAmount.toLocaleString()}/mo`,
    user: req.user?.id,
    client: originalDoc.id,
  }).catch(() => {});

  return data;
};

/**
 * Clients Collection
 *
 * Each client represents a website/business you manage.
 * Blog posts are associated with specific clients.
 */
export const Clients: CollectionConfig = {
  slug: "clients",
  admin: {
    useAsTitle: "name",
    group: "Clients",
    description: "Manage client websites",
    defaultColumns: ["name", "monthlyRetainer", "billingSummary", "clientPin", "isActive"],
  },
  hooks: {
    beforeChange: [trackRetainerChange],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "client_added",
            title: `New client: ${doc.name}`,
            description: doc.websiteUrl || "",
            user: req.user?.id,
            client: doc.id,
          }).catch(() => {});
        }
      },
    ],
    afterRead: [
      ({ doc }) => {
        if (doc?.isAgency) return doc;

        const monthlyRetainer = Number(doc?.monthlyRetainer) || 0;
        const historicalRevenue = Number(doc?.historicalRevenue) || 0;
        const clientStartDate = doc?.clientStartDate as string | null;
        const oneOffProjects = Array.isArray(doc?.oneOffProjects) ? doc.oneOffProjects : [];
        const retainerHistory = Array.isArray(doc?.retainerHistory) ? doc.retainerHistory : [];

        // One-off totals
        const oneOffTotal = oneOffProjects.reduce(
          (sum: number, p: any) => sum + (Number(p?.amount) || 0),
          0,
        );

        // Retainer revenue to date
        let retainerRevenue = 0;
        if (monthlyRetainer > 0) {
          const now = new Date();
          if (clientStartDate) {
            const sortedHistory = [...retainerHistory]
              .filter((h: any) => h?.effectiveDate && h?.amount != null)
              .sort(
                (a: any, b: any) =>
                  new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime(),
              );
            const start = new Date(clientStartDate);
            if (sortedHistory.length > 0) {
              let periodStart = start;
              for (const entry of sortedHistory) {
                const changeDate = new Date(entry.effectiveDate);
                if (changeDate > periodStart) {
                  const months = monthsBetween(periodStart, changeDate);
                  retainerRevenue += months * (Number(entry.previousAmount) || 0);
                  periodStart = changeDate;
                }
              }
              retainerRevenue += monthsBetween(periodStart, now) * monthlyRetainer;
            } else {
              retainerRevenue = monthsBetween(start, now) * monthlyRetainer;
            }
          } else {
            retainerRevenue = monthlyRetainer;
          }
        }

        doc.billingSummary = retainerRevenue + oneOffTotal + historicalRevenue;
        return doc;
      },
    ],
  },
  fields: [
    {
      name: "billingSummary",
      label: "Billing Summary",
      type: "number",
      virtual: true,
      admin: {
        components: {
          Field: "./components/ClientBillingSummary",
          Cell: "./components/BillingSummaryCell",
        },
        condition: (data: any) => !data?.isAgency && data?.id,
      },
    },
    {
      name: "agencyBadge",
      type: "ui",
      admin: {
        components: {
          Field: "./components/AgencyBadge",
        },
        condition: (data: any) => !!data?.isAgency,
      },
    },
    {
      type: "tabs",
      tabs: [
        {
          label: "Business",
          fields: [
            {
              name: "name",
              type: "text",
              required: true,
              admin: {
                description: "Client/business name (e.g., 'Acme Corp')",
              },
            },
            {
              name: "slug",
              type: "text",
              required: true,
              unique: true,
              admin: {
                description: "URL-friendly identifier (e.g., 'acme-corp')",
              },
            },
            {
              name: "websiteUrl",
              type: "text",
              admin: {
                description: "Client website URL (e.g., 'https://acmecorp.com')",
              },
            },
            {
              name: "apiKey",
              type: "text",
              admin: {
                description: "API key for this client (auto-generated)",
                readOnly: true,
              },
              hooks: {
                beforeChange: [
                  ({ value, operation }) => {
                    if (operation === "create" && !value) {
                      return `key_${crypto.randomBytes(24).toString("hex")}`;
                    }
                    return value;
                  },
                ],
              },
            },
            {
              name: "isActive",
              type: "checkbox",
              defaultValue: true,
              admin: {
                description: "Enable/disable content publishing for this client",
              },
            },
            {
              name: "isAgency",
              type: "checkbox",
              defaultValue: false,
              admin: {
                position: "sidebar",
                description: "Check if this is the agency itself (hides revenue fields)",
              },
            },
            {
              name: "yearlySalesTarget",
              type: "number",
              min: 0,
              admin: {
                description: "Yearly revenue target ($). Shown as a progress bar on the dashboard.",
                step: 1,
                condition: (data: any) => !!data?.isAgency,
              },
            },
            {
              name: "targetDeadlineDate",
              type: "date",
              admin: {
                description: "Target deadline (defaults to Dec 31 of current year if not set)",
                condition: (data: any) => !!data?.isAgency,
                date: {
                  pickerAppearance: "dayOnly",
                  displayFormat: "d MMM yyyy",
                },
              },
            },
            {
              name: "clientPin",
              type: "text",
              unique: true,
              admin: {
                position: "sidebar",
                description:
                  "4-digit PIN for client hub access (auto-generated)",
              },
              validate: async (value: string | null | undefined, { req, id }: any) => {
                if (!value) return true;
                if (!/^\d{4}$/.test(value))
                  return "PIN must be exactly 4 digits";
                try {
                  const existing = await req.payload.find({
                    collection: "clients",
                    where: {
                      clientPin: { equals: value },
                      ...(id ? { id: { not_equals: id } } : {}),
                    },
                    limit: 1,
                  });
                  if (existing.totalDocs > 0) {
                    return `PIN "${value}" is already in use by another client (${existing.docs[0].name}).`;
                  }
                } catch { /* skip check if payload not available */ }
                return true;
              },
              hooks: {
                beforeChange: [
                  ({ value, operation }) => {
                    if (operation === "create" && !value) {
                      return String(
                        Math.floor(1000 + Math.random() * 9000)
                      );
                    }
                    return value;
                  },
                ],
              },
            },
            {
              name: "websiteType",
              type: "select",
              admin: {
                description:
                  "Who built the website — determines whether GSC alerts are actionable (we fix) or advisory (we recommend)",
              },
              options: [
                { label: "Built by Us", value: "built_by_us" },
                { label: "External CMS / Third Party", value: "external_cms" },
              ],
            },
            {
              name: "externalCms",
              type: "select",
              admin: {
                description: "Which CMS platform is the website built on?",
                condition: (data: any) => data?.websiteType === "external_cms",
              },
              options: [
                { label: "WordPress", value: "wordpress" },
                { label: "Shopify", value: "shopify" },
                { label: "Squarespace", value: "squarespace" },
                { label: "Wix", value: "wix" },
                { label: "Webflow", value: "webflow" },
                { label: "Other", value: "other" },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "contactName",
                  type: "text",
                  admin: {
                    description: "Primary contact name",
                  },
                },
                {
                  name: "contactEmail",
                  type: "email",
                  admin: {
                    description: "Primary contact email",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "hasPhysicalLocations",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Does this business have physical locations?",
                  },
                },
                {
                  name: "numberOfLocations",
                  type: "number",
                  min: 1,
                  admin: {
                    description: "Number of physical locations",
                    condition: (data: any) => data?.hasPhysicalLocations,
                  },
                },
              ],
            },
            {
              name: "googleMapsUrls",
              type: "array",
              maxRows: 10,
              admin: {
                description: "Google Maps listing URLs for GBP analysis",
                condition: (data: any) => data?.hasPhysicalLocations,
              },
              fields: [
                {
                  name: "url",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Google Maps listing URL",
                  },
                },
                {
                  name: "label",
                  type: "text",
                  admin: {
                    description: "Location label (e.g. 'Head Office', 'Sydney Branch')",
                  },
                },
              ],
            },
            {
              name: "conversionGoal",
              type: "select",
              admin: {
                description: "Primary conversion goal",
              },
              options: [
                { label: "Lead Generation", value: "lead generation" },
                { label: "Phone Calls", value: "phone calls" },
                { label: "Form Submissions", value: "form submissions" },
                { label: "E-commerce Sales", value: "e-commerce" },
                { label: "Bookings / Appointments", value: "bookings" },
                { label: "Quote Requests", value: "quote requests" },
                { label: "Email Sign-ups", value: "email sign-ups" },
                { label: "Free Trial Sign-ups", value: "free trial" },
                { label: "Content Downloads", value: "content downloads" },
                { label: "Brand Awareness", value: "brand awareness" },
              ],
            },
            {
              name: "secondaryConversionGoal",
              type: "select",
              admin: {
                description: "Secondary conversion goal",
              },
              options: [
                { label: "Lead Generation", value: "lead generation" },
                { label: "Phone Calls", value: "phone calls" },
                { label: "Form Submissions", value: "form submissions" },
                { label: "E-commerce Sales", value: "e-commerce" },
                { label: "Bookings / Appointments", value: "bookings" },
                { label: "Quote Requests", value: "quote requests" },
                { label: "Email Sign-ups", value: "email sign-ups" },
                { label: "Free Trial Sign-ups", value: "free trial" },
                { label: "Content Downloads", value: "content downloads" },
                { label: "Brand Awareness", value: "brand awareness" },
              ],
            },
            {
              name: "clientStartDate",
              type: "date",
              admin: {
                description: "When this client started working with us",
                condition: (data: any) => !data?.isAgency,
              },
            },
            {
              name: "monthlyRetainer",
              type: "number",
              min: 0,
              admin: {
                description: "Monthly revenue amount ($)",
                step: 1,
                condition: (data: any) => !data?.isAgency,
                components: {
                  Cell: "./components/MonthlyRetainerCell",
                },
              },
            },
            {
              name: "oneOffProjects",
              type: "array",
              admin: {
                description: "One-off projects (website builds, audits, etc.)",
                condition: (data: any) => !data?.isAgency,
              },
              fields: [
                {
                  name: "projectName",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Project name",
                  },
                },
                {
                  name: "amount",
                  type: "number",
                  required: true,
                  min: 0,
                  admin: {
                    description: "Project amount ($)",
                    step: 1,
                  },
                },
                {
                  name: "date",
                  type: "date",
                  required: true,
                  admin: {
                    description: "Project date",
                  },
                },
              ],
            },
            {
              name: "historicalRevenue",
              type: "number",
              min: 0,
              admin: {
                description: "Pre-CMS revenue ($). Added to auto-calculated total for clients who started before the CMS was set up.",
                step: 1,
                condition: (data: any) => !data?.isAgency,
              },
            },
            {
              name: "contract",
              type: "upload",
              relationTo: "media",
              admin: {
                description: "Client contract document (legacy upload)",
                condition: (data: any) => !data?.isAgency,
              },
            },
            {
              name: "signedContractUrl",
              type: "text",
              admin: {
                readOnly: true,
                description: "URL of the signed contract PDF (from e-signature flow)",
                condition: (data: any) => !data?.isAgency,
              },
            },
            {
              name: "signedContract",
              type: "relationship",
              relationTo: "contracts",
              admin: {
                readOnly: true,
                description: "Linked signed contract record",
                condition: (data: any) => !data?.isAgency,
              },
            },
            {
              name: "googleAdsCustomerId",
              type: "text",
              admin: {
                description: "Google Ads customer ID (e.g. 955-493-5739). Client must grant access to the Optimise Digital MCC.",
              },
            },
            {
              name: "negativeKeywordLists",
              type: "join",
              collection: "negative-keyword-lists",
              on: "client",
              admin: {
                description: "Negative keyword lists managed for this client",
              },
            },
            {
              name: "legacyNotes",
              type: "textarea",
              admin: {
                description: "Goals, notes, and context about this client (legacy — use Notes tab for new notes)",
              },
            },
            {
              name: "retainerHistory",
              type: "array",
              admin: {
                readOnly: true,
                description: "Automatic log of revenue changes",
              },
              fields: [
                { name: "amount", type: "number" },
                { name: "previousAmount", type: "number" },
                { name: "effectiveDate", type: "date" },
                { name: "changedBy", type: "text" },
              ],
            },
          ],
        },
        {
          label: "Notes",
          fields: [
            {
              name: "clientNotes",
              type: "array",
              dbName: "client_notes",
              admin: {
                description: "Add timestamped notes about this client — meetings, decisions, updates, etc.",
                initCollapsed: false,
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "category",
                      type: "select",
                      defaultValue: "general",
                      admin: {
                        width: "30%",
                      },
                      options: [
                        { label: "General", value: "general" },
                        { label: "Meeting", value: "meeting" },
                        { label: "Strategy", value: "strategy" },
                        { label: "Issue", value: "issue" },
                        { label: "Win", value: "win" },
                        { label: "Feedback", value: "feedback" },
                        { label: "Internal", value: "internal" },
                      ],
                    },
                    {
                      name: "date",
                      type: "date",
                      required: true,
                      defaultValue: () => new Date().toISOString(),
                      admin: {
                        width: "30%",
                        date: {
                          pickerAppearance: "dayOnly",
                          displayFormat: "d MMM yyyy",
                        },
                      },
                    },
                    {
                      name: "author",
                      type: "text",
                      admin: {
                        width: "40%",
                        description: "Who wrote this note",
                      },
                    },
                  ],
                },
                {
                  name: "content",
                  type: "textarea",
                  required: true,
                  admin: {
                    description: "Note content",
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Account Timeline",
          fields: [
            {
              name: "accountTimeline",
              type: "array",
              dbName: "client_account_timeline",
              admin: {
                description: "Log of significant account milestones — tagging changes, account takeovers, campaign restructures, etc.",
                initCollapsed: false,
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "date",
                      type: "date",
                      required: true,
                      defaultValue: () => new Date().toISOString(),
                      admin: {
                        width: "15%",
                        date: {
                          pickerAppearance: "dayOnly",
                          displayFormat: "d MMM yyyy",
                        },
                      },
                    },
                    {
                      name: "serviceArea",
                      type: "select",
                      defaultValue: "google_ads",
                      admin: {
                        width: "15%",
                      },
                      options: [
                        { label: "Google Ads", value: "google_ads" },
                        { label: "SEO", value: "seo" },
                        { label: "Analytics / Tracking", value: "analytics" },
                        { label: "Website", value: "website" },
                        { label: "Social / Meta", value: "social" },
                        { label: "General", value: "general" },
                      ],
                    },
                    {
                      name: "actionType",
                      type: "select",
                      required: true,
                      admin: {
                        width: "25%",
                      },
                      options: [
                        { label: "Account Takeover", value: "account_takeover" },
                        { label: "Account Access Granted", value: "access_granted" },
                        { label: "Tagging Updated", value: "tagging_updated" },
                        { label: "Conversion Tracking Changed", value: "conversion_tracking_changed" },
                        { label: "GA4 Setup / Migration", value: "ga4_setup" },
                        { label: "GTM Setup / Updated", value: "gtm_updated" },
                        { label: "Campaign Structure Proposed", value: "campaign_structure_proposed" },
                        { label: "Campaign Structure Implemented", value: "campaign_structure_implemented" },
                        { label: "Budget Changed", value: "budget_changed" },
                        { label: "Negative Keyword List Added", value: "negative_keywords_added" },
                        { label: "Bid Strategy Changed", value: "bid_strategy_changed" },
                        { label: "Ad Copy Updated", value: "ad_copy_updated" },
                        { label: "Landing Pages Changed", value: "landing_pages_changed" },
                        { label: "Dashboard Created", value: "dashboard_created" },
                        { label: "Reporting Started", value: "reporting_started" },
                        { label: "Strategy Change", value: "strategy_change" },
                        { label: "Other", value: "other" },
                      ],
                    },
                    {
                      name: "description",
                      type: "text",
                      required: true,
                      admin: {
                        width: "45%",
                        placeholder: "Brief description of what was done",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Processes",
          fields: [
            {
              name: "startProcess",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/StartProcessButton",
                },
                condition: (data: any) => !!data?.id,
              },
            },
            {
              name: "linkedProcesses",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/LinkedProcesses",
                },
                condition: (data: any) => !!data?.id,
              },
            },
          ],
        },
        {
          label: "Analysis",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "businessType",
                  type: "select",
                  admin: {
                    description: "Type of business — used for report weighting and presentation",
                  },
                  options: [
                    { label: "Trades & Home Services", value: "trades" },
                    { label: "Professional Services", value: "services" },
                    { label: "E-commerce / Retail", value: "ecommerce" },
                    { label: "Healthcare", value: "healthcare" },
                    { label: "Hospitality & Food", value: "hospitality" },
                    { label: "Real Estate", value: "realestate" },
                    { label: "Education & Training", value: "education" },
                    { label: "SaaS / Technology", value: "saas" },
                    { label: "Other", value: "other" },
                  ],
                },
                {
                  name: "targetLocation",
                  type: "text",
                  admin: {
                    description: "Primary target location for rankings (e.g., 'Sydney, Australia')",
                  },
                },
              ],
            },
            {
              name: "clientGoals",
              type: "textarea",
              admin: {
                description: "Client objectives — what they want to achieve (shown in report intro)",
              },
            },
            {
              name: "keywords",
              type: "textarea",
              admin: {
                description: "Consolidated keyword list (one per line)",
              },
            },
            {
              name: "tam",
              type: "richText",
              admin: {
                description: "Total Addressable Market data",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "leadConversionRate",
                  type: "number",
                  min: 0,
                  max: 100,
                  admin: {
                    description: "Website visitor → lead conversion rate (%)",
                    step: 0.1,
                  },
                },
                {
                  name: "leadToSaleConversionRate",
                  type: "number",
                  min: 0,
                  max: 100,
                  admin: {
                    description: "Lead → paying client conversion rate (%)",
                    step: 0.1,
                  },
                },
                {
                  name: "averageOrderValue",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Average order / client value ($)",
                    step: 1,
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "annualPurchaseFrequency",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Annual purchase frequency",
                    step: 0.1,
                  },
                },
                {
                  name: "newCustomersLast12Months",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "New customers acquired in the last 12 months",
                    step: 1,
                  },
                },
              ],
            },
            {
              name: "competitors",
              type: "array",
              maxRows: 5,
              admin: {
                description: "Competitor businesses to benchmark against (up to 5)",
              },
              fields: [
                {
                  name: "name",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Competitor business name",
                  },
                },
                {
                  name: "websiteUrl",
                  type: "text",
                  admin: {
                    description: "Competitor website URL",
                  },
                },
                {
                  name: "googleMapsUrl",
                  type: "text",
                  admin: {
                    description: "Google Maps listing URL for GBP analysis",
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Google Ads",
          fields: [
            // ─ Audit Button + Linked Audits ─
            {
              name: "runGoogleAdsAudit",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/RunGoogleAdsAuditFromClientButton",
                },
              },
            },
            {
              name: "googleAdsAudits",
              type: "join",
              collection: "google-ads-audits",
              on: "client",
              admin: {
                description: "Google Ads audits linked to this client",
                defaultColumns: ["businessName", "overallScore", "auditStatus", "createdAt"],
              },
            },

            // ─ Automation Config ─
            {
              name: "gadsAuto",
              type: "group",
              label: "Google Ads Automations",
              admin: {
                description: "Configure Google Ads automations for this client",
              },
              fields: [
                // Dashboard (Quality Score tab)
                {
                  name: "dashboardEnabled",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Enable Google Ads dashboard & monthly quality score snapshots",
                  },
                },
                {
                  name: "viewDashboard",
                  type: "ui",
                  admin: {
                    components: { Field: "./components/ViewGoogleDashboardButton" },
                  },
                },
                // Negative Keyword Sweep
                {
                  name: "negativeSweepEnabled",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Enable weekly negative keyword sweeps",
                  },
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "negativeSweepMode",
                      type: "select",
                      defaultValue: "review_first",
                      options: [
                        { label: "Review first (team approves)", value: "review_first" },
                        { label: "Auto-apply", value: "auto_apply" },
                      ],
                      admin: {
                        description: "How to handle candidates",
                        width: "50%",
                        condition: (data: any) => data?.gadsAuto?.negativeSweepEnabled,
                      },
                    },
                    {
                      name: "negativeSweepWeekday",
                      type: "select",
                      defaultValue: "monday",
                      options: [
                        { label: "Monday", value: "monday" },
                        { label: "Tuesday", value: "tuesday" },
                        { label: "Wednesday", value: "wednesday" },
                        { label: "Thursday", value: "thursday" },
                        { label: "Friday", value: "friday" },
                        { label: "Saturday", value: "saturday" },
                        { label: "Sunday", value: "sunday" },
                      ],
                      admin: {
                        description: "Day to run the sweep",
                        width: "50%",
                        condition: (data: any) => data?.gadsAuto?.negativeSweepEnabled,
                      },
                    },
                  ],
                },
                {
                  name: "negativeSweepMinSpendThreshold",
                  type: "number",
                  defaultValue: 5,
                  min: 0,
                  admin: {
                    description: "Minimum spend ($) on a search term to flag it as a candidate",
                    step: 1,
                    condition: (data: any) => data?.gadsAuto?.negativeSweepEnabled,
                  },
                },
                {
                  name: "negativeSweepExcludeTerms",
                  type: "textarea",
                  admin: {
                    description: "Terms to never suggest as negatives, in addition to brand terms (one per line)",
                    condition: (data: any) => data?.gadsAuto?.negativeSweepEnabled,
                  },
                },
                {
                  name: "negativeSweepSheetUrl",
                  type: "text",
                  admin: {
                    description: "Google Sheet URL for this client's negative keywords (must have a neg_kws_lists tab)",
                    condition: (data: any) => data?.gadsAuto?.negativeSweepEnabled,
                  },
                },
                {
                  name: "runNegativeSweep",
                  type: "ui",
                  admin: {
                    components: { Field: "./components/RunNegativeSweepButton" },
                  },
                },

                // Re-audit
                {
                  name: "reauditEnabled",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Enable scheduled monthly re-audits",
                  },
                },
                {
                  name: "reauditDayOfMonth",
                  type: "number",
                  defaultValue: 1,
                  min: 1,
                  max: 28,
                  admin: {
                    description: "Day of month to run (1-28)",
                    step: 1,
                    condition: (data: any) => data?.gadsAuto?.reauditEnabled,
                  },
                },

                // Performance Report
                {
                  name: "performanceReportEnabled",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Enable monthly performance reports",
                  },
                },
                {
                  name: "performanceReportDayOfMonth",
                  type: "number",
                  defaultValue: 3,
                  min: 1,
                  max: 28,
                  admin: {
                    description: "Day of month to generate (default 3rd, lets data settle)",
                    step: 1,
                    condition: (data: any) => data?.gadsAuto?.performanceReportEnabled,
                  },
                },
                {
                  name: "performanceReportRecipientEmails",
                  type: "array",
                  dbName: "gads_report_emails",
                  maxRows: 10,
                  admin: {
                    description: "Email recipients for the report (falls back to team email if empty)",
                    condition: (data: any) => data?.gadsAuto?.performanceReportEnabled,
                  },
                  fields: [
                    {
                      name: "email",
                      type: "email",
                      required: true,
                    },
                  ],
                },
                {
                  name: "performanceReportIncludeInClientHub",
                  type: "checkbox",
                  defaultValue: true,
                  admin: {
                    description: "Make report data available via the client hub API",
                    condition: (data: any) => data?.gadsAuto?.performanceReportEnabled,
                  },
                },
                {
                  name: "runPerformanceReport",
                  type: "ui",
                  admin: {
                    components: { Field: "./components/RunPerformanceReportButton" },
                  },
                },

                // ─ OptiMate Autonomous Monitoring ─
                {
                  name: "optimateEnabled",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Enable OptiMate autonomous monitoring (runs twice daily)",
                  },
                },
                {
                  name: "optimateMode",
                  type: "select",
                  defaultValue: "review_first",
                  options: [
                    { label: "Review First", value: "review_first" },
                    { label: "Auto Apply", value: "auto_apply" },
                  ],
                  admin: {
                    description: "review_first: all recs go to team. auto_apply: safe actions (pause overbudget) applied automatically.",
                    condition: (data: any) => data?.gadsAuto?.optimateEnabled,
                  },
                },
                {
                  name: "optimateBudgetThreshold",
                  type: "number",
                  defaultValue: 130,
                  admin: {
                    description: "Flag campaigns pacing above this % of monthly budget",
                    condition: (data: any) => data?.gadsAuto?.optimateEnabled,
                  },
                },
                {
                  name: "optimateCtrDropThreshold",
                  type: "number",
                  defaultValue: 20,
                  admin: {
                    description: "Alert on WoW CTR drops exceeding this % (e.g. 20 = 20% drop)",
                    condition: (data: any) => data?.gadsAuto?.optimateEnabled,
                  },
                },
                {
                  name: "optimateCpaSpikeThreshold",
                  type: "number",
                  defaultValue: 30,
                  admin: {
                    description: "Alert on WoW CPA spikes exceeding this % (e.g. 30 = 30% spike)",
                    condition: (data: any) => data?.gadsAuto?.optimateEnabled,
                  },
                },

                // ─ Weekly Performance Report ─
                {
                  name: "weeklyReport",
                  type: "group",
                  label: "Weekly Report",
                  fields: [
                    {
                      name: "weeklyReportEnabled",
                      type: "checkbox",
                      defaultValue: false,
                      label: "Enable Weekly Reports",
                    },
                    {
                      name: "weeklyReportTemplate",
                      type: "select",
                      defaultValue: "lead_gen",
                      options: [
                        { label: "Lead Gen", value: "lead_gen" },
                        { label: "Ecommerce", value: "ecommerce" },
                        { label: "Brand Awareness", value: "brand_awareness" },
                      ],
                      admin: {
                        description: "Controls which KPIs appear in the report email",
                        condition: (data: any) => data?.gadsAuto?.weeklyReport?.weeklyReportEnabled,
                      },
                    },
                    {
                      name: "weeklyReportSendDay",
                      type: "select",
                      defaultValue: "monday",
                      options: [
                        { label: "Monday", value: "monday" },
                        { label: "Tuesday", value: "tuesday" },
                        { label: "Wednesday", value: "wednesday" },
                        { label: "Thursday", value: "thursday" },
                        { label: "Friday", value: "friday" },
                        { label: "Saturday", value: "saturday" },
                        { label: "Sunday", value: "sunday" },
                      ],
                      admin: {
                        description: "Day of week to send the report (covers previous Mon-Sun)",
                        condition: (data: any) => data?.gadsAuto?.weeklyReport?.weeklyReportEnabled,
                      },
                    },
                    {
                      name: "weeklyReportRecipientEmails",
                      type: "array",
                      dbName: "gads_weekly_emails",
                      admin: {
                        description: "Email addresses to receive weekly reports",
                        condition: (data: any) => data?.gadsAuto?.weeklyReport?.weeklyReportEnabled,
                      },
                      fields: [
                        {
                          name: "email",
                          type: "email",
                          required: true,
                        },
                      ],
                    },
                  ],
                },
              ],
            },

            // ─ Score Trajectory (read-only, auto-populated) ─
            {
              name: "gadsTrajectory",
              type: "group",
              label: "Score Trajectory",
              admin: {
                readOnly: true,
                description: "Computed on each re-audit",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "latestScore",
                      type: "number",
                      admin: { readOnly: true, width: "25%" },
                    },
                    {
                      name: "previousScore",
                      type: "number",
                      admin: { readOnly: true, width: "25%" },
                    },
                    {
                      name: "scoreChange",
                      type: "number",
                      admin: { readOnly: true, width: "25%" },
                    },
                    {
                      name: "trend",
                      type: "select",
                      options: [
                        { label: "Improving", value: "improving" },
                        { label: "Stable", value: "stable" },
                        { label: "Declining", value: "declining" },
                      ],
                      admin: { readOnly: true, width: "25%" },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Blog Settings",
          fields: [
            {
              name: "blogCategories",
              type: "textarea",
              admin: {
                description: "Blog categories for this client (one per line)",
              },
            },
            {
              name: "blogTags",
              type: "textarea",
              admin: {
                description: "Available tags for this client (one per line)",
              },
            },
            {
              name: "servicePages",
              type: "textarea",
              admin: {
                description: "Service or product/category pages for this client (one per line). Used to auto-populate the blog prompt requirements.",
              },
            },
          ],
        },
        {
          label: "Blog Posts",
          fields: [
            {
              name: "clientBlogPosts",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ClientBlogPostsList",
                },
              },
            },
          ],
        },
        {
          label: "Authors",
          fields: [
            {
              name: "authors",
              type: "array",
              maxRows: 10,
              admin: {
                description: "Author profiles for this client (up to 10)",
              },
              fields: [
                {
                  name: "name",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Author's display name",
                  },
                },
                {
                  name: "jobTitle",
                  type: "text",
                  admin: {
                    description: "Author's job title (e.g., 'Senior SEO Strategist')",
                  },
                },
                {
                  name: "blurb",
                  type: "textarea",
                  admin: {
                    description: "Short bio or description of the author",
                  },
                },
                {
                  name: "image",
                  type: "upload",
                  relationTo: "media",
                  admin: {
                    description: "Author's profile photo",
                  },
                },
                {
                  name: "expertiseTags",
                  type: "array",
                  admin: {
                    description: "Tags highlighting this author's areas of expertise",
                  },
                  fields: [
                    {
                      name: "tag",
                      type: "text",
                      required: true,
                    },
                  ],
                },
                {
                  name: "socialLinks",
                  type: "array",
                  maxRows: 6,
                  admin: {
                    description: "Social media and website links",
                  },
                  fields: [
                    {
                      name: "platform",
                      type: "select",
                      required: true,
                      options: [
                        { label: "Website", value: "website" },
                        { label: "LinkedIn", value: "linkedin" },
                        { label: "Twitter / X", value: "twitter" },
                        { label: "Facebook", value: "facebook" },
                        { label: "Instagram", value: "instagram" },
                        { label: "YouTube", value: "youtube" },
                      ],
                    },
                    {
                      name: "url",
                      type: "text",
                      required: true,
                      admin: {
                        description: "Full URL (e.g., 'https://linkedin.com/in/johndoe')",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Tracking",
          fields: [
            // ─ Check Tag Setup Button ─
            {
              name: "checkTagSetup",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/CheckTagSetupButton",
                },
              },
            },
            {
              name: "ga4MeasurementId",
              type: "text",
              admin: {
                description: "GA4 Measurement ID (e.g., G-XXXXXXXXXX)",
                placeholder: "G-",
              },
              validate: (value: string | null | undefined) => {
                if (!value) return true;
                if (!/^G-[A-Z0-9]+$/i.test(value)) {
                  return "Must be a valid GA4 Measurement ID (e.g., G-ABC123DEF4)";
                }
                return true;
              },
            },
            {
              name: "gtmContainerId",
              type: "text",
              admin: {
                description: "GTM Container ID (e.g., GTM-XXXXXXX)",
                placeholder: "GTM-",
              },
              validate: (value: string | null | undefined) => {
                if (!value) return true;
                if (!/^GTM-[A-Z0-9]+$/i.test(value)) {
                  return "Must be a valid GTM Container ID (e.g., GTM-ABC123D)";
                }
                return true;
              },
            },
            {
              name: "expectedEvents",
              type: "textarea",
              admin: {
                description:
                  "Expected GA4 events to check for (one per line, e.g., purchase, add_to_cart, generate_lead)",
              },
            },
            // ─ Linked Audits ─
            {
              name: "tagSetupAudits",
              type: "join",
              collection: "tag-setup-audits",
              on: "client",
              admin: {
                description: "Tag setup audit history for this client",
                defaultColumns: ["url", "status", "createdAt"],
              },
            },
          ],
        },
        {
          label: "Google Analytics",
          fields: [
            {
              name: "ga4Connected",
              type: "checkbox",
              defaultValue: false,
              admin: {
                readOnly: true,
                description: "Whether Google Analytics 4 is connected via OAuth",
              },
            },
            {
              name: "ga4PropertyId",
              type: "text",
              admin: {
                description: "The GA4 property ID (numeric, e.g. 202886563). Set this before connecting OAuth.",
              },
            },
            {
              name: "ga4AccessToken",
              type: "text",
              admin: { hidden: true },
            },
            {
              name: "ga4RefreshToken",
              type: "text",
              admin: { hidden: true },
            },
            {
              name: "ga4TokenExpiry",
              type: "date",
              admin: { hidden: true },
            },
          ],
        },
        {
          label: "Search Console",
          fields: [
            {
              name: "gscConnected",
              type: "checkbox",
              defaultValue: false,
              admin: {
                readOnly: true,
                description: "Whether Google Search Console is connected",
              },
            },
            {
              name: "gscPropertyUrl",
              type: "text",
              admin: {
                readOnly: true,
                description: "The connected GSC property URL",
              },
            },
            {
              name: "gscAccessToken",
              type: "text",
              admin: {
                disabled: true,
                hidden: true,
              },
            },
            {
              name: "gscRefreshToken",
              type: "text",
              admin: {
                disabled: true,
                hidden: true,
              },
            },
            {
              name: "gscTokenExpiry",
              type: "date",
              admin: {
                disabled: true,
                hidden: true,
              },
            },
            {
              name: "brandKeywords",
              type: "textarea",
              admin: {
                description:
                  "Brand terms to filter out from generic query analysis (one per line)",
              },
            },
            {
              name: "gscLastSync",
              type: "date",
              admin: {
                readOnly: true,
                description: "Last successful GSC data sync",
              },
            },
            {
              name: "latestGscSnapshot",
              type: "relationship",
              relationTo: "gsc-snapshots",
              admin: {
                readOnly: true,
                description: "Most recent GSC data snapshot",
              },
            },
          ],
        },
      ],
    },
  ],
};
