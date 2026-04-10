import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { MarkdownPasteFeature } from "./lib/markdown-paste-feature";
import { vercelBlobStorage } from "@payloadcms/storage-vercel-blob";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { Users } from "./collections/Users";
import { Media } from "./collections/Media";
import { Clients } from "./collections/Clients";
import { ClientProposals } from "./collections/ClientProposals";
import { BlogPosts } from "./collections/BlogPosts";
import { SeoAudits } from "./collections/SeoAudits";
import { CroAudits } from "./collections/CroAudits";
import { KeywordSnapshots } from "./collections/KeywordSnapshots";
import { CompetitorAnalyses } from "./collections/CompetitorAnalyses";
import { JobPosts } from "./collections/JobPosts";
import { UsageReports } from "./collections/UsageReports";
import { ContentResearches } from "./collections/ContentResearches";
import { GscSnapshots } from "./collections/GscSnapshots";
import { GscAlerts } from "./collections/GscAlerts";
import { ActivityLog } from "./collections/ActivityLog";
import { CostCategories } from "./collections/CostCategories";
import { CostRules } from "./collections/CostRules";
import { BusinessCosts } from "./collections/BusinessCosts";
import { BlogPrompts } from "./collections/BlogPrompts";
import { GoogleAdsAudits } from "./collections/GoogleAdsAudits";
import { GoogleAdsCampaignBudgets } from "./collections/GoogleAdsCampaignBudgets";
// Temporarily disabled: import { GoogleAdsAdExtensions } from "./collections/GoogleAdsAdExtensions";
import { GscDaily } from "./collections/GscDaily";
import { GscIndexingAudits } from "./collections/GscIndexingAudits";
import { InternalLinkSuggestions } from "./collections/InternalLinkSuggestions";
import { NegativeSweepCandidates } from "./collections/NegativeSweepCandidates";
import { NegativeKeywordLists } from "./collections/NegativeKeywordLists";
import { Contracts } from "./collections/Contracts";
import { SalesLeads } from "./collections/SalesLeads";
import { ProcessTemplates } from "./collections/ProcessTemplates";
import { ClientProcesses } from "./collections/ClientProcesses";
import { TagSetupAudits } from "./collections/TagSetupAudits";
import { SiteHealthReports } from "./collections/SiteHealthReports";
import { ApiCostRates } from "./globals/ApiCostRates";
import { SheetsAuth } from "./globals/SheetsAuth";
import { EmailTemplates } from "./globals/EmailTemplates";
import { CalendarAuth } from "./globals/CalendarAuth";
import { MeetingSchedulers } from "./collections/MeetingSchedulers";
import { ClientTimelineTemplates } from "./collections/ClientTimelineTemplates";
import { ClientTimelines } from "./collections/ClientTimelines";


const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  i18n: {
    translations: {
      en: {
        general: {
          welcome: "Welcome to a new world of growth",
        },
      },
    },
  },
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: " | Optimise Digital",
      icons: [{ url: "/optimise-digital-favicon.png" }],
    },
    components: {
      graphics: {
        Logo: "./components/Logo",
        Icon: "./components/Icon",
      },
      actions: ["./components/UserDisplayName"],
      beforeNavLinks: ["./components/SidebarLogo"],
      afterNavLinks: ["./components/SidebarNavExtras"],
      afterLogin: ["./components/ShowPasswordToggle"],
      providers: ["./components/ViewportMeta", "./components/RocketLoader", "./components/FirstLoginSetup", "./components/NavigationRecovery", "./components/MiniSidebar", "./components/PomodoroTimer"],
      beforeDashboard: ["./components/Dashboard"],
    },
  },
  collections: [
    // Clients
    Clients, ClientProposals, Contracts, SalesLeads, ProcessTemplates, ClientProcesses, MeetingSchedulers, ClientTimelineTemplates, ClientTimelines,
    // Content
    BlogPosts, BlogPrompts, JobPosts, Media,
    // SEO
    InternalLinkSuggestions,
    // Audits
    SeoAudits, CroAudits, GoogleAdsAudits, TagSetupAudits, KeywordSnapshots, CompetitorAnalyses, ContentResearches, GscAlerts, GscIndexingAudits, NegativeSweepCandidates, NegativeKeywordLists, SiteHealthReports,
    // Finance
    BusinessCosts, CostCategories, CostRules,
    // Admin
    Users, UsageReports, ActivityLog,
    // Hidden (no group impact)
    GscSnapshots, GscDaily, 
    // Temporarily disabled: GoogleAdsCampaignBudgets, GoogleAdsAdExtensions,
  ].map((c) => ({
    ...c,
    admin: {
      ...c.admin,
      pagination: {
        ...c.admin?.pagination,
        defaultLimit: c.admin?.pagination?.defaultLimit ?? 25,
      },
    },
  })),
  globals: [SheetsAuth, CalendarAuth, ApiCostRates, EmailTemplates],
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [...defaultFeatures, MarkdownPasteFeature()],
  }),
  secret: (() => {
    const s = process.env.PAYLOAD_SECRET;
    if (!s) throw new Error("PAYLOAD_SECRET environment variable is required");
    return s;
  })(),
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || "file:./content.db",
      ...(process.env.DATABASE_AUTH_TOKEN
        ? { authToken: process.env.DATABASE_AUTH_TOKEN }
        : {}),
    },
    push: false,
  }),
  sharp,
  plugins: [
    ...(process.env.BLOB_READ_WRITE_TOKEN
      ? [
          vercelBlobStorage({
            collections: { media: true },
            token: process.env.BLOB_READ_WRITE_TOKEN,
          }),
        ]
      : []),
  ],
});
