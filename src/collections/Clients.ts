import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import crypto from "crypto";
import { logActivity } from "../lib/activity-log";
import {
  historicalRevenueTotal,
  retainerRevenueYTD,
  revenueShareFactor,
} from "../lib/client-revenue";
import {
  canAccess,
  canAccessAnyOrApiKey,
  adminOnlyDelete,
  hideUnlessFeature,
  conditionRequiresFeature,
  sensitiveFieldAccess,
} from "../lib/access";
import { hasValidApiKey } from "./api-key-access";

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
 * Extract the deck-slug segment from a full deck URL.
 * Accepts forms like:
 *   https://cms.optimisedigital.online/partners/acme/google-ads-audit/
 *   https://cms.optimisedigital.online/partners/acme/google-ads-audit#tldr
 *   /partners/acme/google-ads-audit/
 *   google-ads-audit  (used as-is)
 * Returns the second path segment after `/partners/`, or the input itself
 * if no `/partners/` segment is present.
 */
function extractDeckSlugFromUrl(deckUrl: string): string {
  const trimmed = deckUrl.trim();
  if (!trimmed) return "";
  try {
    const href = trimmed.startsWith("http")
      ? trimmed
      : `https://example.com${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
    const { pathname } = new URL(href);
    const parts = pathname
      .replace(/^\/partners\//, "")
      .split("/")
      .filter(Boolean);
    if (parts.length >= 2) return parts[1];
  } catch {
    // fall through
  }
  // No `/partners/<client>/<deck>` shape — strip any hash/trailing slash and return.
  return trimmed.replace(/[#?].*$/, "").replace(/\/+$/, "");
}

const derivePresentationDeckSlugs: CollectionBeforeChangeHook = ({ data }) => {
  if (!data || !Array.isArray(data.presentations)) return data;
  data.presentations = data.presentations.map(
    (p: { deckUrl?: string | null; deckSlug?: string | null } & Record<string, unknown>) => {
      const url = typeof p.deckUrl === "string" ? p.deckUrl : "";
      const derived = extractDeckSlugFromUrl(url);
      // Guarantee a non-empty deckSlug. The DB column is now nullable (see
      // 20260524_120000_make_presentations_deck_slug_nullable), but legacy
      // schemas that haven't been migrated yet still enforce NOT NULL — so
      // emit a `pending-<timestamp>` placeholder when nothing usable is
      // available rather than letting an empty string reach the insert.
      const slug =
        derived || p.deckSlug || `pending-${Date.now().toString(36)}`;
      return { ...p, deckSlug: slug };
    },
  );
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
    defaultColumns: ["name", "slug", "websiteUrl", "isActive"],
    hidden: hideUnlessFeature("clients"),
  },
  access: {
    // Read is allowed for both full `clients` users and `clients-basic`
    // users (who get auto-granted read so relationship pickers can render
    // "Acme Corp" instead of "Untitled — ID: 1"). Field-level access on
    // sensitive fields below restricts what `clients-basic` users can
    // actually see.
    read: canAccessAnyOrApiKey(hasValidApiKey, "clients", "clients-basic"),
    create: canAccess("clients"),
    update: canAccess("clients"),
    delete: adminOnlyDelete,
  },
  hooks: {
    beforeChange: [trackRetainerChange, derivePresentationDeckSlugs],
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
      // Flush the dashboard caches when googleAdsCustomerId changes.
      // Spend / waste numbers are tied to a specific Google Ads customer ID —
      // if the client switches accounts (rare but possible) every cached row
      // is suddenly wrong. Flushing forces the next dashboard load (or the
      // next prewarm cron run) to refetch.
      async ({ doc, previousDoc, operation, req }) => {
        if (operation !== "update") return;
        const prevId = previousDoc?.googleAdsCustomerId || "";
        const nextId = doc?.googleAdsCustomerId || "";
        if (prevId === nextId) return;
        try {
          await req.payload.delete({
            collection: "negative-keyword-avoided-spend-cache",
            where: { client: { equals: doc.id } },
            overrideAccess: true,
          });
        } catch (err) {
          req.payload.logger?.warn?.(`[Clients] avoided-spend cache flush failed: ${err}`);
        }
        try {
          await req.payload.delete({
            collection: "negative-keyword-monthly-waste-relevancy-cache",
            where: { client: { equals: doc.id } },
            overrideAccess: true,
          });
        } catch (err) {
          req.payload.logger?.warn?.(`[Clients] waste-relevancy cache flush failed: ${err}`);
        }
      },
      // Wipe the per-month waste/relevancy cache whenever the client's
      // brand keywords change, so the Overview tab's brand/generic split
      // re-derives from the new keyword set on the next dashboard load.
      async ({ doc, previousDoc, operation, req }) => {
        if (operation !== "update") return;
        const prev = String(previousDoc?.brandKeywords || "").trim();
        const next = String(doc?.brandKeywords || "").trim();
        if (prev === next) return;
        try {
          await req.payload.delete({
            collection: "negative-keyword-monthly-waste-relevancy-cache",
            where: { client: { equals: doc.id } },
            overrideAccess: true,
          });
        } catch (err) {
          req.payload.logger?.warn?.(`[Clients] waste-relevancy brand cache flush failed: ${err}`);
        }
      },
    ],
    afterRead: [
      ({ doc }) => {
        if (doc?.isAgency) return doc;

        const historicalRevenue = historicalRevenueTotal(
          Array.isArray(doc?.historicalRevenueByYear) ? doc.historicalRevenueByYear : [],
        );
        const oneOffProjects = Array.isArray(doc?.oneOffProjects) ? doc.oneOffProjects : [];
        const referralCommissions = Array.isArray(doc?.referralCommissions)
          ? doc.referralCommissions
          : [];
        const retainerHistory = Array.isArray(doc?.retainerHistory) ? doc.retainerHistory : [];

        const now = new Date();
        const oneOffTotal = oneOffProjects.reduce(
          (sum: number, p: any) => sum + (Number(p?.amount) || 0),
          0,
        );
        const retainerRevenue = retainerRevenueYTD(
          {
            monthlyRetainer: Number(doc?.monthlyRetainer) || 0,
            setupFee: Number(doc?.setupFee) || 0,
            clientStartDate: doc?.clientStartDate as string | null,
            retainerHistory,
            referralCommissions,
            oneOffProjects,
          },
          now,
        );

        // Apply revenue share — e.g. 50% partner split. Defaults to 100%
        // when the field is unset, so existing clients are unaffected.
        const share = revenueShareFactor(doc?.revenueSharePercent as number | null | undefined);
        doc.billingSummary = (retainerRevenue + oneOffTotal + historicalRevenue) * share;
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
      access: sensitiveFieldAccess("clients"),
      admin: {
        components: {
          Field: "./components/ClientBillingSummary",
          Cell: "./components/BillingSummaryCell",
        },
        condition: conditionRequiresFeature(
          "clients",
          (data: any) => !data?.isAgency && data?.id,
        ),
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
      name: "_defaultTab",
      type: "ui",
      admin: {
        components: {
          Field: "./components/ClientDefaultTab",
        },
      },
    },
    {
      type: "tabs",
      tabs: [
        {
          label: "Business",
          fields: [
            // ── Identity row (3-col) ──────────────────────────────
            // Most-used fields kept at the top so the team can scan a client
            // record without scrolling. Layout-only — the field bodies are
            // identical to the previous full-width declarations.
            {
              type: "row",
              fields: [
                {
                  name: "name",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Client/business name (e.g., 'Acme Corp')",
                    width: "33%",
                  },
                },
                {
                  name: "tradingName",
                  type: "text",
                  admin: {
                    description: "Trading / operating name if different from the legal entity name (e.g., 'Acme Corp' when the legal name is 'Acme Corp Pty Ltd'). Auto-populated from signed contracts.",
                    width: "33%",
                  },
                },
                {
                  name: "slug",
                  type: "text",
                  required: true,
                  unique: true,
                  admin: {
                    description: "URL-friendly identifier (e.g., 'acme-corp')",
                    width: "33%",
                  },
                },
                {
                  name: "websiteUrl",
                  type: "text",
                  admin: {
                    description: "Client website URL (e.g., 'https://acmecorp.com')",
                    width: "34%",
                  },
                },
              ],
            },
            // isAgency stays on the sidebar — it's a meta toggle that hides
            // sections of this tab. apiKey moved into the Advanced section.
            {
              name: "isAgency",
              type: "checkbox",
              defaultValue: false,
              admin: {
                position: "sidebar",
                description: "Check if this is the agency itself (hides revenue fields)",
              },
            },
            // ── Site identity row (3-col) ─────────────────────────────
            // clientPin moved off the sidebar into the body per the request
            // to put PIN + websiteType + externalCms on one row.
            {
              type: "row",
              fields: [
                {
                  name: "clientPin",
                  type: "text",
                  unique: true,
                  admin: {
                    description:
                      "4-digit PIN for client hub access (auto-generated)",
                    width: "33%",
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
                      "Used by the tag setup checker to determine if issues are auto-fixable (built by us) or advisory-only (external).",
                    width: "33%",
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
                    description: "Which CMS platform is the website built on? Used by the tag setup checker to generate platform-specific fix instructions.",
                    condition: (data: any) => data?.websiteType === "external_cms",
                    width: "34%",
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
              ],
            },
            // ── Toggles row ────────────────────────────────────────
            // Booleans grouped together rather than stacking vertically.
            // numberOfLocations follows below it (conditional, so the row
            // doesn't shift width when locations is off).
            {
              type: "row",
              fields: [
                {
                  name: "isActive",
                  type: "checkbox",
                  defaultValue: true,
                  admin: {
                    description: "Enable/disable content publishing for this client",
                    width: "33%",
                  },
                },
                {
                  name: "hasPhysicalLocations",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Does this business have physical locations?",
                    width: "33%",
                  },
                },
                {
                  name: "numberOfLocations",
                  type: "number",
                  min: 1,
                  admin: {
                    description: "Number of physical locations",
                    condition: (data: any) => data?.hasPhysicalLocations,
                    width: "34%",
                  },
                },
              ],
            },
            // ══ Details collapsible ═════════════════════════════════
            // Contact info, account managers, locations, conversion goals —
            // all in one scrollable section, expanded by default.
            {
              type: "collapsible",
              label: "Details",
              admin: { initCollapsed: false },
              fields: [
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
              name: "additionalContacts",
              type: "array",
              admin: {
                description:
                  "Secondary client-side contacts (e.g. marketing director, owner). Internal team members go in Account Managers below.",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "name",
                      type: "text",
                      required: true,
                      admin: { description: "Contact name" },
                    },
                    {
                      name: "email",
                      type: "email",
                      required: true,
                      admin: { description: "Contact email" },
                    },
                  ],
                },
                {
                  name: "jobTitle",
                  type: "text",
                  admin: {
                    description: "e.g. Marketing Director, Owner",
                  },
                },
                {
                  name: "responsibilities",
                  type: "textarea",
                  admin: {
                    description:
                      "What this contact owns, when to loop them in — free text.",
                  },
                },
              ],
            },
            {
              name: "accountManagers",
              type: "array",
              admin: {
                description: "Team members managing this client. They receive notifications for ad copy approvals, audits, etc.",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "name",
                      type: "text",
                      required: true,
                      admin: { description: "Account manager name" },
                    },
                    {
                      name: "email",
                      type: "email",
                      required: true,
                      admin: { description: "Account manager email" },
                    },
                  ],
                },
              ],
            },
            {
              name: "googleAdsCustomerId",
              type: "text",
              admin: {
                description: "Google Ads customer ID (e.g. 955-493-5739). Client must grant access to the Optimise Digital MCC.",
              },
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
            // ── Conversion goals row (2-col) ────────────────────────────
            {
              type: "row",
              fields: [
                {
                  name: "conversionGoal",
                  type: "select",
                  admin: {
                    description: "Primary conversion goal. Carried over from proposal. Shown on client reports.",
                    width: "50%",
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
                    width: "50%",
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
              ],
            },
              ],
            },
            // ══ Acquisition collapsible ══════════════════════════════════
            // Where did this client come from, and who referred them?
            // `referredBy` is always recorded for word-of-mouth referrals
            // — even when no commission is paid (see referralCommissions
            // below for the formal commission rows).
            {
              type: "collapsible",
              label: "Acquisition",
              admin: { initCollapsed: false },
              fields: [
            {
              type: "row",
              fields: [
                {
                  name: "acquisitionChannel",
                  type: "select",
                  access: sensitiveFieldAccess("clients"),
                  admin: {
                    description: "How this client was acquired",
                    width: "50%",
                    condition: conditionRequiresFeature(
                      "clients",
                      (data: any) => !data?.isAgency,
                    ),
                  },
                  options: [
                    // Online channels
                    { label: "Organic Search", value: "organic_search" },
                    { label: "Paid Search (Google Ads)", value: "paid_search" },
                    { label: "Paid Social (Meta Ads)", value: "paid_social" },
                    { label: "Organic Social", value: "organic_social" },
                    { label: "Website (Other)", value: "website_other" },
                    // Offline / manual
                    { label: "Referral", value: "referral" },
                    { label: "Referral Partner", value: "referral_partner" },
                    { label: "BNI Referral", value: "bni_referral" },
                    { label: "Cold Outreach", value: "cold_outreach" },
                  ],
                },
                {
                  name: "acquisitionDetail",
                  type: "text",
                  access: sensitiveFieldAccess("clients"),
                  admin: {
                    description:
                      "Extra detail (e.g. ad campaign name, BNI chapter)",
                    width: "50%",
                    condition: conditionRequiresFeature(
                      "clients",
                      (data: any) => !data?.isAgency,
                    ),
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "referredBy",
                  type: "text",
                  access: sensitiveFieldAccess("clients"),
                  admin: {
                    description:
                      "Person or business who referred this client (record even for free word-of-mouth referrals)",
                    width: "50%",
                    condition: conditionRequiresFeature(
                      "clients",
                      (data: any) => !data?.isAgency,
                    ),
                  },
                },
                {
                  name: "referredByContact",
                  type: "text",
                  access: sensitiveFieldAccess("clients"),
                  admin: {
                    description: "Optional contact for the referrer (email/phone)",
                    width: "50%",
                    condition: conditionRequiresFeature(
                      "clients",
                      (data: any) => !data?.isAgency,
                    ),
                  },
                },
              ],
            },
              ],
            },
            // ══ Billing collapsible ════════════════════════════════════
            // Revenue, retainer, projects, historical, contracts.
            {
              type: "collapsible",
              label: "Billing",
              admin: { initCollapsed: false },
              fields: [
            {
              name: "clientStartDate",
              type: "date",
              access: sensitiveFieldAccess("clients"),
              admin: {
                description: "When this client started working with us",
                condition: conditionRequiresFeature(
                  "clients",
                  (data: any) => !data?.isAgency,
                ),
              },
            },
            {
              name: "monthlyRetainer",
              type: "number",
              min: 0,
              access: sensitiveFieldAccess("clients"),
              admin: {
                description: "Monthly revenue amount ($)",
                step: 1,
                condition: conditionRequiresFeature(
                  "clients",
                  (data: any) => !data?.isAgency,
                ),
                components: {
                  Cell: "./components/MonthlyRetainerCell",
                },
              },
            },
            {
              name: "setupFee",
              type: "number",
              min: 0,
              access: sensitiveFieldAccess("clients"),
              admin: {
                description:
                  "One-time setup fee ($). Counts toward Retainer Revenue YTD in the calendar year of clientStartDate.",
                step: 1,
                condition: conditionRequiresFeature(
                  "clients",
                  (data: any) => !data?.isAgency,
                ),
              },
            },
            {
              name: "revenueSharePercent",
              type: "number",
              defaultValue: 100,
              min: 1,
              max: 100,
              access: sensitiveFieldAccess("clients"),
              admin: {
                description:
                  "Agency's share of this client's revenue, in percent. Use 50 if you split this client 50/50 with a partner. Contract amounts stay unchanged; every revenue figure (Retainer YTD, One-Off YTD, Billing Summary, Historical) is multiplied by this percentage. Defaults to 100.",
                step: 1,
                condition: conditionRequiresFeature(
                  "clients",
                  (data: any) => !data?.isAgency,
                ),
              },
            },
            {
              name: "yearlyTargets",
              type: "array",
              dbName: "clients_yearly_targets",
              access: sensitiveFieldAccess("clients"),
              admin: {
                description:
                  "Yearly sales targets by calendar year. For the agency client, the row matching the current year drives the Yearly Sales Target progress bar on the dashboard. For ordinary clients this is a tracking number only.",
                initCollapsed: true,
              },
              validate: ((value: unknown) => {
                if (!Array.isArray(value)) return true;
                const seen = new Set<number>();
                for (let i = 0; i < value.length; i++) {
                  const row = value[i] as Record<string, unknown> | null;
                  if (!row) continue;
                  const year = Number(row.year);
                  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
                    return `Row ${i + 1}: Year must be between 2000 and 2100.`;
                  }
                  if (seen.has(year)) {
                    return `Row ${i + 1}: Year ${year} appears more than once.`;
                  }
                  seen.add(year);
                }
                return true;
              }) as any,
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "year",
                      type: "number",
                      required: true,
                      min: 2000,
                      max: 2100,
                      admin: {
                        description: "Calendar year (e.g. 2026)",
                        step: 1,
                        width: "40%",
                      },
                    },
                    {
                      name: "target",
                      type: "number",
                      required: true,
                      min: 0,
                      admin: {
                        description: "Sales target for that year ($)",
                        step: 1,
                        width: "60%",
                      },
                    },
                  ],
                },
              ],
            },
            {
              name: "oneOffProjects",
              type: "array",
              access: sensitiveFieldAccess("clients"),
              admin: {
                description: "One-off projects (website builds, audits, etc.)",
                condition: conditionRequiresFeature(
                  "clients",
                  (data: any) => !data?.isAgency,
                ),
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "projectName",
                      type: "text",
                      required: true,
                      admin: {
                        description: "Project name",
                        width: "40%",
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
                        width: "30%",
                      },
                    },
                    {
                      name: "date",
                      type: "date",
                      required: true,
                      admin: {
                        description: "Project date",
                        width: "30%",
                      },
                    },
                  ],
                },
                {
                  name: "countTowardsRetainer",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description:
                      "Toggle ON if this fee is part of the managing retainer (e.g. setup, custom build accompanying retainer). Counts toward Retainer YTD instead of One-Off YTD.",
                  },
                },
              ],
            },
            {
              name: "referralCommissions",
              type: "array",
              dbName: "clients_referral_commissions",
              access: sensitiveFieldAccess("clients"),
              admin: {
                description:
                  "People we pay a commission to for this client. Monthly commissions are deducted from the retainer in all revenue calculations.",
                condition: conditionRequiresFeature(
                  "clients",
                  (data: any) => !data?.isAgency,
                ),
                initCollapsed: true,
              },
              validate: ((value: unknown) => {
                if (!Array.isArray(value)) return true;
                for (let i = 0; i < value.length; i++) {
                  const row = value[i] as Record<string, unknown> | null;
                  if (!row) continue;
                  if (row.frequency === "monthly" && !row.endDate) {
                    return `Row ${i + 1}: End date is required for monthly commissions.`;
                  }
                }
                return true;
              }) as any,
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "payeeName",
                      type: "text",
                      required: true,
                      admin: { description: "Who we pay", width: "50%" },
                    },
                    {
                      name: "payeeContact",
                      type: "text",
                      admin: {
                        description: "Email or phone (internal reference)",
                        width: "50%",
                      },
                    },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "frequency",
                      type: "select",
                      required: true,
                      defaultValue: "monthly",
                      options: [
                        { label: "Monthly (ongoing)", value: "monthly" },
                        { label: "One-off", value: "one_off" },
                      ],
                      admin: { width: "33%" },
                    },
                    {
                      name: "commissionType",
                      type: "select",
                      defaultValue: "percentage",
                      options: [
                        { label: "% of retainer", value: "percentage" },
                        { label: "Fixed $", value: "fixed" },
                      ],
                      admin: {
                        width: "33%",
                        description: "Only used when frequency is monthly",
                        condition: (_data: any, siblingData: any) =>
                          siblingData?.frequency === "monthly",
                      },
                    },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "percentage",
                      type: "number",
                      min: 0,
                      max: 100,
                      admin: {
                        description: "e.g. 8 = 8% of monthly retainer",
                        step: 0.1,
                        width: "33%",
                        condition: (_data: any, siblingData: any) =>
                          siblingData?.frequency === "monthly" &&
                          (siblingData?.commissionType ?? "percentage") === "percentage",
                      },
                    },
                    {
                      name: "monthlyAmount",
                      type: "number",
                      min: 0,
                      admin: {
                        description: "Fixed $/month",
                        step: 1,
                        width: "33%",
                        condition: (_data: any, siblingData: any) =>
                          siblingData?.frequency === "monthly" &&
                          siblingData?.commissionType === "fixed",
                      },
                    },
                    {
                      name: "oneOffAmount",
                      type: "number",
                      min: 0,
                      admin: {
                        description: "One-off $ amount",
                        step: 1,
                        width: "33%",
                        condition: (_data: any, siblingData: any) =>
                          siblingData?.frequency === "one_off",
                      },
                    },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "startDate",
                      type: "date",
                      required: true,
                      admin: {
                        description: "When commission begins",
                        width: "50%",
                        date: {
                          pickerAppearance: "dayOnly",
                          displayFormat: "d MMM yyyy",
                        },
                      },
                    },
                    {
                      name: "endDate",
                      type: "date",
                      admin: {
                        description:
                          "When monthly commission ends (required for monthly). After this date no longer deducted.",
                        width: "50%",
                        date: {
                          pickerAppearance: "dayOnly",
                          displayFormat: "d MMM yyyy",
                        },
                        condition: (_data: any, siblingData: any) =>
                          siblingData?.frequency === "monthly",
                      },
                    },
                  ],
                },
                {
                  name: "notes",
                  type: "textarea",
                  admin: { description: "Free-form notes" },
                },
              ],
            },
            {
              name: "historicalRevenueByYear",
              type: "array",
              dbName: "clients_historical_revenue_by_year",
              access: sensitiveFieldAccess("clients"),
              admin: {
                description:
                  "Pre-CMS revenue, broken out by calendar year. Sum is added to the lifetime billing total.",
                initCollapsed: true,
                condition: conditionRequiresFeature(
                  "clients",
                  (data: any) => !data?.isAgency,
                ),
              },
              validate: ((value: unknown) => {
                if (!Array.isArray(value)) return true;
                const seen = new Set<number>();
                for (let i = 0; i < value.length; i++) {
                  const row = value[i] as Record<string, unknown> | null;
                  if (!row) continue;
                  const year = Number(row.year);
                  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
                    return `Row ${i + 1}: Year must be between 2000 and 2100.`;
                  }
                  if (seen.has(year)) {
                    return `Row ${i + 1}: Year ${year} appears more than once.`;
                  }
                  seen.add(year);
                }
                return true;
              }) as any,
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "year",
                      type: "number",
                      required: true,
                      min: 2000,
                      max: 2100,
                      admin: {
                        description: "Calendar year (e.g. 2024)",
                        step: 1,
                        width: "40%",
                      },
                    },
                    {
                      name: "amount",
                      type: "number",
                      required: true,
                      min: 0,
                      admin: {
                        description: "Revenue for that year ($)",
                        step: 1,
                        width: "60%",
                      },
                    },
                  ],
                },
              ],
            },
            {
              name: "contract",
              type: "upload",
              relationTo: "media",
              access: sensitiveFieldAccess("clients"),
              admin: {
                description: "Client contract document (legacy upload)",
                condition: conditionRequiresFeature(
                  "clients",
                  (data: any) => !data?.isAgency,
                ),
              },
            },
            {
              name: "signedContractUrl",
              type: "text",
              access: sensitiveFieldAccess("clients"),
              admin: {
                readOnly: true,
                description: "URL of the signed contract PDF (from e-signature flow)",
                condition: conditionRequiresFeature(
                  "clients",
                  (data: any) => !data?.isAgency,
                ),
              },
            },
            {
              name: "signedContract",
              type: "relationship",
              relationTo: "contracts",
              access: sensitiveFieldAccess("clients"),
              admin: {
                readOnly: true,
                description: "Linked signed contract record",
                condition: conditionRequiresFeature(
                  "clients",
                  (data: any) => !data?.isAgency,
                ),
              },
            },
              ],
            },
            // ══ Advanced collapsible ═══════════════════════════════════
            // Rarely-touched system fields. Collapsed by default per the
            // request — noisy stuff (auto-generated API key, legacy hidden
            // textarea, read-only retainer log) lives here so the rest of
            // the tab stays clean.
            {
              type: "collapsible",
              label: "Advanced",
              admin: { initCollapsed: true },
              fields: [
            {
              name: "apiKey",
              type: "text",
              access: sensitiveFieldAccess("clients"),
              admin: {
                description: "API key for this client (auto-generated)",
                readOnly: true,
                condition: conditionRequiresFeature("clients"),
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
              name: "legacyNotes",
              type: "textarea",
              admin: {
                // Hidden — superseded by the Notes tab. Existing content was
                // migrated into clientNotes by scripts/migrate-legacy-notes.ts.
                // Kept in schema for back-compat / safety.
                hidden: true,
              },
            },
            {
              name: "retainerHistory",
              type: "array",
              access: sensitiveFieldAccess("clients"),
              admin: {
                readOnly: true,
                description: "Automatic log of revenue changes",
                condition: conditionRequiresFeature("clients"),
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
                // Custom spreadsheet-style editor (one note per row, free-form).
                components: {
                  RowLabel: false as any,
                  Field: "./components/ClientNotesTable",
                },
                initCollapsed: false,
              },
              fields: [
                // The fields below stay in the schema for back-compat with
                // existing rows, but `category` and `date` are not exposed in
                // the new ClientNotesTable UI — they default automatically.
                {
                  name: "category",
                  type: "select",
                  defaultValue: "general",
                  admin: { hidden: true },
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
                  admin: { hidden: true },
                },
                {
                  name: "author",
                  type: "text",
                  admin: {
                    description: "Auto-filled from the user who added the note",
                  },
                },
                {
                  name: "content",
                  type: "textarea",
                  required: true,
                  admin: {
                    description: "Note content (point form supported)",
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Discovery Briefing",
          description:
            "Structured 11-section client discovery questionnaire (business overview, services, target audience, USP, tech stack, SEO, Google Ads, budget, etc.). Saves both structured data and a canonical markdown export that feeds the website build, SEO content plan, and Google Ads strategy.",
          fields: [
            {
              name: "_discoveryBriefingPanel",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/admin/DiscoveryBriefingPanel",
                },
              },
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
                components: {
                  RowLabel: false as any,
                  Field: "./components/AccountTimelineTable",
                },
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
                      options: [
                        { label: "Google Ads", value: "google_ads" },
                        { label: "SEO", value: "seo" },
                        { label: "Analytics / Tracking", value: "analytics" },
                        { label: "Website", value: "website" },
                        { label: "Social / Meta", value: "social" },
                        { label: "Content", value: "content" },
                        { label: "Contracts / Legal", value: "contracts" },
                        { label: "Onboarding", value: "onboarding" },
                        { label: "General", value: "general" },
                      ],
                    },
                    {
                      name: "actionType",
                      type: "select",
                      required: true,
                      options: [
                        { label: "Account Takeover", value: "account_takeover" },
                        { label: "Account Access Granted", value: "access_granted" },
                        { label: "Onboarding Started", value: "onboarding_started" },
                        { label: "Onboarding Completed", value: "onboarding_completed" },
                        { label: "Contract Signed", value: "contract_signed" },
                        { label: "Contract Renewed", value: "contract_renewed" },
                        { label: "Scope of Work Changed", value: "scope_changed" },
                        { label: "Kickoff Meeting", value: "kickoff_meeting" },
                        { label: "Strategy Meeting", value: "strategy_meeting" },
                        { label: "Review Meeting", value: "review_meeting" },
                        { label: "Client Presentation", value: "client_presentation" },
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
                        { label: "Process Milestone", value: "process_milestone" },
                        { label: "Other", value: "other" },
                      ],
                    },
                    {
                      name: "description",
                      type: "text",
                      required: true,
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
                description: "Consolidated keyword list (one per line). Used as reference for blog content strategy and client reporting.",
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
            // ─ Default Conversion Actions Picker ─
            // Saved selection is the default for both the Google Ads dashboard
            // and the Budget Management tool. Stored as newline-separated
            // names for back-compat with existing dashboard read paths.
            {
              name: "dashboardConversionActions",
              type: "textarea",
              admin: {
                condition: (data: any) => !!data?.googleAdsCustomerId,
                components: {
                  Field: "./components/GoogleAdsConversionActionPicker",
                },
              },
            },

            // ─ Conversion Action Categories ─
            // Powers the Overview tab's "Conversion Split" card and the
            // per-action breakdowns shown on the KPI row, Category
            // Breakdown table, and per-campaign splits. Each row is a
            // user-defined bucket — name it (e.g. "Phone Calls",
            // "Form Submits", "Email Clicks", "Get Directions") and paste
            // the matching Google-Ads conversion-action names underneath,
            // one per line. Drag to reorder. Anything not categorised
            // rolls up under "Other" so missing categorisations are
            // visible.
            //
            // Supersedes the legacy phoneCallConversionActions /
            // formSubmitConversionActions textareas. When this array is
            // empty, the legacy fields are still respected as a fallback
            // so existing client data isn't orphaned by the upgrade.
            {
              name: "conversionActionCategories",
              type: "array",
              labels: { singular: "Category", plural: "Categories" },
              admin: {
                hidden: true,
                condition: (data: any) => !!data?.googleAdsCustomerId,
                description:
                  'Managed by the Default Conversion Actions picker above. Each selected action is stored as a category row for dashboard columns / tiles.',
                initCollapsed: false,
              },
              fields: [
                {
                  name: "label",
                  type: "text",
                  required: true,
                  admin: { width: "30%", placeholder: "Phone Calls" },
                },
                {
                  name: "color",
                  type: "select",
                  defaultValue: "sky",
                  options: [
                    { label: "Sky Blue", value: "sky" },
                    { label: "Violet", value: "violet" },
                    { label: "Emerald", value: "emerald" },
                    { label: "Amber", value: "amber" },
                    { label: "Rose", value: "rose" },
                    { label: "Slate", value: "slate" },
                  ],
                  admin: { width: "20%" },
                },
                {
                  name: "actions",
                  type: "textarea",
                  admin: {
                    description:
                      "Google Ads conversion action names that fall into this category, one per line.",
                  },
                },
              ],
            },

            // Legacy fixed-bucket fields — still read as a fallback when
            // conversionActionCategories is empty, so existing client data
            // keeps working. Hidden from the admin form so new edits go
            // through the categories array above.
            {
              name: "phoneCallConversionActions",
              type: "textarea",
              admin: { hidden: true },
            },
            {
              name: "formSubmitConversionActions",
              type: "textarea",
              admin: { hidden: true },
            },

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

            // ─ View Account Structure (Figma-style live visual) ─
            // Opens /client/<slug>/google-ads/account-structure in a new tab.
            // The button only renders when both slug and googleAdsCustomerId
            // exist (destination page 404s otherwise).
            {
              name: "viewAccountStructure",
              type: "ui",
              admin: {
                condition: (data: any) => !!data?.googleAdsCustomerId,
                components: {
                  Field: "./components/ViewAccountStructureButton",
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

            // ─ Budget Management (inline view of latest audit's budget tab) ─
            // Uses the most recent Google Ads audit for this client. Hidden until
            // a Google Ads customer ID is set, since the underlying tool needs one.
            {
              name: "clientBudgetManagement",
              type: "ui",
              admin: {
                condition: (data: any) => !!data?.googleAdsCustomerId,
                components: {
                  Field: "./components/ClientBudgetManagementInline",
                },
              },
            },

            // ─ Negative List Builder ─
            {
              name: "openNegativeListBuilder",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/OpenNegativeListBuilderButton",
                },
              },
            },

            // ─ Negative Keyword Lists ─
            {
              name: "negativeKeywordLists",
              type: "join",
              collection: "negative-keyword-lists",
              on: "client",
              admin: {
                description: "Negative keyword lists managed for this client",
              },
            },

            // ─ Match Type Variants + Consolidation Review ─
            {
              name: "googleAdsMatchTypeVariants",
              type: "ui",
              admin: {
                condition: (data: any) => !!data?.googleAdsCustomerId,
                components: {
                  Field: "./components/GoogleAdsMatchTypeVariants",
                },
              },
            },

            // ─ Negative Keyword Submits ─
            // Created from the dashboard's Keyword Deep Dive tool when a
            // client clicks "Save for Review". Reviewed by the team and
            // applied to a Negative Keyword List from the submit's edit view.
            {
              name: "keywordDeepDiveSessions",
              type: "join",
              collection: "keyword-deep-dive-sessions",
              on: "client",
              admin: {
                description: "Negative Keyword submits sent from the client's Google Ads dashboard for review",
                defaultColumns: ["title", "keywordCount", "status", "appliedToNKL", "createdAt"],
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

                // Match Type Monitor
                {
                  name: "matchTypeMonitorEnabled",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description:
                      "Enable daily match type violation monitoring (runs ~17:00 UTC). Flags Exact/Phrase keywords that served non-conforming search terms. Review candidates in Growth Tools → Match Type Violations.",
                    components: {
                      Field: "./components/match-type-violations/MatchTypeMonitorToggle",
                    },
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

            // ─ Account Health Contract ─
            // Per-client invariants that goal agents respect. Set once at
            // onboarding. Reference: docs/goal-agents-architecture-and-
            // build-plan.md §Layer 2 & §Layer 3.
            {
              name: "spendPolicy",
              type: "group",
              admin: {
                description:
                  "Account Health Contract — per-client invariants that goal agents respect. Set once at onboarding.",
              },
              fields: [
                {
                  name: "pacingMode",
                  type: "select",
                  admin: {
                    description:
                      "How this client's spend is paced. See architecture doc §Layer 3.",
                  },
                  options: [
                    {
                      label: "Fixed monthly budget (must spend 90–105%)",
                      value: "fixed_monthly",
                    },
                    {
                      label: "Performance cap (ceiling, may underspend)",
                      value: "performance_cap",
                    },
                    {
                      label: "ROAS target (spend scales with ROAS)",
                      value: "roas_target",
                    },
                    { label: "Seasonal / launch (predefined curve)", value: "seasonal" },
                  ],
                },
                {
                  name: "pacingWindow",
                  type: "select",
                  defaultValue: "calendar_month",
                  admin: {
                    description:
                      "Window used by the spend pacer. Only calendar month supported today; enum is open for future modes.",
                  },
                  options: [{ label: "Calendar month", value: "calendar_month" }],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "monthlyBudgetTarget",
                      type: "number",
                      admin: {
                        description:
                          "Target monthly spend in account currency (AUD typical). Used by the pacer to compute daily pace target.",
                      },
                    },
                    {
                      name: "acceptableVariancePercentLow",
                      type: "number",
                      defaultValue: 90,
                      admin: {
                        description:
                          "Lower bound of the acceptable spend band, percent of target. Default 90.",
                      },
                    },
                    {
                      name: "acceptableVariancePercentHigh",
                      type: "number",
                      defaultValue: 105,
                      admin: {
                        description:
                          "Upper bound of the acceptable spend band, percent of target. Default 105.",
                      },
                    },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "hardFloor",
                      type: "number",
                      admin: {
                        description:
                          "Optional. Goal agents must NEVER let monthly spend fall below this.",
                      },
                    },
                    {
                      name: "hardCeiling",
                      type: "number",
                      admin: {
                        description:
                          "Optional. Goal agents must NEVER let monthly spend exceed this.",
                      },
                    },
                  ],
                },
                {
                  name: "conversionTrackingEnabledFrom",
                  type: "date",
                  admin: {
                    date: {
                      pickerAppearance: "dayOnly",
                    },
                    description:
                      "Date conversion tracking became reliable for this account. Zero-conversion pause detectors stand down when this is blank or too recent.",
                  },
                },
              ],
            },
            {
              name: "protectedCampaignIds",
              type: "array",
              admin: {
                description:
                  "Google Ads campaign IDs that goal agents must never modify. Brand campaigns, must-not-touch evergreen builds, etc.",
                initCollapsed: true,
              },
              fields: [
                {
                  name: "campaignId",
                  type: "text",
                  required: true,
                  admin: {
                    description:
                      "Numeric Google Ads campaign ID (e.g. 1234567890).",
                  },
                },
              ],
            },
            {
              name: "brandCampaignIds",
              type: "array",
              admin: {
                description:
                  "Google Ads campaign IDs flagged as BRAND. Used by the spend pacer to distinguish brand vs non-brand pacing.",
                initCollapsed: true,
              },
              fields: [
                { name: "campaignId", type: "text", required: true },
              ],
            },
          ],
        },
        {
          label: "SEO",
          description:
            "Per-client SEO tools. Run a Post-Migration SEO Review (redirects, indexing, soft-404s, performance, Core Web Vitals) and jump to this client's SEO records.",
          fields: [
            {
              name: "clientSeoTab",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ClientSeoTab",
                },
              },
            },
          ],
        },
        {
          label: "Search",
          description:
            "Consolidated home for search-side configuration — Search Console, SEO Health monitoring, SERP tracking, and AI Visibility. The brand keywords list below is the single source of truth used by every feature in this tab, the Google Ads dashboard's brand-vs-generic split, AI Search Erosion Detector, negative-sweep, and quality score analysis.",
          fields: [
            {
              name: "brandKeywords",
              type: "textarea",
              admin: {
                description:
                  "Brand terms (one per line OR comma-separated). Single source of truth used by GSC monitoring, Google Ads dashboard (brand-vs-generic spend split), AI Visibility, AI Search Erosion Detector, negative-sweep, and quality score analysis. Per-audit overrides live on each Google Ads audit's brandTerms field. Entries shorter than 3 chars are ignored.",
              },
            },
            {
              type: "tabs",
              tabs: [
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
                      access: sensitiveFieldAccess("clients"),
                      admin: {
                        disabled: true,
                        hidden: true,
                      },
                    },
                    {
                      name: "gscRefreshToken",
                      type: "text",
                      access: sensitiveFieldAccess("clients"),
                      admin: {
                        disabled: true,
                        hidden: true,
                      },
                    },
                    {
                      name: "gscTokenExpiry",
                      type: "date",
                      access: sensitiveFieldAccess("clients"),
                      admin: {
                        disabled: true,
                        hidden: true,
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
                {
                  label: "SEO Health",
                  fields: [
            {
              name: "seoAuto",
              type: "group",
              label: "Monthly SEO Health Monitor",
              admin: {
                description: "Configure Ahrefs-style monthly site health audits. Crawls the site, checks for issues, and pushes a report to CMS.",
              },
              fields: [
                {
                  name: "monthlyHealthEnabled",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Enable monthly site health monitoring for this client",
                  },
                },
                {
                  name: "siteUrl",
                  type: "text",
                  admin: {
                    description: "Full URL of the site to crawl (e.g. https://www.example.com)",
                    condition: (data: any) => data?.seoAuto?.monthlyHealthEnabled,
                  },
                },
                {
                  name: "gscSiteUrl",
                  type: "text",
                  admin: {
                    description:
                      "Override the GSC property URL used by the monthly site-health monitor only — leave empty to fall back to the OAuth-derived `gscPropertyUrl` on the Search Console tab.",
                    condition: (data: any) => data?.seoAuto?.monthlyHealthEnabled,
                  },
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "healthReportDayOfMonth",
                      type: "number",
                      defaultValue: 1,
                      min: 1,
                      max: 28,
                      admin: {
                        description: "Day of month to run the audit (1-28)",
                        width: "33%",
                        condition: (data: any) => data?.seoAuto?.monthlyHealthEnabled,
                      },
                    },
                    {
                      name: "maxPages",
                      type: "number",
                      defaultValue: 200,
                      min: 10,
                      max: 500,
                      admin: {
                        description: "Max pages to crawl",
                        width: "33%",
                        condition: (data: any) => data?.seoAuto?.monthlyHealthEnabled,
                      },
                    },
                    {
                      name: "checkExternalLinks",
                      type: "checkbox",
                      defaultValue: false,
                      admin: {
                        description: "Check external links (slower)",
                        width: "33%",
                        condition: (data: any) => data?.seoAuto?.monthlyHealthEnabled,
                      },
                    },
                  ],
                },
                {
                  name: "notificationEmails",
                  type: "array",
                  admin: {
                    description: "Email addresses to receive the monthly health report",
                    condition: (data: any) => data?.seoAuto?.monthlyHealthEnabled,
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
            // Join field: linked site health reports
            {
              name: "siteHealthReports",
              type: "join",
              collection: "site-health-reports",
              on: "client",
              admin: {
                description: "Monthly site health reports for this client",
                defaultColumns: ["healthScore", "reportDate", "issuesSummary"],
              },
            },
                  ],
                },
                {
                  label: "SERP Monitor",
                  fields: [
                    {
                      name: "serpMonitor",
                      type: "group",
                      admin: {
                        description:
                          "Daily SERP tracking. Detects AI Overview appearance and paid-displacement risk. Domain is inherited from the Business tab's Website URL by default. See the Notes tab for full setup instructions.",
                      },
                      fields: [
                        {
                          name: "enabled",
                          type: "checkbox",
                          defaultValue: false,
                        },
                        {
                          name: "domain",
                          type: "text",
                          admin: {
                            description:
                              "Optional override. Leave empty to inherit the client's Website URL from the Business tab (recommended). Only set this when the SERP target differs from the main site (e.g. tracking a subdomain like 'shop.example.com').",
                          },
                        },
                        {
                          name: "keywords",
                          type: "array",
                          maxRows: 50,
                          fields: [
                            {
                              name: "keyword",
                              type: "text",
                              required: true,
                              maxLength: 200,
                            },
                            {
                              name: "location",
                              type: "select",
                              required: true,
                              defaultValue: "au:sydney",
                              options: [
                                { label: "🇦🇺 Australia", value: "au" },
                                { label: "🏄 Sydney", value: "au:sydney" },
                                { label: "☕ Melbourne", value: "au:melbourne" },
                                { label: "🦘 Brisbane", value: "au:brisbane" },
                                { label: "🌴 Perth", value: "au:perth" },
                                { label: "🇺🇸 United States", value: "us" },
                                { label: "🗽 New York", value: "us:new-york" },
                                { label: "🌴 Los Angeles", value: "us:los-angeles" },
                                { label: "🏙️ Chicago", value: "us:chicago" },
                                { label: "🚀 Houston", value: "us:houston" },
                                { label: "🏖️ Miami", value: "us:miami" },
                                { label: "🇬🇧 United Kingdom", value: "uk" },
                                { label: "🏛️ London", value: "uk:london" },
                                { label: "⚽ Manchester", value: "uk:manchester" },
                                { label: "🏭 Birmingham", value: "uk:birmingham" },
                                { label: "🇨🇦 Canada", value: "ca" },
                                { label: "🍁 Toronto", value: "ca:toronto" },
                                { label: "🏔️ Vancouver", value: "ca:vancouver" },
                                { label: "🎭 Montreal", value: "ca:montreal" },
                                { label: "🇩🇪 Germany", value: "de" },
                                { label: "🇫🇷 France", value: "fr" },
                                { label: "🗼 Paris", value: "fr:paris" },
                                { label: "🇪🇸 Spain", value: "es" },
                                { label: "🇮🇹 Italy", value: "it" },
                                { label: "🇯🇵 Japan", value: "jp" },
                                { label: "🗼 Tokyo", value: "jp:tokyo" },
                                { label: "🇮🇳 India", value: "in" },
                                { label: "🇸🇬 Singapore", value: "sg" },
                                { label: "🇭🇰 Hong Kong", value: "hk" },
                                { label: "🇳🇱 Netherlands", value: "nl" },
                              ],
                            },
                            {
                              name: "device",
                              type: "radio",
                              defaultValue: "desktop",
                              options: [
                                { label: "Desktop", value: "desktop" },
                                { label: "Mobile", value: "mobile" },
                              ],
                            },
                          ],
                        },
                        {
                          name: "alertRecipientEmails",
                          type: "array",
                          admin: {
                            description:
                              "Recipients of the daily SERP alert digest. Add one row per email. Leave empty to skip email delivery (snapshots still recorded). Alerts only fire when one of the keywords breaches the thresholds below.",
                          },
                          fields: [{ name: "email", type: "email", required: true }],
                        },
                        {
                          name: "alertThresholds",
                          type: "group",
                          fields: [
                            {
                              name: "organicDropPositions",
                              type: "number",
                              defaultValue: 3,
                              min: 1,
                              max: 50,
                              admin: {
                                description:
                                  "Alert when our organic position drops by this many spots day-over-day.",
                              },
                            },
                            {
                              name: "pixelOffsetDrop",
                              type: "number",
                              defaultValue: 400,
                              min: 100,
                              max: 2000,
                              admin: {
                                description:
                                  "Alert when estimated vertical pixel offset increases by this much (lower = more sensitive).",
                              },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  label: "AI Visibility",
                  fields: [
                    {
                      name: "aiVisibility",
                      type: "group",
                      label: "AI Visibility Tracker",
                      admin: {
                        description:
                          "Configure weekly AI Visibility snapshots — traffic from ChatGPT, Gemini, Perplexity, Claude, etc. — and buyer-question probes run across those assistants.",
                      },
                      fields: [
                        {
                          name: "enabled",
                          type: "checkbox",
                          defaultValue: false,
                          admin: {
                            description:
                              "Enable weekly AI Visibility snapshots (traffic from ChatGPT, Gemini, Perplexity, Claude, etc).",
                          },
                        },
                        {
                          name: "recipientEmails",
                          type: "array",
                          fields: [{ name: "email", type: "email", required: true }],
                          admin: {
                            description: "Who receives the weekly AI Visibility digest.",
                          },
                        },
                        {
                          name: "probePrompts",
                          type: "array",
                          maxRows: 20,
                          fields: [
                            { name: "prompt", type: "text", required: true, maxLength: 500 },
                          ],
                          admin: {
                            description:
                              "Phase 4 — buyer questions to run through ChatGPT/Gemini/Perplexity/Claude each week. Leave empty to skip probing.",
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "SEO Audit Proposal",
          description:
            "Full SEO Audit Proposal for this client — GSC performance, technical, demand, rankings, SEO/CRO, service coverage, location, topic authority, and lead-value ROI. Pulls website, GSC property, brand keywords, AOV and conversion rate from this client record.",
          fields: [
            {
              name: "runSeoProposal",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/RunSeoProposalButton",
                },
              },
            },
            {
              name: "seoProposalActions",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ClientSeoProposalActions",
                },
              },
            },
            {
              name: "presentedBy",
              type: "text",
              admin: {
                description:
                  "Who is presenting (e.g. 'Adam Telhiwec and Peter Tu'). Shown on the closing slide of the SEO Audit Proposal.",
              },
            },
            {
              name: "seoAuditProposals",
              type: "relationship",
              relationTo: "seo-audit-proposals",
              hasMany: true,
              admin: {
                readOnly: true,
                description: "SEO Audit Proposal runs for this client",
              },
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
                description: "Blog categories for this client (one per line). Pre-populates the category dropdown in the Blog Prompter.",
              },
            },
            {
              name: "blogTags",
              type: "textarea",
              admin: {
                description: "Available tags for this client (one per line). Pre-populates the tag options in the Blog Prompter.",
              },
            },
            {
              name: "servicePages",
              type: "textarea",
              admin: {
                description: "Service or product/category pages for this client (one per line). Auto-inserted into generated blog prompts as internal linking requirements.",
              },
            },
            {
              name: "blogTone",
              type: "textarea",
              admin: {
                description:
                  "Default tone/style for this client's blog. Example: helpful, direct, technical but not academic; like an experienced consultant explaining trade-offs to a business owner.",
              },
            },
            {
              name: "blogCategoryTones",
              type: "array",
              label: "Category-specific blog tones",
              admin: {
                description:
                  "Optional tone overrides/additions used when the Blog Prompter category matches exactly after trimming and lowercasing.",
              },
              fields: [
                {
                  name: "category",
                  type: "text",
                  required: true,
                },
                {
                  name: "tone",
                  type: "textarea",
                  required: true,
                },
              ],
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
            {
              name: "clientTopicMap",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ClientTopicMap",
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
                description: "GA4 Measurement ID (e.g., G-XXXXXXXXXX). Used by the tag setup audit to verify GA4 is properly installed on the site.",
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
                description: "GTM Container ID (e.g., GTM-XXXXXXX). Used by the tag setup audit and auto-generated bookmarks.",
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
                  "Expected GA4 events (one per line, e.g., purchase, add_to_cart, generate_lead). The tag setup audit checks the site for these specific events and flags missing ones.",
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
                description:
                  "Numeric GA4 property ID (e.g. 308123456) — strip any 'properties/' prefix and don't paste the 'G-' Measurement ID. Used by GA4 OAuth/query routes here and by Growth Tools (AI Visibility Tracker, future GA4-powered tools). Set before connecting OAuth.",
              },
            },
            {
              name: "ga4AccessToken",
              type: "text",
              access: sensitiveFieldAccess("clients"),
              admin: { hidden: true },
            },
            {
              name: "ga4RefreshToken",
              type: "text",
              access: sensitiveFieldAccess("clients"),
              admin: { hidden: true },
            },
            {
              name: "ga4TokenExpiry",
              type: "date",
              access: sensitiveFieldAccess("clients"),
              admin: { hidden: true },
            },
            // Note: the duplicate `analytics.ga4PropertyId` field was removed in May 2026.
            // Growth Tools now reads the canonical `ga4PropertyId` field above directly.
            // The DB column `analytics_ga4_property_id` is left in place to avoid data loss
            // — it can be dropped in a future migration once we've confirmed no rows depend on it.
          ],
        },
        {
          label: "Proposal",
          fields: [
            {
              name: "clientProposals",
              type: "join",
              collection: "client-proposals",
              on: "client",
              admin: {
                description: "Original proposal that became this client",
                defaultColumns: ["businessName", "proposalStatus", "slug", "createdAt"],
              },
            },
          ],
        },
        {
          label: "Client Hub",
          fields: [
            {
              name: "clientPortalLinks",
              type: "array",
              dbName: "clients_client_portal_links",
              admin: {
                description: "PIN-gated client hub links for documents, dashboards, audits, decks, and other resources.",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "label", type: "text", required: true, admin: { width: "35%" } },
                    { name: "url", type: "text", required: true, admin: { width: "45%" } },
                    {
                      name: "kind",
                      type: "select",
                      required: true,
                      defaultValue: "other",
                      admin: { width: "20%" },
                      options: [
                        { label: "Briefing", value: "briefing" },
                        { label: "Audit", value: "audit" },
                        { label: "Dashboard", value: "dashboard" },
                        { label: "Proposal", value: "proposal" },
                        { label: "Deck", value: "deck" },
                        { label: "Document", value: "document" },
                        { label: "Other", value: "other" },
                      ],
                    },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "visibility",
                      type: "select",
                      required: true,
                      defaultValue: "client_visible",
                      admin: { width: "50%" },
                      options: [
                        { label: "Client Visible", value: "client_visible" },
                        { label: "Internal", value: "internal" },
                      ],
                    },
                    { name: "sortOrder", type: "number", defaultValue: 0, admin: { width: "50%" } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Presentations",
          fields: [
            {
              name: "presentations",
              type: "array",
              admin: {
                description:
                  "Slide decks and presentations for this client. Paste the full deck URL from the 'Open Deck' button — the slug is extracted automatically.",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "title",
                      type: "text",
                      required: true,
                      admin: {
                        width: "35%",
                        description: "Display name (e.g. 'Pre-Migration Deck')",
                      },
                    },
                    {
                      name: "deckUrl",
                      type: "text",
                      required: true,
                      admin: {
                        width: "40%",
                        description:
                          "Full deck URL, e.g. https://cms.optimisedigital.online/partners/<client>/<deck>/",
                      },
                    },
                    {
                      name: "linkPreview",
                      type: "ui",
                      admin: {
                        width: "25%",
                        components: {
                          Field: "/components/ClientPresentationLink",
                        },
                      },
                    },
                  ],
                },
                {
                  name: "deckSlug",
                  type: "text",
                  admin: {
                    description:
                      "Internal: extracted from the deck URL above. Used for routing.",
                    readOnly: true,
                  },
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "presentedOn",
                      type: "date",
                      admin: {
                        width: "30%",
                        description: "Date the deck was presented",
                      },
                    },
                    {
                      name: "kind",
                      type: "select",
                      defaultValue: "deck",
                      admin: { width: "30%" },
                      options: [
                        { label: "Slide Deck (HTML)", value: "deck" },
                        { label: "Status Update", value: "status" },
                        { label: "Workshop", value: "workshop" },
                        { label: "Migration / Launch", value: "migration" },
                        { label: "Other", value: "other" },
                      ],
                    },
                    {
                      name: "isPublic",
                      type: "checkbox",
                      defaultValue: true,
                      admin: {
                        width: "40%",
                        description:
                          "Uncheck if the deck contains sensitive info that should not be linked publicly.",
                      },
                    },
                  ],
                },
                {
                  name: "notes",
                  type: "textarea",
                  admin: { description: "Internal notes (audience, outcomes, follow-ups)" },
                },
                {
                  name: "templateSlug",
                  type: "relationship",
                  relationTo: "deck-templates",
                  hasMany: false,
                  admin: {
                    description:
                      "Deck template to render at /partners/<clientSlug>/<deckSlug>/. Leave empty for legacy hand-built decks served from src/app/(frontend)/partners/<clientSlug>/<deckSlug>/.",
                  },
                  filterOptions: () => ({ isActive: { equals: true } }),
                },
                {
                  name: "deckPayload",
                  type: "json",
                  admin: {
                    description:
                      "Template payload (JSON). Must match the selected template's schema. Required when templateSlug is set.",
                    condition: (_data: any, siblingData: any) => Boolean(siblingData?.templateSlug),
                  },
                },
                {
                  name: "linkPreview",
                  type: "ui",
                  admin: {
                    components: {
                      Field: "/components/ClientPresentationLink",
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Integrations",
          description:
            "Per-client integration status and connect/reconnect controls (GA4, GSC, Google Ads, Meta Ads). GSC uses per-client OAuth (Connect/Reconnect/Disconnect below). GA4, Google Ads, and Meta Ads use shared agency access — use Test connection to verify. Gmail is intentionally excluded (per-user OAuth).",
          fields: [
            {
              name: "metaAdAccountId",
              type: "text",
              admin: {
                description:
                  "Meta Ads account ID (format: act_XXXXXXXXX). Client must grant the Optimise Digital Business Manager access. Used by the Tools panel below.",
              },
              validate: (value: string | null | undefined) => {
                if (!value) return true;
                if (!/^act_\d+$/.test(value)) {
                  return 'Meta Ad Account ID must look like "act_XXXXXXXXX".';
                }
                return true;
              },
            },
            {
              name: "_toolsPanel",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ClientToolsTab",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};
