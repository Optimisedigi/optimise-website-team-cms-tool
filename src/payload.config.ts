import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
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
import { GscDaily } from "./collections/GscDaily";
import { GscIndexingAudits } from "./collections/GscIndexingAudits";
import { InternalLinkSuggestions } from "./collections/InternalLinkSuggestions";
import { NegativeSweepCandidates } from "./collections/NegativeSweepCandidates";
import { Contracts } from "./collections/Contracts";
import { ApiCostRates } from "./globals/ApiCostRates";
import { SheetsAuth } from "./globals/SheetsAuth";


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
      providers: ["./components/RocketLoader", "./components/FirstLoginSetup", "./components/NavigationRecovery", "./components/MiniSidebar", "./components/PomodoroTimer"],
      beforeDashboard: ["./components/Dashboard"],
    },
  },
  collections: [
    // Clients
    Clients, ClientProposals, Contracts,
    // Content
    BlogPosts, BlogPrompts, JobPosts, Media,
    // SEO
    InternalLinkSuggestions,
    // Audits
    SeoAudits, CroAudits, GoogleAdsAudits, KeywordSnapshots, CompetitorAnalyses, ContentResearches, GscAlerts, GscIndexingAudits, NegativeSweepCandidates,
    // Finance
    BusinessCosts, CostCategories, CostRules,
    // Admin
    Users, UsageReports, ActivityLog,
    // Hidden (no group impact)
    GscSnapshots, GscDaily,
  ],
  globals: [SheetsAuth, ApiCostRates],
  editor: lexicalEditor(),
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
