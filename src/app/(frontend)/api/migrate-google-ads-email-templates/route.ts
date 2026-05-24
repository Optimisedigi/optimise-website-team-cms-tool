import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import crypto from "crypto";
import config from "@/payload.config";

function checkApiKey(request: NextRequest): NextResponse | null {
  const expected = Buffer.from(process.env.AUDIT_API_KEY ?? "");
  const got = Buffer.from(request.headers.get("x-api-key") ?? "");
  if (
    expected.length === 0 ||
    got.length !== expected.length ||
    !crypto.timingSafeEqual(got, expected)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const unauthorized = checkApiKey(request);
  if (unauthorized) return unauthorized;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const client = (payload.db as any).client;

  if (!client) {
    return NextResponse.json({ error: "No LibSQL client" }, { status: 500 });
  }

  const results: string[] = [];

  async function run(label: string, statement: string) {
    try {
      await client.execute(statement);
      results.push(`OK: ${label}`);
    } catch (err: any) {
      const message = err?.message || String(err);
      if (message.includes("already exists") || message.includes("duplicate column")) {
        results.push(`SKIP: ${label} (already exists)`);
        return;
      }
      results.push(`ERROR: ${label} — ${message}`);
    }
  }

  await run(
    "email_templates.google_ads_starter_subject_template",
    "ALTER TABLE `email_templates` ADD `google_ads_starter_subject_template` text"
  );
  await run(
    "email_templates.google_ads_starter_opening",
    "ALTER TABLE `email_templates` ADD `google_ads_starter_opening` text"
  );
  await run(
    "email_templates.google_ads_starter_questions_intro",
    "ALTER TABLE `email_templates` ADD `google_ads_starter_questions_intro` text"
  );
  await run(
    "email_templates.google_ads_starter_closing",
    "ALTER TABLE `email_templates` ADD `google_ads_starter_closing` text"
  );

  await run(
    "email_templates_google_ads_starter_readiness_fragments",
    `CREATE TABLE IF NOT EXISTS \`email_templates_google_ads_starter_readiness_fragments\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`slug\` text NOT NULL,
      \`copy\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`email_templates\`(\`id\`) ON DELETE CASCADE
    )`
  );
  await run(
    "email_templates_google_ads_starter_readiness_fragments_order_idx",
    "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_readiness_fragments_order_idx` ON `email_templates_google_ads_starter_readiness_fragments` (`_order`)"
  );
  await run(
    "email_templates_google_ads_starter_readiness_fragments_parent_id_idx",
    "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_readiness_fragments_parent_id_idx` ON `email_templates_google_ads_starter_readiness_fragments` (`_parent_id`)"
  );

  await run(
    "email_templates_google_ads_starter_goal_fragments",
    `CREATE TABLE IF NOT EXISTS \`email_templates_google_ads_starter_goal_fragments\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`slug\` text NOT NULL,
      \`copy\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`email_templates\`(\`id\`) ON DELETE CASCADE
    )`
  );
  await run(
    "email_templates_google_ads_starter_goal_fragments_order_idx",
    "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_goal_fragments_order_idx` ON `email_templates_google_ads_starter_goal_fragments` (`_order`)"
  );
  await run(
    "email_templates_google_ads_starter_goal_fragments_parent_id_idx",
    "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_goal_fragments_parent_id_idx` ON `email_templates_google_ads_starter_goal_fragments` (`_parent_id`)"
  );

  await run(
    "email_templates_google_ads_starter_website_fragments",
    `CREATE TABLE IF NOT EXISTS \`email_templates_google_ads_starter_website_fragments\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`slug\` text NOT NULL,
      \`copy\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`email_templates\`(\`id\`) ON DELETE CASCADE
    )`
  );
  await run(
    "email_templates_google_ads_starter_website_fragments_order_idx",
    "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_website_fragments_order_idx` ON `email_templates_google_ads_starter_website_fragments` (`_order`)"
  );
  await run(
    "email_templates_google_ads_starter_website_fragments_parent_id_idx",
    "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_website_fragments_parent_id_idx` ON `email_templates_google_ads_starter_website_fragments` (`_parent_id`)"
  );

  await run(
    "email_templates_google_ads_starter_budget_fragments",
    `CREATE TABLE IF NOT EXISTS \`email_templates_google_ads_starter_budget_fragments\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`slug\` text NOT NULL,
      \`copy\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`email_templates\`(\`id\`) ON DELETE CASCADE
    )`
  );
  await run(
    "email_templates_google_ads_starter_budget_fragments_order_idx",
    "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_budget_fragments_order_idx` ON `email_templates_google_ads_starter_budget_fragments` (`_order`)"
  );
  await run(
    "email_templates_google_ads_starter_budget_fragments_parent_id_idx",
    "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_budget_fragments_parent_id_idx` ON `email_templates_google_ads_starter_budget_fragments` (`_parent_id`)"
  );

  const errors = results.filter((result) => result.startsWith("ERROR:"));

  return NextResponse.json({
    ok: errors.length === 0,
    errors,
    results,
  });
}
