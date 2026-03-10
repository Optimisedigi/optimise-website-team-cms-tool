/**
 * Seed script for ProcessTemplates collection.
 *
 * Creates default process templates for every retainer type.
 * Each template defines the full lifecycle from lead generation
 * through ongoing management.
 *
 * Usage:
 *   await seedAllProcessTemplates(payload);
 */

// -- Shared phase builders ------------------------------------------------

function leadGenPhase() {
  return {
    phaseName: "Lead Generation",
    phaseOrder: 1,
    phaseDescription: "Identify and capture new prospects",
    steps: [
      {
        stepName: "Prospect identified",
        stepOrder: 1,
        stepDescription:
          "New lead enters the pipeline via referral, inbound enquiry, or outreach.",
        stepType: "milestone" as const,
        isAutomatable: true,
        automationNotes:
          "Auto-create from website form submission or CRM integration",
        defaultAssignee: "founder" as const,
        estimatedDuration: "N/A",
        requiredBeforeNext: true,
      },
      {
        stepName: "Initial contact",
        stepOrder: 2,
        stepDescription:
          "Reach out to prospect with intro email or phone call. Log in CRM.",
        stepType: "communication" as const,
        isAutomatable: false,
        defaultAssignee: "founder" as const,
        emailTemplateSubject: "Introduction - Optimise Digital",
        emailTemplateBody:
          "Hi {{name}},\n\nThanks for getting in touch. I'd love to learn more about your business and how we can help.\n\nAre you free for a quick call this week?\n\nCheers,\n{{sender}}",
        estimatedDuration: "15 mins",
        requiredBeforeNext: true,
      },
    ],
  };
}

function qualificationPhase(opts: {
  briefAnalysisDesc: string;
  deepDiveDesc: string;
}) {
  return {
    phaseName: "Qualification & Proposal",
    phaseOrder: 2,
    phaseDescription:
      "Qualify the lead, run audits, and deliver a proposal",
    steps: [
      {
        stepName: "Discovery call",
        stepOrder: 1,
        stepDescription:
          "Understand the prospect's goals, budget, timeline, and current setup.",
        stepType: "communication" as const,
        isAutomatable: false,
        defaultAssignee: "founder" as const,
        estimatedDuration: "30 mins",
        requiredBeforeNext: true,
      },
      {
        stepName: "Send brief analysis",
        stepOrder: 2,
        stepDescription: opts.briefAnalysisDesc,
        stepType: "communication" as const,
        isAutomatable: true,
        automationNotes:
          "Auto-generate and email audit report from CMS",
        defaultAssignee: "strategist" as const,
        emailTemplateSubject: "Your Brief Analysis - Optimise Digital",
        emailTemplateBody:
          "Hi {{name}},\n\nPlease find your brief analysis attached. Happy to walk through the findings.\n\nCheers,\n{{sender}}",
        estimatedDuration: "1 hour",
        requiredBeforeNext: false,
      },
      {
        stepName: "Proposal creation",
        stepOrder: 3,
        stepDescription:
          "Build a tailored proposal with scope, pricing, and timeline.",
        stepType: "action" as const,
        isAutomatable: false,
        defaultAssignee: "founder" as const,
        estimatedDuration: "2 hours",
        requiredBeforeNext: true,
      },
      {
        stepName: "Send proposal",
        stepOrder: 4,
        stepDescription:
          "Deliver the PIN-protected proposal to the prospect.",
        stepType: "communication" as const,
        isAutomatable: true,
        automationNotes: "Auto-send proposal link with PIN via CMS",
        defaultAssignee: "founder" as const,
        emailTemplateSubject: "Your Proposal - Optimise Digital",
        emailTemplateBody:
          "Hi {{name}},\n\nHere is your proposal: {{link}}\nPIN: {{pin}}\n\nLooking forward to discussing.\n\nCheers,\n{{sender}}",
        estimatedDuration: "15 mins",
        requiredBeforeNext: true,
      },
      {
        stepName: "Deep dive",
        stepOrder: 5,
        stepDescription: opts.deepDiveDesc,
        stepType: "action" as const,
        isAutomatable: true,
        automationNotes: "Trigger full audit pipeline from CMS",
        defaultAssignee: "strategist" as const,
        estimatedDuration: "3 hours",
        requiredBeforeNext: false,
      },
      {
        stepName: "Follow up and close",
        stepOrder: 6,
        stepDescription:
          "Follow up on the proposal, address objections, and close the deal.",
        stepType: "communication" as const,
        isAutomatable: false,
        defaultAssignee: "founder" as const,
        emailTemplateSubject: "Following Up - Optimise Digital",
        emailTemplateBody:
          "Hi {{name}},\n\nJust checking in on the proposal. Any questions or feedback?\n\nCheers,\n{{sender}}",
        estimatedDuration: "30 mins",
        requiredBeforeNext: true,
      },
    ],
  };
}

function onboardingPhase(opts?: { discoveryDesc?: string }) {
  const discoveryDescription =
    opts?.discoveryDesc ||
    "Deep-dive into the client's business, goals, KPIs, and current marketing setup.";
  return {
    phaseName: "Onboarding",
    phaseOrder: 3,
    phaseDescription:
      "Welcome the client and gather everything needed to start",
    steps: [
      {
        stepName: "Send welcome pack",
        stepOrder: 1,
        stepDescription:
          "Send onboarding email with welcome pack, timelines, and next steps.",
        stepType: "communication" as const,
        isAutomatable: true,
        automationNotes: "Auto-send welcome email template on contract sign",
        defaultAssignee: "account_manager" as const,
        emailTemplateSubject: "Welcome to Optimise Digital",
        emailTemplateBody:
          "Hi {{name}},\n\nWelcome aboard! Attached is your welcome pack with everything you need to get started.\n\nCheers,\n{{sender}}",
        estimatedDuration: "15 mins",
        requiredBeforeNext: true,
      },
      {
        stepName: "Contract and payment setup",
        stepOrder: 2,
        stepDescription:
          "Finalise and sign the contract. Set up recurring billing.",
        stepType: "action" as const,
        isAutomatable: false,
        defaultAssignee: "founder" as const,
        estimatedDuration: "1 hour",
        requiredBeforeNext: true,
      },
      {
        stepName: "Onboarding discovery session",
        stepOrder: 3,
        stepDescription: discoveryDescription,
        stepType: "communication" as const,
        isAutomatable: false,
        defaultAssignee: "strategist" as const,
        estimatedDuration: "1 hour",
        requiredBeforeNext: true,
      },
      {
        stepName: "Internal kickoff",
        stepOrder: 4,
        stepDescription:
          "Brief the internal team on the client, scope, and responsibilities.",
        stepType: "action" as const,
        isAutomatable: false,
        defaultAssignee: "founder" as const,
        estimatedDuration: "30 mins",
        requiredBeforeNext: false,
      },
      {
        stepName: "Set up client in CMS",
        stepOrder: 5,
        stepDescription:
          "Create client record, link proposal, and configure dashboards.",
        stepType: "action" as const,
        isAutomatable: true,
        automationNotes:
          "Auto-create client record on proposal conversion",
        defaultAssignee: "account_manager" as const,
        estimatedDuration: "15 mins",
        requiredBeforeNext: true,
      },
    ],
  };
}

// -- Template definitions -------------------------------------------------

interface TemplateDefinition {
  name: string;
  slug: string;
  retainerType: string;
  description: string;
  isDefault: boolean;
  phases: any[];
}

function fullIntegrationTemplate(): TemplateDefinition {
  return {
    name: "Full Integration",
    slug: "full-integration",
    retainerType: "full_integration",
    description:
      "Complete digital marketing retainer covering SEO, Google Ads, Meta Ads, website, and analytics.",
    isDefault: true,
    phases: [
      leadGenPhase(),
      qualificationPhase({
        briefAnalysisDesc:
          "Run a brief SEO, CRO, and Google Ads analysis and send findings to the prospect.",
        deepDiveDesc:
          "Run full SEO, CRO, keyword, competitor, content, and Google Ads deep dive audits.",
      }),
      onboardingPhase(),
      {
        phaseName: "Execution",
        phaseOrder: 4,
        phaseDescription:
          "Deliver the core setup work across all channels",
        steps: [
          {
            stepName: "Gather all access",
            stepOrder: 1,
            stepDescription:
              "Collect credentials and access for Google Ads, Analytics, GSC, Meta, CMS, and hosting.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "1 day",
            requiredBeforeNext: true,
          },
          {
            stepName: "Google Ads account audit and setup",
            stepOrder: 2,
            stepDescription:
              "Full account audit, campaign restructure, conversion tracking, and optimisation.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: false,
          },
          {
            stepName: "SEO technical audit and fixes",
            stepOrder: 3,
            stepDescription:
              "Technical SEO audit, on-page fixes, schema markup, and site speed improvements.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: false,
          },
          {
            stepName: "Content strategy and keyword mapping",
            stepOrder: 4,
            stepDescription:
              "Map target keywords to pages, identify content gaps, and build a content calendar.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "3 days",
            requiredBeforeNext: false,
          },
          {
            stepName: "Meta Ads campaign setup",
            stepOrder: 5,
            stepDescription:
              "Set up Meta Ads campaigns, audiences, creatives, and conversion tracking.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: false,
          },
          {
            stepName: "Analytics and tracking setup",
            stepOrder: 6,
            stepDescription:
              "Configure GA4, GTM, conversion goals, and cross-channel attribution.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "2 days",
            requiredBeforeNext: false,
          },
          {
            stepName: "Enable CMS automations",
            stepOrder: 7,
            stepDescription:
              "Enable GSC monitoring, Google Ads automations, and alerts in the CMS.",
            stepType: "automated" as const,
            isAutomatable: true,
            automationNotes:
              "Toggle monitoring and alert features per client in CMS settings",
            defaultAssignee: "system" as const,
            estimatedDuration: "15 mins",
            requiredBeforeNext: false,
          },
        ],
      },
      {
        phaseName: "Ongoing",
        phaseOrder: 5,
        phaseDescription:
          "Continuous optimisation and reporting across all channels",
        steps: [
          {
            stepName: "Weekly campaign optimisations",
            stepOrder: 1,
            stepDescription:
              "Review and optimise Google Ads and Meta Ads campaigns weekly.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "2 hours",
            requiredBeforeNext: false,
          },
          {
            stepName: "Monthly SEO optimisations",
            stepOrder: 2,
            stepDescription:
              "On-page updates, new content, link building, and technical fixes.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 day",
            requiredBeforeNext: false,
          },
          {
            stepName: "Monthly performance report",
            stepOrder: 3,
            stepDescription:
              "Compile cross-channel performance report covering Ads, SEO, and analytics.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-generate report from CMS dashboards and GSC data",
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "2 hours",
            requiredBeforeNext: true,
          },
          {
            stepName: "Monthly client meeting",
            stepOrder: 4,
            stepDescription:
              "Present the report, discuss results, and align on next month's priorities.",
            stepType: "communication" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 hour",
            requiredBeforeNext: true,
          },
          {
            stepName: "Action items and next steps",
            stepOrder: 5,
            stepDescription:
              "Document action items from the meeting and update the process tracker.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-create action items from meeting notes via AI",
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "30 mins",
            requiredBeforeNext: false,
          },
        ],
      },
    ],
  };
}

function googleAdsOnlyTemplate(): TemplateDefinition {
  return {
    name: "Google Ads Only",
    slug: "google-ads-only",
    retainerType: "google_ads_only",
    description:
      "Google Ads management retainer covering account audit, campaign setup, and ongoing optimisation.",
    isDefault: false,
    phases: [
      leadGenPhase(),
      qualificationPhase({
        briefAnalysisDesc:
          "Run a brief Google Ads audit and send findings to the prospect.",
        deepDiveDesc:
          "Run a comprehensive Google Ads deep dive audit covering account structure, keywords, ads, and conversions.",
      }),
      onboardingPhase(),
      {
        phaseName: "Execution",
        phaseOrder: 4,
        phaseDescription:
          "Audit and set up Google Ads campaigns for performance",
        steps: [
          {
            stepName: "Gather access",
            stepOrder: 1,
            stepDescription:
              "Request MCC access to the client's Google Ads account and Analytics.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "1 day",
            requiredBeforeNext: true,
          },
          {
            stepName: "Google Ads account audit and checklist",
            stepOrder: 2,
            stepDescription:
              "Full account audit covering structure, keywords, ads, extensions, conversions, and billing.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Trigger Google Ads audit from CMS with MCC access",
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: true,
          },
          {
            stepName: "Campaign setup and restructure",
            stepOrder: 3,
            stepDescription:
              "Restructure campaigns, ad groups, keywords, and ads based on audit findings.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: true,
          },
          {
            stepName: "Enable Google Ads automations in CMS",
            stepOrder: 4,
            stepDescription:
              "Enable automated bid adjustments, alerts, and performance tracking in CMS.",
            stepType: "automated" as const,
            isAutomatable: true,
            automationNotes:
              "Toggle Google Ads monitoring and automation features per client",
            defaultAssignee: "system" as const,
            estimatedDuration: "15 mins",
            requiredBeforeNext: false,
          },
        ],
      },
      {
        phaseName: "Ongoing",
        phaseOrder: 5,
        phaseDescription:
          "Continuous Google Ads optimisation and reporting",
        steps: [
          {
            stepName: "Weekly and monthly campaign optimisations",
            stepOrder: 1,
            stepDescription:
              "Review search terms, adjust bids, pause underperformers, and test new ads.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "2 hours",
            requiredBeforeNext: false,
          },
          {
            stepName: "Monthly Google Ads performance report",
            stepOrder: 2,
            stepDescription:
              "Compile Google Ads performance report with spend, conversions, CPA, and ROAS.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-generate Google Ads report from CMS data",
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "1 hour",
            requiredBeforeNext: true,
          },
          {
            stepName: "Monthly client meeting",
            stepOrder: 3,
            stepDescription:
              "Present the report, discuss campaign performance, and plan next steps.",
            stepType: "communication" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 hour",
            requiredBeforeNext: true,
          },
          {
            stepName: "Action items",
            stepOrder: 4,
            stepDescription:
              "Document action items and update the process tracker.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-create action items from meeting notes via AI",
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "15 mins",
            requiredBeforeNext: false,
          },
        ],
      },
    ],
  };
}

function seoOnlyTemplate(): TemplateDefinition {
  return {
    name: "SEO Only",
    slug: "seo-only",
    retainerType: "seo_only",
    description:
      "SEO management retainer covering technical audits, content strategy, and ongoing optimisation.",
    isDefault: false,
    phases: [
      leadGenPhase(),
      qualificationPhase({
        briefAnalysisDesc:
          "Run a brief SEO audit and send findings to the prospect.",
        deepDiveDesc:
          "Run a full SEO audit with content gap analysis, keyword research, and competitor benchmarking.",
      }),
      onboardingPhase(),
      {
        phaseName: "Execution",
        phaseOrder: 4,
        phaseDescription:
          "Deliver the technical and strategic SEO foundation",
        steps: [
          {
            stepName: "Gather access to GSC, Analytics, and CMS",
            stepOrder: 1,
            stepDescription:
              "Request access to Google Search Console, GA4, and the client's CMS or hosting.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "1 day",
            requiredBeforeNext: true,
          },
          {
            stepName: "Technical SEO audit and fixes",
            stepOrder: 2,
            stepDescription:
              "Crawl the site, fix indexing issues, improve site speed, add schema markup, and resolve errors.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: true,
          },
          {
            stepName: "Content strategy and keyword mapping",
            stepOrder: 3,
            stepDescription:
              "Map target keywords to existing and new pages. Build a content calendar based on gaps.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "3 days",
            requiredBeforeNext: true,
          },
          {
            stepName: "On-page optimisation",
            stepOrder: 4,
            stepDescription:
              "Optimise title tags, meta descriptions, headings, internal links, and content for target keywords.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: false,
          },
          {
            stepName: "Enable GSC monitoring and alerts",
            stepOrder: 5,
            stepDescription:
              "Connect GSC via OAuth, enable automated snapshots, and configure alerts in CMS.",
            stepType: "automated" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-connect GSC and enable cron-based monitoring per client",
            defaultAssignee: "system" as const,
            estimatedDuration: "15 mins",
            requiredBeforeNext: false,
          },
        ],
      },
      {
        phaseName: "Ongoing",
        phaseOrder: 5,
        phaseDescription:
          "Continuous SEO improvements and content delivery",
        steps: [
          {
            stepName: "Monthly SEO optimisations",
            stepOrder: 1,
            stepDescription:
              "Technical fixes, on-page updates, internal linking, and backlink outreach.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 day",
            requiredBeforeNext: false,
          },
          {
            stepName: "Content creation and publishing",
            stepOrder: 2,
            stepDescription:
              "Write, review, and publish SEO content per the content calendar.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: false,
          },
          {
            stepName: "Monthly GSC and traffic report",
            stepOrder: 3,
            stepDescription:
              "Compile a report with organic traffic, rankings, clicks, impressions, and GSC alerts.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-generate SEO report from GSC snapshot data in CMS",
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "1 hour",
            requiredBeforeNext: true,
          },
          {
            stepName: "Monthly client meeting",
            stepOrder: 4,
            stepDescription:
              "Present SEO results, discuss rankings and traffic, and align on content priorities.",
            stepType: "communication" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 hour",
            requiredBeforeNext: true,
          },
          {
            stepName: "Action items",
            stepOrder: 5,
            stepDescription:
              "Document action items and update the process tracker.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-create action items from meeting notes via AI",
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "15 mins",
            requiredBeforeNext: false,
          },
        ],
      },
    ],
  };
}

function metaAdsOnlyTemplate(): TemplateDefinition {
  return {
    name: "Meta Ads Only",
    slug: "meta-ads-only",
    retainerType: "meta_ads_only",
    description:
      "Meta Ads management retainer covering campaign setup, creative strategy, and ongoing optimisation.",
    isDefault: false,
    phases: [
      leadGenPhase(),
      qualificationPhase({
        briefAnalysisDesc:
          "Run a brief Meta Ads audit and send findings to the prospect.",
        deepDiveDesc:
          "Run a comprehensive Meta Ads deep dive audit covering account structure, audiences, creatives, and tracking.",
      }),
      onboardingPhase(),
      {
        phaseName: "Execution",
        phaseOrder: 4,
        phaseDescription:
          "Set up Meta Ads campaigns and conversion tracking",
        steps: [
          {
            stepName: "Gather access to Meta Business and pixel",
            stepOrder: 1,
            stepDescription:
              "Request partner access to Meta Business Manager, ad accounts, and the Meta pixel.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "1 day",
            requiredBeforeNext: true,
          },
          {
            stepName: "Creative asset collection",
            stepOrder: 2,
            stepDescription:
              "Gather brand assets, photos, videos, copy guidelines, and existing creatives from the client.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "3 days",
            requiredBeforeNext: true,
          },
          {
            stepName: "Campaign setup and audience targeting",
            stepOrder: 3,
            stepDescription:
              "Build campaigns with audiences, placements, budgets, creatives, and ad copy.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: true,
          },
          {
            stepName: "Conversion tracking setup",
            stepOrder: 4,
            stepDescription:
              "Install or verify the Meta pixel, set up custom conversions, and test event tracking.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "2 days",
            requiredBeforeNext: true,
          },
        ],
      },
      {
        phaseName: "Ongoing",
        phaseOrder: 5,
        phaseDescription:
          "Continuous Meta Ads optimisation and creative testing",
        steps: [
          {
            stepName: "Campaign optimisations",
            stepOrder: 1,
            stepDescription:
              "Review performance, adjust budgets, refine audiences, and pause underperforming ads.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "2 hours",
            requiredBeforeNext: false,
          },
          {
            stepName: "Creative refresh and testing",
            stepOrder: 2,
            stepDescription:
              "Design new ad creatives, run A/B tests, and rotate messaging.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "3 hours",
            requiredBeforeNext: false,
          },
          {
            stepName: "Monthly performance report and client meeting",
            stepOrder: 3,
            stepDescription:
              "Compile Meta Ads performance report and present results to the client.",
            stepType: "communication" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-generate Meta Ads report from platform data",
            defaultAssignee: "strategist" as const,
            estimatedDuration: "2 hours",
            requiredBeforeNext: true,
          },
          {
            stepName: "Action items",
            stepOrder: 4,
            stepDescription:
              "Document action items and update the process tracker.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-create action items from meeting notes via AI",
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "15 mins",
            requiredBeforeNext: false,
          },
        ],
      },
    ],
  };
}

function websiteBuildOnlyTemplate(): TemplateDefinition {
  return {
    name: "Website Build Only",
    slug: "website-build-only",
    retainerType: "website_build_only",
    description:
      "Website design and development project from scoping through launch and handover.",
    isDefault: false,
    phases: [
      leadGenPhase(),
      qualificationPhase({
        briefAnalysisDesc:
          "Run a brief CRO and UX review and send findings to the prospect.",
        deepDiveDesc:
          "Run a full website scope including sitemap, wireframes, and technical requirements.",
      }),
      onboardingPhase({
        discoveryDesc:
          "Deep-dive into the client's brand, content, sitemap, design preferences, and project goals.",
      }),
      {
        phaseName: "Execution",
        phaseOrder: 4,
        phaseDescription: "Design, build, and launch the website",
        steps: [
          {
            stepName: "Design mockups and approval",
            stepOrder: 1,
            stepDescription:
              "Create homepage and key page mockups. Present to the client for feedback and approval.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: true,
          },
          {
            stepName: "Development sprint",
            stepOrder: 2,
            stepDescription:
              "Build the approved designs into a fully functional website with responsive layouts.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "2 weeks",
            requiredBeforeNext: true,
          },
          {
            stepName: "Content migration and creation",
            stepOrder: 3,
            stepDescription:
              "Migrate existing content or create new copy, images, and media for all pages.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: true,
          },
          {
            stepName: "SEO foundation setup",
            stepOrder: 4,
            stepDescription:
              "Set up title tags, meta descriptions, sitemap, robots.txt, schema markup, and redirects.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "2 days",
            requiredBeforeNext: false,
          },
          {
            stepName: "Testing and QA",
            stepOrder: 5,
            stepDescription:
              "Cross-browser testing, mobile testing, performance checks, and bug fixes.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "3 days",
            requiredBeforeNext: true,
          },
          {
            stepName: "Launch and handover",
            stepOrder: 6,
            stepDescription:
              "Deploy to production, configure DNS, verify analytics, and hand over access to the client.",
            stepType: "milestone" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "1 day",
            requiredBeforeNext: true,
          },
        ],
      },
      {
        phaseName: "Ongoing",
        phaseOrder: 5,
        phaseDescription:
          "Post-launch review and handoff",
        steps: [
          {
            stepName: "30-day post-launch review",
            stepOrder: 1,
            stepDescription:
              "Review site performance, fix any post-launch issues, and check analytics are tracking.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "2 hours",
            requiredBeforeNext: true,
          },
          {
            stepName: "Training and documentation",
            stepOrder: 2,
            stepDescription:
              "Train the client on CMS usage and provide documentation for content updates.",
            stepType: "communication" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "2 hours",
            requiredBeforeNext: true,
          },
          {
            stepName: "Maintenance handoff or retainer discussion",
            stepOrder: 3,
            stepDescription:
              "Discuss ongoing maintenance needs and upsell into a retainer if appropriate.",
            stepType: "communication" as const,
            isAutomatable: false,
            defaultAssignee: "founder" as const,
            emailTemplateSubject: "Website Maintenance - Next Steps",
            emailTemplateBody:
              "Hi {{name}},\n\nYour website is live and performing well. Let's discuss ongoing maintenance options.\n\nCheers,\n{{sender}}",
            estimatedDuration: "30 mins",
            requiredBeforeNext: false,
          },
        ],
      },
    ],
  };
}

function websiteSeoTemplate(): TemplateDefinition {
  return {
    name: "Website + SEO",
    slug: "website-seo",
    retainerType: "website_seo",
    description:
      "Website build with ongoing SEO management. Combines design, development, and search optimisation.",
    isDefault: false,
    phases: [
      leadGenPhase(),
      qualificationPhase({
        briefAnalysisDesc:
          "Run a brief CRO, UX, and SEO review and send findings to the prospect.",
        deepDiveDesc:
          "Run full website scope with wireframes plus an SEO audit with content gap analysis.",
      }),
      onboardingPhase({
        discoveryDesc:
          "Deep-dive into the client's brand, content, sitemap, SEO goals, and target keywords.",
      }),
      {
        phaseName: "Execution",
        phaseOrder: 4,
        phaseDescription:
          "Build the website and establish the SEO foundation",
        steps: [
          {
            stepName: "Gather access to GSC, Analytics, and hosting",
            stepOrder: 1,
            stepDescription:
              "Request access to Google Search Console, GA4, hosting, and any existing CMS.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "1 day",
            requiredBeforeNext: true,
          },
          {
            stepName: "Design mockups and approval",
            stepOrder: 2,
            stepDescription:
              "Create homepage and key page mockups. Present for client feedback and approval.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: true,
          },
          {
            stepName: "Development sprint",
            stepOrder: 3,
            stepDescription:
              "Build the approved designs with SEO best practices baked into the code.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "2 weeks",
            requiredBeforeNext: true,
          },
          {
            stepName: "Content creation and on-page SEO",
            stepOrder: 4,
            stepDescription:
              "Write keyword-optimised copy for all pages, set up title tags, meta descriptions, and schema.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: true,
          },
          {
            stepName: "Testing, QA, and launch",
            stepOrder: 5,
            stepDescription:
              "Cross-browser testing, performance checks, deploy to production, and verify tracking.",
            stepType: "milestone" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "3 days",
            requiredBeforeNext: true,
          },
          {
            stepName: "Enable GSC monitoring and alerts",
            stepOrder: 6,
            stepDescription:
              "Connect GSC via OAuth, enable automated snapshots, and configure alerts in CMS.",
            stepType: "automated" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-connect GSC and enable cron-based monitoring per client",
            defaultAssignee: "system" as const,
            estimatedDuration: "15 mins",
            requiredBeforeNext: false,
          },
        ],
      },
      {
        phaseName: "Ongoing",
        phaseOrder: 5,
        phaseDescription:
          "Continuous SEO optimisation and content delivery post-launch",
        steps: [
          {
            stepName: "Monthly SEO optimisations",
            stepOrder: 1,
            stepDescription:
              "Technical fixes, on-page updates, internal linking, and backlink outreach.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 day",
            requiredBeforeNext: false,
          },
          {
            stepName: "Content creation and publishing",
            stepOrder: 2,
            stepDescription:
              "Write, review, and publish SEO content per the content calendar.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: false,
          },
          {
            stepName: "Monthly GSC and traffic report",
            stepOrder: 3,
            stepDescription:
              "Compile a report with organic traffic, rankings, clicks, impressions, and GSC alerts.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-generate SEO report from GSC snapshot data in CMS",
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "1 hour",
            requiredBeforeNext: true,
          },
          {
            stepName: "Monthly client meeting",
            stepOrder: 4,
            stepDescription:
              "Present results, discuss rankings and traffic, and align on content priorities.",
            stepType: "communication" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 hour",
            requiredBeforeNext: true,
          },
          {
            stepName: "Action items",
            stepOrder: 5,
            stepDescription:
              "Document action items and update the process tracker.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-create action items from meeting notes via AI",
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "15 mins",
            requiredBeforeNext: false,
          },
        ],
      },
    ],
  };
}

function websiteSeoGoogleAdsTemplate(): TemplateDefinition {
  return {
    name: "Website + SEO + Google Ads",
    slug: "website-seo-google-ads",
    retainerType: "website_seo_google_ads",
    description:
      "Full build plus SEO and Google Ads management. Website design, search optimisation, and paid search campaigns.",
    isDefault: false,
    phases: [
      leadGenPhase(),
      qualificationPhase({
        briefAnalysisDesc:
          "Run a brief CRO, SEO, and Google Ads review and send findings to the prospect.",
        deepDiveDesc:
          "Run full website scope, SEO audit with content gap analysis, and Google Ads deep dive audit.",
      }),
      onboardingPhase({
        discoveryDesc:
          "Deep-dive into the client's brand, content, sitemap, SEO goals, target keywords, and Google Ads history.",
      }),
      {
        phaseName: "Execution",
        phaseOrder: 4,
        phaseDescription:
          "Build the website, set up SEO, and launch Google Ads campaigns",
        steps: [
          {
            stepName: "Gather all access",
            stepOrder: 1,
            stepDescription:
              "Request access to Google Ads (MCC), GSC, GA4, hosting, and any existing CMS.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "1 day",
            requiredBeforeNext: true,
          },
          {
            stepName: "Design mockups and approval",
            stepOrder: 2,
            stepDescription:
              "Create homepage and key page mockups. Present for client feedback and approval.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: true,
          },
          {
            stepName: "Development sprint",
            stepOrder: 3,
            stepDescription:
              "Build the approved designs with SEO best practices and conversion-optimised landing pages.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "2 weeks",
            requiredBeforeNext: true,
          },
          {
            stepName: "Content creation and on-page SEO",
            stepOrder: 4,
            stepDescription:
              "Write keyword-optimised copy, set up title tags, meta descriptions, schema, and landing page content.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: true,
          },
          {
            stepName: "Testing, QA, and launch",
            stepOrder: 5,
            stepDescription:
              "Cross-browser testing, performance checks, deploy, verify tracking, and go live.",
            stepType: "milestone" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "3 days",
            requiredBeforeNext: true,
          },
          {
            stepName: "Google Ads account audit and campaign setup",
            stepOrder: 6,
            stepDescription:
              "Audit existing account (if any), restructure campaigns, set up conversion tracking, and launch ads.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: true,
          },
          {
            stepName: "Enable CMS automations",
            stepOrder: 7,
            stepDescription:
              "Enable GSC monitoring, Google Ads automations, and alerts in the CMS.",
            stepType: "automated" as const,
            isAutomatable: true,
            automationNotes:
              "Toggle monitoring and automation features per client in CMS settings",
            defaultAssignee: "system" as const,
            estimatedDuration: "15 mins",
            requiredBeforeNext: false,
          },
        ],
      },
      {
        phaseName: "Ongoing",
        phaseOrder: 5,
        phaseDescription:
          "Combined SEO and Google Ads optimisation with unified reporting",
        steps: [
          {
            stepName: "Monthly SEO optimisations",
            stepOrder: 1,
            stepDescription:
              "Technical fixes, on-page updates, content publishing, and backlink outreach.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 day",
            requiredBeforeNext: false,
          },
          {
            stepName: "Weekly Google Ads optimisations",
            stepOrder: 2,
            stepDescription:
              "Review search terms, adjust bids, pause underperformers, and test new ads.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "2 hours",
            requiredBeforeNext: false,
          },
          {
            stepName: "Monthly combined performance report",
            stepOrder: 3,
            stepDescription:
              "Compile a unified report covering SEO rankings, organic traffic, and Google Ads performance.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-generate combined report from GSC and Google Ads data in CMS",
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "2 hours",
            requiredBeforeNext: true,
          },
          {
            stepName: "Monthly client meeting",
            stepOrder: 4,
            stepDescription:
              "Present combined results, discuss performance across channels, and plan next steps.",
            stepType: "communication" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 hour",
            requiredBeforeNext: true,
          },
          {
            stepName: "Action items",
            stepOrder: 5,
            stepDescription:
              "Document action items and update the process tracker.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Auto-create action items from meeting notes via AI",
            defaultAssignee: "account_manager" as const,
            estimatedDuration: "15 mins",
            requiredBeforeNext: false,
          },
        ],
      },
    ],
  };
}

function aiAutomationsTemplate(): TemplateDefinition {
  return {
    name: "AI Automations",
    slug: "ai-automations",
    retainerType: "ai_automations",
    description:
      "AI and automation consulting retainer covering process audits, automation builds, and ongoing optimisation.",
    isDefault: false,
    phases: [
      leadGenPhase(),
      qualificationPhase({
        briefAnalysisDesc:
          "Run a brief process audit and send initial automation opportunities to the prospect.",
        deepDiveDesc:
          "Run a full automation opportunity mapping across the client's business processes.",
      }),
      onboardingPhase(),
      {
        phaseName: "Execution",
        phaseOrder: 4,
        phaseDescription:
          "Design, build, and deploy automations",
        steps: [
          {
            stepName: "Process documentation",
            stepOrder: 1,
            stepDescription:
              "Document current manual processes, workflows, and pain points to be automated.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "3 days",
            requiredBeforeNext: true,
          },
          {
            stepName: "Automation design and architecture",
            stepOrder: 2,
            stepDescription:
              "Design the automation flows, select tools and integrations, and define success criteria.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "3 days",
            requiredBeforeNext: true,
          },
          {
            stepName: "Build and test automations",
            stepOrder: 3,
            stepDescription:
              "Develop the automations, run test scenarios, and validate outputs against expected results.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "2 weeks",
            requiredBeforeNext: true,
          },
          {
            stepName: "Integration and deployment",
            stepOrder: 4,
            stepDescription:
              "Connect automations to the client's systems, deploy to production, and verify end-to-end.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "1 week",
            requiredBeforeNext: true,
          },
          {
            stepName: "Training",
            stepOrder: 5,
            stepDescription:
              "Train the client's team on how the automations work, how to monitor them, and when to escalate.",
            stepType: "communication" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "2 hours",
            requiredBeforeNext: true,
          },
        ],
      },
      {
        phaseName: "Ongoing",
        phaseOrder: 5,
        phaseDescription:
          "Monitor, optimise, and expand automations",
        steps: [
          {
            stepName: "Monitor and optimise automations",
            stepOrder: 1,
            stepDescription:
              "Track automation performance, fix failures, and improve efficiency.",
            stepType: "action" as const,
            isAutomatable: true,
            automationNotes:
              "Set up automated error alerts and performance dashboards",
            defaultAssignee: "developer" as const,
            estimatedDuration: "2 hours",
            requiredBeforeNext: false,
          },
          {
            stepName: "Monthly review and new opportunities",
            stepOrder: 2,
            stepDescription:
              "Review automation metrics with the client and identify new processes to automate.",
            stepType: "communication" as const,
            isAutomatable: false,
            defaultAssignee: "strategist" as const,
            estimatedDuration: "1 hour",
            requiredBeforeNext: true,
          },
          {
            stepName: "Maintenance and updates",
            stepOrder: 3,
            stepDescription:
              "Apply updates, handle API changes, and maintain integrations.",
            stepType: "action" as const,
            isAutomatable: false,
            defaultAssignee: "developer" as const,
            estimatedDuration: "2 hours",
            requiredBeforeNext: false,
          },
        ],
      },
    ],
  };
}

// -- Seed functions -------------------------------------------------------

/**
 * Seed the default "Full Integration" process template.
 * Checks for existing slug to avoid duplicates.
 */
export async function seedDefaultProcessTemplate(payload: any): Promise<void> {
  const template = fullIntegrationTemplate();
  await upsertTemplate(payload, template);
}

/**
 * Seed all process templates for every retainer type.
 * Calls seedDefaultProcessTemplate first (Full Integration),
 * then seeds all additional templates. Checks slug before creating
 * to avoid duplicates.
 */
export async function seedAllProcessTemplates(payload: any): Promise<void> {
  // 1. Full Integration (default)
  await seedDefaultProcessTemplate(payload);

  // 2. All other retainer-specific templates
  const templates: TemplateDefinition[] = [
    googleAdsOnlyTemplate(),
    seoOnlyTemplate(),
    metaAdsOnlyTemplate(),
    websiteBuildOnlyTemplate(),
    websiteSeoTemplate(),
    websiteSeoGoogleAdsTemplate(),
    aiAutomationsTemplate(),
  ];

  for (const template of templates) {
    await upsertTemplate(payload, template);
  }
}

/**
 * Create a template if its slug does not already exist.
 */
async function upsertTemplate(
  payload: any,
  template: TemplateDefinition,
): Promise<void> {
  const existing = await payload.find({
    collection: "process-templates",
    where: { slug: { equals: template.slug } },
    limit: 1,
    overrideAccess: true,
  });

  if (existing.totalDocs > 0) {
    console.log(
      `[seed] Template "${template.name}" (${template.slug}) already exists, skipping.`,
    );
    return;
  }

  await payload.create({
    collection: "process-templates",
    data: {
      name: template.name,
      slug: template.slug,
      retainerType: template.retainerType,
      description: template.description,
      isDefault: template.isDefault,
      isActive: true,
      phases: template.phases,
    },
    overrideAccess: true,
  });

  console.log(
    `[seed] Created template: "${template.name}" (${template.slug})`,
  );
}
