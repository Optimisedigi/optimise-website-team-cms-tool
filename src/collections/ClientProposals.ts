import type {
  CollectionConfig,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionAfterReadHook,
} from "payload";
import { proposalEditor } from "@/lib/proposalEditor";
import { logActivity } from "../lib/activity-log";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

const ROADMAP_DEFAULTS = {
  buildLaunch: [
    { week: "WEEK 01", step: "Proposal & sign-off", body: "Agreement signed, project timeline confirmed, kickoff scheduled." },
    { week: "WEEK 02-03", step: "Discovery & strategy", body: "Site, competitor & market review. Map the conversion workflow. Finalise architecture & messaging framework." },
    { week: "WEEK 04", step: "Strategy approval", body: "Sitemap, core page structure & content plan presented. Sign-off before build begins." },
    { week: "WEEK 05-10", step: "Site build", body: "Conversion-first build. CMS & secure forms. Optimised content. Technical SEO + analytics." },
    { week: "WEEK 11-12+", step: "Review, launch & optimise", body: "Staging review, SEO-safe migration, Search Console, 30-day monitoring, authority content rollout." },
  ],
  growthRetainer: [
    { week: "MONTH 01", step: "Baseline & quick wins", body: "Establish performance baseline. Action quick-win optimisations across organic, paid and CRO." },
    { week: "MONTH 02", step: "Content & authority", body: "Authority content rollout per priority category. Technical SEO improvements applied iteratively." },
    { week: "MONTH 03", step: "Paid scaling", body: "Paid media scaling with tightened audience targeting. Conversion tracking validated and refined." },
    { week: "ONGOING", step: "Optimise & report", body: "Monthly performance reviews. CRO testing & iteration. Quarterly strategic re-planning." },
  ],
  auditStrategy: [
    { week: "WEEK 01-02", step: "Discovery & audit", body: "Deep-dive into site, competitors, channels and current performance. Mapping the full conversion workflow." },
    { week: "WEEK 03-04", step: "Strategy build", body: "Channel-by-channel strategy with prioritised recommendations. Forecast modelling tied to commercial targets." },
    { week: "WEEK 05-06", step: "Roadmap & handover", body: "Final strategy presented with sequenced delivery roadmap. Hand-off to internal team or follow-on engagement." },
  ],
} as const

const COMMERCIAL_DEFAULTS = [
  {
    tier: "PHASE 01",
    name: "Build & Launch",
    amount: "TBC",
    amountSub: "one-time",
    featured: false,
    features: [
      { item: "Discovery & strategy" },
      { item: "Site architecture & content strategy" },
      { item: "Mobile-first build, CMS, secure forms" },
      { item: "Technical SEO & analytics setup" },
    ],
  },
  {
    tier: "PHASE 02",
    name: "Growth Retainer",
    amount: "TBC",
    amountSub: "/ month",
    featured: true,
    features: [
      { item: "Authority content rollout per category" },
      { item: "Ongoing CRO testing & iteration" },
      { item: "Paid media management (when unlocked)" },
      { item: "Monthly performance reporting" },
    ],
  },
]

const LAUNCH_STEPS_DEFAULTS = [
  { stepLabel: "STEP 01", title: "Confirm proposal", body: "Agreement signed and project timeline confirmed. Internal stakeholders identified." },
  { stepLabel: "STEP 02", title: "Discovery kickoff", body: "Two-week deep-dive into site, competitors and market positioning. Conversion workflow mapped end-to-end." },
  { stepLabel: "STEP 03", title: "Strategy approval", body: "Top-line sitemap, page structure and content plan presented. One round of revisions, then build begins." },
]

const LAUNCH_BLOCKS_DEFAULTS = [
  {
    tag: "DURING BUILD",
    title: "Conversion-first build · CMS & secure forms · Optimised content · Technical SEO & analytics",
    body: "Approx. 4-6 weeks development. Staging review and final approval before any traffic moves to the new site.",
  },
  {
    tag: "POST LAUNCH",
    title: "30-day performance monitoring · Search Console & indexation tracking · Authority content rollout",
    body: "SEO-safe migration with domain protection. Conversion tracking validated before any growth marketing begins.",
  },
]

const DEFAULT_FLIGHT_PLAN_RECS = [
  { enabled: false, title: "New Website Build", description: "A modern, mobile-first website built for conversions. Fast-loading, professional design that builds trust and drives enquiries.", benefit: "Higher conversion rates" },
  { enabled: false, title: "Conversion Rate Optimisation (CRO)", description: "Optimise the website journey to convert more visitors into leads. Clear CTAs, trust signals, and streamlined forms.", benefit: "More leads from existing traffic" },
  { enabled: false, title: "Technical SEO Foundation", description: "Fix crawlability, indexing, site speed, and structured data so Google can properly rank the site.", benefit: "Improved search visibility" },
  { enabled: false, title: "On-Page SEO & Content Optimisation", description: "Optimise page titles, meta descriptions, headings, and content structure for target keywords.", benefit: "Better keyword rankings" },
  { enabled: false, title: "Local SEO & Google Business Profile", description: "Optimise Google Business Profile, local citations, and location-based content for local search visibility.", benefit: "More local customers" },
  { enabled: false, title: "Content Strategy & Blog", description: "Publish high-quality, keyword-targeted content that answers real customer questions and builds topical authority over time.", benefit: "Long-term organic growth" },
  { enabled: false, title: "Social Content Strategy", description: "Build a consistent social media presence with platform-specific content that drives engagement, brand awareness, and website traffic.", benefit: "Brand visibility & engagement" },
  { enabled: false, title: "Google Ads (Search)", description: "Launch targeted search campaigns to capture high-intent traffic immediately while organic rankings build.", benefit: "Immediate qualified traffic" },
  { enabled: false, title: "Google Ads (Performance Max / Shopping)", description: "Performance Max campaigns for e-commerce or service-based lead generation with AI-optimised bidding.", benefit: "AI-optimised conversions" },
  { enabled: false, title: "Meta Ads (Facebook & Instagram)", description: "Paid social campaigns for brand awareness, retargeting, and lead generation across Meta platforms.", benefit: "Expanded audience reach" },
  { enabled: false, title: "Link Building & Digital PR", description: "Build high-quality backlinks through outreach, partnerships, and digital PR to boost domain authority.", benefit: "Stronger domain authority" },
  { enabled: false, title: "Email Marketing & Automation", description: "Set up automated email sequences for lead nurture, re-engagement, and customer retention.", benefit: "Better customer retention" },
  { enabled: false, title: "Custom CRM & Lead Management", description: "Implement a tailored CRM system to track leads, automate follow-ups, and manage your sales pipeline for better conversion.", benefit: "Streamlined sales process" },
  { enabled: false, title: "Analytics & Tracking Setup", description: "Implement GA4, conversion tracking, and reporting dashboards to measure ROI and make data-driven decisions.", benefit: "Data-driven decisions" },
];

/** Seed flightPlanRecommendations with defaults for existing proposals that don't have them yet */
const seedFlightPlanRecs: CollectionAfterReadHook = async ({ doc }) => {
  if (!doc.flightPlanRecommendations || doc.flightPlanRecommendations.length === 0) {
    doc.flightPlanRecommendations = DEFAULT_FLIGHT_PLAN_RECS;
  }
  return doc;
};

/** Seed roadmap cells from the selected template when missing. */
const seedRoadmap: CollectionAfterReadHook = async ({ doc }) => {
  if (!doc.roadmapCells || doc.roadmapCells.length === 0) {
    const template = (doc.roadmapTemplate as string | undefined) ?? "build-launch";
    const key: keyof typeof ROADMAP_DEFAULTS =
      template === "growth-retainer"
        ? "growthRetainer"
        : template === "audit-strategy"
        ? "auditStrategy"
        : "buildLaunch";
    doc.roadmapCells = ROADMAP_DEFAULTS[key].map((c) => ({ ...c }));
  }
  return doc;
};

/** Seed commercial phases with defaults when missing. */
const seedCommercial: CollectionAfterReadHook = async ({ doc }) => {
  if (!doc.commercialPhases || doc.commercialPhases.length === 0) {
    doc.commercialPhases = COMMERCIAL_DEFAULTS.map((p) => ({
      ...p,
      features: p.features.map((f) => ({ ...f })),
    }));
  }
  return doc;
};

/** Seed launch steps + blocks with defaults when missing. */
const seedLaunch: CollectionAfterReadHook = async ({ doc }) => {
  if (!doc.launchSteps || doc.launchSteps.length === 0) {
    doc.launchSteps = LAUNCH_STEPS_DEFAULTS.map((s) => ({ ...s }));
  }
  if (!doc.launchBlocks || doc.launchBlocks.length === 0) {
    doc.launchBlocks = LAUNCH_BLOCKS_DEFAULTS.map((b) => ({ ...b }));
  }
  return doc;
};

const generateUniqueSlug: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (data && operation === "create" && data.businessName && !data.slug) {
    const baseSlug = data.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    let slug = baseSlug;
    let suffix = 0;

    while (true) {
      const existing = await req.payload.find({
        collection: "client-proposals",
        where: { slug: { equals: slug } },
        limit: 1,
      });
      if (existing.totalDocs === 0) break;
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }

    data.slug = slug;
  }
  return data;
};

const generateUniquePin = async (payload: any): Promise<string> => {
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const existing = await payload.find({
      collection: "client-proposals",
      where: { proposalPin: { equals: pin } },
      limit: 1,
    });
    if (existing.totalDocs === 0) return pin;
  }
  throw new Error("Unable to generate a unique proposal PIN after multiple attempts");
};

const convertToClientHook: CollectionAfterChangeHook = async ({
  doc,
  req,
  previousDoc,
}) => {
  if (doc.convertToClient && !previousDoc?.convertToClient) {
    const payload = req.payload;

    try {
      // Flatten keywordCategories into a single newline-separated string
      let keywords = "";
      const cats = doc.keywordCategories as
        | Array<{ categoryName: string; keywords: string }>
        | undefined;
      if (cats && cats.length > 0) {
        keywords = cats
          .map((c: { keywords: string }) => c.keywords)
          .filter(Boolean)
          .join("\n");
      } else if (doc.keywords) {
        keywords = doc.keywords as string;
      }

      // Strip competitor-only fields (screenshots, hasMetaAds) that don't exist on the Client schema
      const competitors = (
        doc.competitors as Array<Record<string, any>> | undefined
      )?.map(({ name, websiteUrl, googleMapsUrl }) => ({
        name,
        websiteUrl,
        googleMapsUrl,
      }));

      // Create a new Client from the proposal data
      // Find completed contract linked to this proposal
      let completedContract: any = null;
      try {
        const contractResults = await payload.find({
          collection: "contracts",
          where: {
            proposal: { equals: doc.id },
            status: { equals: "completed" },
          },
          limit: 1,
          overrideAccess: true,
        });
        if (contractResults.totalDocs > 0) {
          completedContract = contractResults.docs[0];
        }
      } catch {
        // No contracts found, continue
      }

      const newClient = await payload.create({
        collection: "clients",
        data: {
          name: doc.businessName,
          slug: doc.slug + "-client",
          websiteUrl: doc.websiteUrl,
          contactName: doc.contactName,
          contactEmail: doc.contactEmail,
          hasPhysicalLocations: doc.hasPhysicalLocations,
          numberOfLocations: doc.numberOfLocations,
          googleMapsUrls: doc.googleMapsUrls,
          conversionGoal: doc.conversionGoal,
          businessType: doc.businessType,
          targetLocation: doc.targetLocation,
          clientGoals: doc.businessGoals,
          competitors,
          tam: doc.tam,
          keywords: keywords || undefined,
          leadConversionRate: doc.leadConversionRate,
          leadToSaleConversionRate: doc.leadToSaleConversionRate,
          averageOrderValue: doc.averageOrderValue,
          annualPurchaseFrequency: doc.annualPurchaseFrequency,
          newCustomersLast12Months: doc.newCustomersLast12Months,
          isActive: true,
          ...(completedContract?.signedPdfUrl
            ? { signedContractUrl: completedContract.signedPdfUrl, signedContract: completedContract.id }
            : {}),
        },
      });

      // Link contract to the new client
      if (completedContract) {
        await payload.update({
          collection: "contracts",
          id: completedContract.id,
          data: { client: newClient.id },
          overrideAccess: true,
        });
      }

      // Re-link all audit/research records from the proposal to the new client
      const collectionsToRelink = [
        "seo-audits",
        "cro-audits",
        "keyword-snapshots",
        "competitor-analyses",
        "google-ads-audits",
        "content-researches",
      ] as const;

      await Promise.all(
        collectionsToRelink.map(async (collection) => {
          const records = await payload.find({
            collection,
            where: { proposal: { equals: doc.id } },
            limit: 100,
            overrideAccess: true,
          });
          await Promise.all(
            records.docs.map((record: any) =>
              payload.update({
                collection,
                id: record.id,
                data: { client: newClient.id },
                overrideAccess: true,
              }),
            ),
          );
        }),
      );

      // Link the proposal to the new client (keep it for reference)
      await payload.update({
        collection: "client-proposals",
        id: doc.id,
        data: {
          client: newClient.id,
          proposalStatus: "client",
        },
        overrideAccess: true,
      });
    } catch (error) {
      // Reset the toggle so the user can retry
      await payload.update({
        collection: "client-proposals",
        id: doc.id,
        data: { convertToClient: false },
      });
      req.payload.logger.error(
        `Failed to convert proposal "${doc.businessName}" to client: ${error}`,
      );
      throw new Error(
        `Failed to create client: a client with slug "${doc.slug}-client" may already exist.`,
      );
    }
  }
  return doc;
};

/**
 * ClientProposals Collection
 *
 * Internal proposal system for prospects. Team enters prospect details,
 * runs audits, and shares a PIN for the prospect to view the report.
 */
export const ClientProposals: CollectionConfig = {
  slug: "client-proposals",
  labels: {
    singular: "Client Proposal",
    plural: "Client Proposals",
  },
  admin: {
    useAsTitle: "businessName",
    group: "Clients",
    description: "Proposals for prospective clients",
    hidden: hideUnlessFeature("client-proposals"),
  },
  access: {
    read: canAccess("client-proposals"),
    create: canAccess("client-proposals"),
    update: canAccess("client-proposals"),
    delete: adminOnlyDelete,
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Prospect",
          fields: [
            {
              name: "businessName",
              type: "text",
              required: true,
              admin: {
                description: "Prospect business name",
              },
            },
            {
              name: "slug",
              type: "text",
              required: true,
              unique: true,
              admin: {
                description:
                  "URL-friendly identifier (auto-generated from business name)",
              },
            },
            {
              name: "websiteUrl",
              type: "text",
              required: true,
              admin: {
                description: "Prospect website URL. Used by SEO, CRO, and content audits to crawl and analyse the site.",
              },
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
                description: "Google Maps listing URLs. Used by the audit to analyse Google Business Profile listings against competitors.",
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
              name: "businessType",
              type: "select",
              admin: {
                description:
                  "Drives SEO/CRO audit scoring weights, proposal report presentation, and carries over to the Client record on conversion.",
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
              name: "conversionGoal",
              type: "select",
              admin: {
                description:
                  "Drives CRO audit analysis and is shown on the client-facing proposal report.",
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
              name: "businessGoals",
              type: "textarea",
              admin: {
                description: "What the prospect wants to achieve",
              },
            },
            {
              name: "notes",
              type: "textarea",
              admin: {
                description: "Internal team notes",
              },
            },
            {
              name: "tam",
              type: "richText",
              editor: proposalEditor,
              admin: {
                description:
                  "Total Addressable Market data shown on the Mission Brief slide. Leave empty to hide. Supports bold, italic, underline, font size formatting.",
              },
            },
            {
              name: "googleAdsCustomerId",
              type: "text",
              admin: {
                description: "Google Ads customer ID (e.g. 955-493-5739). Required to run a Google Ads audit from this proposal.",
              },
            },
            {
              name: "screenshotClickSelector",
              type: "text",
              admin: {
                description:
                  "CSS selector to click before capturing screenshots (e.g. age-gate 'Enter site' button). Leave blank for most sites.",
              },
            },
            {
              name: "websiteMockupUrl",
              type: "text",
              admin: {
                description:
                  "Path or URL to the HTML mockup for this client (e.g. /mockups/purples/index.html)",
              },
            },
            {
              name: "mockupUpload",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/MockupUpload",
                },
              },
            },
          ],
        },
        {
          label: "Audit Inputs",
          fields: [
            {
              name: "keywordCategories",
              type: "array",
              maxRows: 6,
              admin: {
                description:
                  "Up to 6 keyword categories (e.g. by service). Each category becomes a separate table on the report. All keywords across categories are sent to the audit engine for SEO ranking checks and competitor analysis.",
              },
              fields: [
                {
                  name: "categoryName",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Category label shown as the table heading (e.g. 'Weight Loss Treatments')",
                  },
                },
                {
                  name: "keywords",
                  type: "textarea",
                  required: true,
                  admin: {
                    description: "One keyword per line",
                  },
                },
              ],
            },
            {
              name: "keywords",
              type: "textarea",
              admin: {
                description: "Legacy single keyword list — use Keyword Categories above instead. Kept for backward compatibility.",
                condition: (data) => {
                  // Show only if there are no keyword categories but there are legacy keywords
                  const cats = data?.keywordCategories as any[] | undefined
                  return (!cats || cats.length === 0) && !!data?.keywords
                },
              },
            },
            {
              name: "targetLocation",
              type: "select",
              admin: {
                description:
                  "Determines the geo-location used for keyword volume lookups and competitor ranking checks.",
                isSortable: false,
              },
              options: [
                // Australia
                { label: "Australia (National)", value: "au" },
                { label: "Sydney, NSW", value: "au:sydney" },
                { label: "Melbourne, VIC", value: "au:melbourne" },
                { label: "Brisbane, QLD", value: "au:brisbane" },
                { label: "Perth, WA", value: "au:perth" },
                { label: "Adelaide, SA", value: "au:adelaide" },
                { label: "Canberra, ACT", value: "au:canberra" },
                { label: "Hobart, TAS", value: "au:hobart" },
                { label: "Darwin, NT", value: "au:darwin" },
                // New Zealand
                { label: "New Zealand (National)", value: "nz" },
                { label: "Auckland, NZ", value: "nz:auckland" },
                { label: "Wellington, NZ", value: "nz:wellington" },
                // United States
                { label: "United States (National)", value: "us" },
                { label: "New York, NY", value: "us:new-york" },
                { label: "Los Angeles, CA", value: "us:los-angeles" },
                { label: "Chicago, IL", value: "us:chicago" },
                { label: "Houston, TX", value: "us:houston" },
                { label: "Miami, FL", value: "us:miami" },
                { label: "Atlanta, GA", value: "us:atlanta" },
                { label: "Seattle, WA", value: "us:seattle" },
                { label: "Denver, CO", value: "us:denver" },
                // Canada
                { label: "Canada (National)", value: "ca" },
                { label: "Toronto, ON", value: "ca:toronto" },
                { label: "Vancouver, BC", value: "ca:vancouver" },
                { label: "Montreal, QC", value: "ca:montreal" },
                // UK
                { label: "United Kingdom (National)", value: "gb" },
                { label: "London, UK", value: "gb:london" },
                { label: "Manchester, UK", value: "gb:manchester" },
                { label: "Birmingham, UK", value: "gb:birmingham" },
                // Singapore
                { label: "Singapore", value: "sg" },
              ],
            },
            {
              name: "suggestions",
              label: "Pre-Audit Growth Suggestions",
              type: "textarea",
              admin: {
                description:
                  "One idea per line — these will appear at the bottom of the report as potential recommendations for the prospect",
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
                    description:
                      "Website visitor → lead conversion rate (%). Used for Mission Control slide.",
                    step: 0.1,
                  },
                },
                {
                  name: "leadToSaleConversionRate",
                  type: "number",
                  min: 0,
                  max: 100,
                  admin: {
                    description:
                      "Lead → paying client conversion rate (%). Used for Mission Control slide.",
                    step: 0.1,
                  },
                },
                {
                  name: "averageOrderValue",
                  type: "number",
                  min: 0,
                  admin: {
                    description:
                      "Average order / client value ($). Used for Mission Control slide.",
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
                    description:
                      "Annual purchase frequency (Total orders in last 12 months ÷ Unique customers in last 12 months). Used for CLTV calculation.",
                    step: 0.1,
                  },
                },
                {
                  name: "newCustomersLast12Months",
                  type: "number",
                  min: 0,
                  admin: {
                    description:
                      "Number of new customers acquired in the last 12 months.",
                    step: 1,
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "overrideMonthlyVisits",
                  type: "number",
                  min: 0,
                  admin: {
                    description:
                      "Override monthly visits shown for your business on the report. Leave blank to use API data.",
                    step: 1,
                  },
                },
                {
                  name: "overrideAvgPosition",
                  type: "number",
                  min: 0,
                  admin: {
                    description:
                      "Override average keyword position. Leave blank to use API data.",
                    step: 0.1,
                  },
                },
                {
                  name: "overrideKeywordsFound",
                  type: "number",
                  min: 0,
                  admin: {
                    description:
                      "Override keywords found count. Leave blank to use API data.",
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
                    description: "Google Maps listing URL",
                  },
                },
                {
                  name: "gbpRating",
                  type: "number",
                  min: 0,
                  max: 5,
                  admin: {
                    description: "Google Business Profile rating (1.0 - 5.0)",
                    step: 0.1,
                  },
                },
                {
                  name: "gbpReviewCount",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Number of Google reviews",
                    step: 1,
                  },
                },
                {
                  name: "gbpRespondsToReviews",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Does this business respond to reviews?",
                  },
                },
                {
                  name: "hasGoogleAds",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Manual override: mark this competitor as running Google Ads (used by the v2 deck's Competitor Analysis + Paid Burn slides when the audit data is wrong or missing).",
                  },
                },
                {
                  name: "googleAdCountOverride",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Optional override for the Google Ads count shown on the Paid Burn slide. Leave blank to use audit data.",
                    condition: (_, sibling) => Boolean(sibling?.hasGoogleAds),
                  },
                },
                {
                  name: "hasMetaAds",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Manual override: mark this competitor as running Meta Ads (used by the v2 deck's Competitor Analysis + Paid Burn slides when the audit data is wrong or missing).",
                  },
                },
                {
                  name: "metaAdCountOverride",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Optional override for the Meta Ads count shown on the Paid Burn slide. Leave blank to use audit data.",
                    condition: (_, sibling) => Boolean(sibling?.hasMetaAds),
                  },
                },
                {
                  name: "googleAdScreenshots",
                  type: "array",
                  maxRows: 4,
                  admin: {
                    description: "Manual Google Ads screenshots (up to 4). Overrides growth tools data.",
                  },
                  fields: [
                    {
                      name: "image",
                      type: "upload",
                      relationTo: "media",
                      required: true,
                    },
                  ],
                },
                {
                  name: "metaAdScreenshots",
                  type: "array",
                  maxRows: 4,
                  admin: {
                    description: "Manual Meta Ads screenshots (up to 4). Overrides growth tools data.",
                  },
                  fields: [
                    {
                      name: "image",
                      type: "upload",
                      relationTo: "media",
                      required: true,
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Audit Results",
          fields: [
            {
              name: "runAudits",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/RunAuditsButton",
                },
              },
            },
            {
              name: "viewReport",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ViewProposalReportLink",
                },
              },
            },
            {
              name: "auditStatus",
              type: "select",
              admin: {
                readOnly: true,
                description: "Current audit pipeline status",
              },
              options: [
                { label: "Pending", value: "pending" },
                { label: "Running", value: "running" },
                { label: "Completed", value: "completed" },
                { label: "Failed", value: "failed" },
              ],
            },
            {
              name: "auditProgress",
              type: "text",
              admin: {
                readOnly: true,
                description: "Current stage of the audit pipeline (e.g. 'seo_done|40')",
              },
            },
            {
              name: "auditStartedAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When audits were last kicked off",
              },
            },
            {
              name: "auditCompletedAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When audits finished",
              },
            },
            {
              name: "auditError",
              type: "textarea",
              admin: {
                readOnly: true,
                description: "Error details if audits failed",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "seoAudit",
                  type: "relationship",
                  relationTo: "seo-audits",
                  admin: {
                    readOnly: true,
                    description: "Linked SEO audit",
                  },
                },
                {
                  name: "croAudit",
                  type: "relationship",
                  relationTo: "cro-audits",
                  admin: {
                    readOnly: true,
                    description: "Linked CRO audit",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "keywordSnapshot",
                  type: "relationship",
                  relationTo: "keyword-snapshots",
                  admin: {
                    readOnly: true,
                    description: "Linked keyword snapshot",
                  },
                },
                {
                  name: "competitorAnalysis",
                  type: "relationship",
                  relationTo: "competitor-analyses",
                  admin: {
                    readOnly: true,
                    description: "Linked competitor analysis",
                  },
                },
              ],
            },
            {
              name: "contentResearch",
              type: "relationship",
              relationTo: "content-researches",
              hasMany: true,
              admin: {
                readOnly: true,
                description: "Linked content research results",
              },
            },
            {
              name: "runGoogleAdsAudit",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/RunGoogleAdsAuditFromProposalButton",
                },
              },
            },
            {
              name: "googleAdsAudit",
              type: "relationship",
              relationTo: "google-ads-audits",
              admin: {
                readOnly: true,
                description: "Linked Google Ads audit",
              },
            },
            {
              name: "visibleSlides",
              type: "select",
              hasMany: true,
              admin: {
                description:
                  "Select slides to REMOVE from the report. Selected slides will be hidden. Leave empty to show all.",
              },
              options: [
                { label: "Slide 1: Intro", value: "1" },
                { label: "Slide 2: What This Covers", value: "2" },
                { label: "Slide 3: Our Approach", value: "3" },
                { label: "Slide 4: Build & Fix Philosophy", value: "4" },
                { label: "Slide 5: Mission Brief", value: "5" },
                { label: "Slide 6: Keywords Analysis", value: "6" },
                { label: "Slide 7: Competitor Analysis", value: "7" },
                { label: "Slide 8: CRO Overview", value: "8" },
                { label: "Slide 9: CRO Recommendations", value: "9" },
                { label: "Slide 10: SEO Overview", value: "10" },
                { label: "Slide 11: Technical & Page Results", value: "11" },
                { label: "Slide 12: SEO Recommendations", value: "12" },
                { label: "Slide 13: Content Research", value: "13" },
                { label: "Slide 14: Competitor Ads", value: "14" },
                { label: "Slide 15: Mission Control", value: "15" },
                { label: "Slide 16: Flight Plan", value: "16" },
                { label: "Slide 17: Mission Resources", value: "17" },
                { label: "Slide 18: Launch Requirements", value: "18" },
                { label: "Slide 19: Closing", value: "19" },
              ],
            },
          ],
        },
        {
          label: "Post report input",
          fields: [
            {
              name: "missionPriorities",
              type: "array",
              maxRows: 4,
              admin: {
                description:
                  "Up to 4 mission priorities shown on the v2 'Where to focus our energy' slide (slide 13). Each becomes one card. Leave empty to hide the slide.",
                initCollapsed: true,
              },
              fields: [
                {
                  name: "tag",
                  type: "text",
                  required: true,
                  admin: {
                    description:
                      "Eyebrow tag shown above the title (e.g. 'PRIORITY 01 \u00b7 BUILD' or 'DELIBERATELY LATER').",
                  },
                },
                {
                  name: "title",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Bold headline for the card.",
                  },
                },
                {
                  name: "description",
                  type: "textarea",
                  required: true,
                  admin: {
                    description: "Body copy for the card (~2-3 sentences).",
                  },
                },
              ],
            },
            {
              name: "flightPlan",
              type: "richText",
              editor: proposalEditor,
              admin: {
                description:
                  "Editable flight plan content shown on the report. Supports bold, italic, underline, font size formatting. Falls back to suggestions if empty.",
              },
            },
            {
              name: "flightPlanImages",
              type: "array",
              maxRows: 10,
              admin: {
                description:
                  "Images displayed on the Flight Plan slide above the timeline. Add after the report is created.",
              },
              fields: [
                {
                  name: "image",
                  type: "upload",
                  relationTo: "media",
                  required: true,
                },
                {
                  name: "caption",
                  type: "text",
                  admin: {
                    description: "Optional caption for this image",
                  },
                },
              ],
            },
            {
              name: "flightPlanRecommendations",
              type: "array",
              admin: {
                description:
                  "Predefined recommendations for the Flight Plan slide. Enable each one to include it in the report.",
                initCollapsed: true,
              },
              defaultValue: DEFAULT_FLIGHT_PLAN_RECS,
              fields: [
                {
                  name: "enabled",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Include this recommendation in the Flight Plan slide",
                  },
                },
                {
                  name: "title",
                  type: "text",
                  required: true,
                },
                {
                  name: "description",
                  type: "textarea",
                },
                {
                  name: "benefit",
                  type: "text",
                  admin: {
                    description: "Short outcome statement (e.g. 'More leads from existing traffic')",
                  },
                },
              ],
            },
            {
              name: "contentResearchKeywords",
              type: "relationship",
              relationTo: "content-researches",
              hasMany: true,
              filterOptions: ({ id }) => ({
                proposal: { equals: id },
              }),
              admin: {
                isSortable: true,
                description:
                  "Select which content research keywords to show on the report. Leave empty to auto-select top 2 by search volume.",
              },
            },
            {
              name: "missionResourcesImages",
              type: "array",
              maxRows: 10,
              admin: {
                description:
                  "Images displayed on the Mission Resources slide. Additional images create extra slides.",
              },
              fields: [
                {
                  name: "image",
                  type: "upload",
                  relationTo: "media",
                  required: true,
                },
                {
                  name: "caption",
                  type: "text",
                  admin: {
                    description: "Optional caption for this image",
                  },
                },
              ],
            },
            {
              name: "missionResources",
              type: "richText",
              admin: {
                description:
                  "Content for the Mission Resources slide. Supports bold, italic, underline formatting.",
              },
            },
            {
              name: "launchRequirements",
              type: "richText",
              admin: {
                description:
                  "Content for the Launch Requirements slide. Supports bold, italic, underline formatting.",
              },
            },
            {
              name: "excludedCompetitorDomains",
              type: "json",
              admin: {
                description:
                  "Hides selected competitors from every slide they appear on: Competitor Analysis, Paid Burn, and Return Modelling.",
                components: {
                  Field: "./components/CompetitorExcluder",
                },
              },
            },
            {
              name: "hiddenKeywordCategories",
              type: "json",
              admin: {
                description:
                  "Hides selected keyword categories from every slide that lists them: Mission Brief (categories card), Keyword Landscape, and Organic Propulsion.",
                components: {
                  Field: "./components/KeywordCategoryExcluder",
                },
              },
            },
            {
              name: "excludedKeywords",
              type: "json",
              admin: {
                description:
                  "Keywords excluded from the report (managed via edit view). JSON array of keyword strings.",
              },
            },
            {
              name: "excludedContentQuestions",
              type: "json",
              admin: {
                description:
                  "Content research questions excluded from the report (managed via edit view). JSON array of question strings.",
              },
            },
            {
              name: "slideNotes",
              type: "json",
              admin: {
                description:
                  "Internal notes per slide (visible only in edit view). JSON object keyed by slide number.",
              },
            },
            {
              name: "roadmapTemplate",
              type: "select",
              defaultValue: "build-launch",
              options: [
                { label: "Build & Launch (5-stage, 10-12 weeks)", value: "build-launch" },
                { label: "Growth Retainer (4-stage, ongoing)", value: "growth-retainer" },
                { label: "Audit & Strategy (3-stage, 4-6 weeks)", value: "audit-strategy" },
                { label: "Custom", value: "custom" },
              ],
              admin: {
                description:
                  "Pick a template to seed default roadmap cells. Switch to 'Custom' to fully control via the array below.",
              },
            },
            {
              name: "roadmapMeta",
              type: "text",
              defaultValue: "~10-12 weeks total",
              admin: {
                description:
                  "Top-right meta text for the Roadmap slide (e.g. '~10-12 weeks total').",
              },
            },
            {
              name: "roadmapCells",
              type: "array",
              maxRows: 6,
              admin: {
                description:
                  "Each row becomes one cell in the roadmap grid. 5 cells fits cleanest; the grid auto-adjusts for 3-6.",
                initCollapsed: true,
              },
              defaultValue: ROADMAP_DEFAULTS.buildLaunch.map((c) => ({ ...c })),
              fields: [
                { name: "week", type: "text", required: true, admin: { description: "Eyebrow (e.g. 'WEEK 01' or 'PHASE 02')." } },
                { name: "step", type: "text", required: true, admin: { description: "Card title." } },
                { name: "body", type: "textarea", required: true, admin: { description: "1-2 sentence body. Keep generic — no client-specific terms unless overriding." } },
              ],
            },
            {
              name: "roadmapNote",
              type: "textarea",
              defaultValue:
                "The build phase is the longest stage, and the most important. Everything downstream (organic, paid, content) compounds against the foundation laid here.",
              admin: {
                description: "Small note shown under the roadmap grid.",
              },
            },
            {
              name: "commercialMeta",
              type: "text",
              defaultValue: "Subject to discovery",
              admin: {
                description: "Top-right meta text on the Commercial slide.",
              },
            },
            {
              name: "commercialPhases",
              type: "array",
              maxRows: 4,
              admin: {
                description:
                  "Each row becomes one pricing card. The current design is 2 cards; 3-4 cards auto-shrink to fit.",
                initCollapsed: true,
              },
              defaultValue: COMMERCIAL_DEFAULTS.map((p) => ({
                ...p,
                features: p.features.map((f) => ({ ...f })),
              })),
              fields: [
                { name: "tier", type: "text", required: true, admin: { description: "Eyebrow (e.g. 'PHASE 01')." } },
                { name: "name", type: "text", required: true, admin: { description: "Card name (e.g. 'Build & Launch')." } },
                { name: "amount", type: "text", required: true, admin: { description: "Price amount (e.g. 'TBC', '$12,500', '$2,500')." } },
                { name: "amountSub", type: "text", admin: { description: "Suffix (e.g. 'one-time', '/ month')." } },
                { name: "featured", type: "checkbox", defaultValue: false, admin: { description: "Apply the dark/feature card style." } },
                {
                  name: "features",
                  type: "array",
                  admin: { description: "Bullet list of inclusions (3-5 ideal)." },
                  fields: [{ name: "item", type: "text", required: true }],
                },
              ],
            },
            {
              name: "commercialNote",
              type: "textarea",
              defaultValue: "Final pricing confirmed after discovery.",
              admin: { description: "Small centred note below the cards." },
            },
            {
              name: "launchMeta",
              type: "text",
              defaultValue: "From proposal to wheels-up",
              admin: { description: "Top-right meta text on the Next Steps slide." },
            },
            {
              name: "launchSteps",
              type: "array",
              maxRows: 3,
              admin: {
                description: "Three step cards shown at the top of the Next Steps slide.",
                initCollapsed: true,
              },
              defaultValue: LAUNCH_STEPS_DEFAULTS.map((s) => ({ ...s })),
              fields: [
                { name: "stepLabel", type: "text", required: true, admin: { description: "Eyebrow (e.g. 'STEP 01')." } },
                { name: "title", type: "text", required: true },
                { name: "body", type: "textarea", required: true },
              ],
            },
            {
              name: "launchBlocks",
              type: "array",
              maxRows: 4,
              admin: {
                description: "Larger 'During Build' / 'Post Launch' blocks at the bottom of the slide.",
                initCollapsed: true,
              },
              defaultValue: LAUNCH_BLOCKS_DEFAULTS.map((b) => ({ ...b })),
              fields: [
                { name: "tag", type: "text", required: true, admin: { description: "Eyebrow (e.g. 'DURING BUILD')." } },
                { name: "title", type: "text", required: true, admin: { description: "Headline (single line)." } },
                { name: "body", type: "textarea", required: true },
              ],
            },
          ],
        },
        {
          label: "Contract",
          fields: [
            {
              name: "createContractButton",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/CreateContractButton",
                },
              },
            },
            {
              name: "contracts",
              type: "join",
              collection: "contracts",
              on: "proposal",
              admin: {
                description: "Contracts linked to this proposal",
                defaultColumns: ["contractTitle", "status", "contractDate", "createdAt"],
              },
            },
          ],
        },
      ],
    },
    {
      name: "proposalStatus",
      type: "select",
      defaultValue: "draft",
      admin: {
        position: "sidebar",
        description: "Current stage of this proposal",
      },
      options: [
        { label: "Draft", value: "draft" },
        { label: "Proposal Sent", value: "proposal_sent" },
        { label: "Proposal Presented", value: "proposal_presented" },
        { label: "Client (Accepted)", value: "client" },
        { label: "Declined", value: "declined" },
      ],
    },
    {
      name: "convertToClient",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description:
          "Toggle on and save to create an active Client from this proposal",
      },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      admin: {
        position: "sidebar",
        description: "Linked client (set automatically on conversion)",
        readOnly: true,
      },
    },
    {
      name: "proposalPin",
      type: "text",
      unique: true,
      admin: {
        position: "sidebar",
        description:
          "4-digit PIN for prospect report access (auto-generated)",
      },
      validate: async (value: string | null | undefined, { req, id }: any) => {
        if (!value) return true;
        if (!/^\d{4}$/.test(value)) return "PIN must be exactly 4 digits";
        try {
          const existing = await req.payload.find({
            collection: "client-proposals",
            where: {
              proposalPin: { equals: value },
              ...(id ? { id: { not_equals: id } } : {}),
            },
            limit: 1,
          });
          if (existing.totalDocs > 0) {
            return `PIN "${value}" is already in use by another proposal (${existing.docs[0].businessName}).`;
          }
        } catch { /* skip check if payload not available */ }
        return true;
      },
      hooks: {
        beforeChange: [
          async ({ value, operation, req }) => {
            if (operation === "create" && !value) {
              return generateUniquePin(req.payload);
            }
            return value;
          },
        ],
      },
    },
  ],
  hooks: {
    afterChange: [
      convertToClientHook,
      async ({ doc, operation, req, previousDoc }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "proposal_created",
            title: `New proposal: ${doc.businessName || doc.slug || "Untitled"}`,
            description: doc.websiteUrl || "",
            user: req.user?.id,
          }).catch(() => {});
        }

        // Sync: when proposal moves to "client", update linked sales lead stage
        // Fire-and-forget to avoid SQLite lock conflicts with the current save
        if (
          operation === "update" &&
          doc.proposalStatus === "client" &&
          previousDoc?.proposalStatus !== "client"
        ) {
          const syncPayload = req.payload;
          const docId = doc.id;
          setTimeout(async () => {
            try {
              const linkedLeads = await syncPayload.find({
                collection: "sales-leads" as any,
                where: { proposal: { equals: docId } },
                limit: 1,
                overrideAccess: true,
              });
              if (linkedLeads.totalDocs > 0) {
                const lead = linkedLeads.docs[0] as any;
                if (lead.stage !== "client") {
                  await syncPayload.update({
                    collection: "sales-leads" as any,
                    id: lead.id,
                    data: { stage: "client" },
                    overrideAccess: true,
                  });
                }
              }
            } catch {
              // Best effort
            }
          }, 500);
        }
      },
    ],
    beforeChange: [generateUniqueSlug],
    afterRead: [seedFlightPlanRecs, seedRoadmap, seedCommercial, seedLaunch],
  },
};
