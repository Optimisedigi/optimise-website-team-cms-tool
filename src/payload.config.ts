import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { Users } from "./collections/Users";
import { Media } from "./collections/Media";
import { Clients } from "./collections/Clients";
import { BlogPosts } from "./collections/BlogPosts";
import { SeoAudits } from "./collections/SeoAudits";
import { JobPosts } from "./collections/JobPosts";

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
      providers: ["./components/FirstLoginSetup"],
      beforeDashboard: ["./components/DashboardWelcome"],
    },
  },
  collections: [Users, Clients, BlogPosts, JobPosts, SeoAudits, Media],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || "your-super-secret-key-change-in-production",
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
  }),
  sharp,
  plugins: [],
});
