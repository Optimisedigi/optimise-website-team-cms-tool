/**
 * Runs the 2026-05-15 contract-reminders schema additions directly against
 * the configured DATABASE_URL (currently prod Turso).
 *
 * Idempotent — uses CREATE TABLE / INDEX IF NOT EXISTS and tolerates the
 * `ALTER TABLE ADD COLUMN` failing if the column already exists.
 *
 * Mirrors the SQL block in src/lib/run-migrations.ts (search:
 * "Contract annual-review reminders (2026-05-15)").
 *
 * Run with: `npx tsx scripts/run-contract-reminders-migration.ts`
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  console.log(`DB: ${url}\n`);

  const results: string[] = [];

  async function run(label: string, sql: string): Promise<void> {
    try {
      await db.execute(sql);
      results.push(`OK    ${label}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("already exists") || msg.includes("duplicate column")) {
        results.push(`SKIP  ${label}  (already exists)`);
      } else {
        results.push(`ERROR ${label}: ${msg}`);
      }
    }
  }

  // 1. contracts.annual_review_reminder_enabled
  await run(
    "contracts.annual_review_reminder_enabled",
    "ALTER TABLE `contracts` ADD `annual_review_reminder_enabled` integer DEFAULT 1",
  );

  // 2. contracts_rels (hasMany users on contracts.annualReviewReminderRecipients)
  await run(
    "contracts_rels",
    `CREATE TABLE IF NOT EXISTS \`contracts_rels\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`order\` integer,
      \`parent_id\` integer NOT NULL,
      \`path\` text NOT NULL,
      \`users_id\` integer,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`contracts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`,
  );
  await run(
    "contracts_rels_order_idx",
    "CREATE INDEX IF NOT EXISTS `contracts_rels_order_idx` ON `contracts_rels` (`order`)",
  );
  await run(
    "contracts_rels_parent_idx",
    "CREATE INDEX IF NOT EXISTS `contracts_rels_parent_idx` ON `contracts_rels` (`parent_id`)",
  );
  await run(
    "contracts_rels_path_idx",
    "CREATE INDEX IF NOT EXISTS `contracts_rels_path_idx` ON `contracts_rels` (`path`)",
  );
  await run(
    "contracts_rels_users_idx",
    "CREATE INDEX IF NOT EXISTS `contracts_rels_users_id_idx` ON `contracts_rels` (`users_id`)",
  );

  // 3. contract_reminders
  await run(
    "contract_reminders",
    `CREATE TABLE IF NOT EXISTS \`contract_reminders\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`contract_id\` integer NOT NULL,
      \`kind\` text NOT NULL,
      \`send_at\` text NOT NULL,
      \`status\` text NOT NULL DEFAULT 'pending',
      \`sent_at\` text,
      \`last_error\` text,
      \`notes\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`contract_id\`) REFERENCES \`contracts\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`,
  );
  await run(
    "contract_reminders_contract_idx",
    "CREATE INDEX IF NOT EXISTS `contract_reminders_contract_idx` ON `contract_reminders` (`contract_id`)",
  );
  await run(
    "contract_reminders_status_idx",
    "CREATE INDEX IF NOT EXISTS `contract_reminders_status_idx` ON `contract_reminders` (`status`)",
  );
  await run(
    "contract_reminders_send_at_idx",
    "CREATE INDEX IF NOT EXISTS `contract_reminders_send_at_idx` ON `contract_reminders` (`send_at`)",
  );
  await run(
    "contract_reminders_status_send_at_idx",
    "CREATE INDEX IF NOT EXISTS `contract_reminders_status_send_at_idx` ON `contract_reminders` (`status`, `send_at`)",
  );

  // 4. contract_reminders_rels (hasMany users on contract_reminders.recipients)
  await run(
    "contract_reminders_rels",
    `CREATE TABLE IF NOT EXISTS \`contract_reminders_rels\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`order\` integer,
      \`parent_id\` integer NOT NULL,
      \`path\` text NOT NULL,
      \`users_id\` integer,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`contract_reminders\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`,
  );
  await run(
    "contract_reminders_rels_order_idx",
    "CREATE INDEX IF NOT EXISTS `contract_reminders_rels_order_idx` ON `contract_reminders_rels` (`order`)",
  );
  await run(
    "contract_reminders_rels_parent_idx",
    "CREATE INDEX IF NOT EXISTS `contract_reminders_rels_parent_idx` ON `contract_reminders_rels` (`parent_id`)",
  );
  await run(
    "contract_reminders_rels_path_idx",
    "CREATE INDEX IF NOT EXISTS `contract_reminders_rels_path_idx` ON `contract_reminders_rels` (`path`)",
  );
  await run(
    "contract_reminders_rels_users_idx",
    "CREATE INDEX IF NOT EXISTS `contract_reminders_rels_users_id_idx` ON `contract_reminders_rels` (`users_id`)",
  );

  // 5. notifications
  await run(
    "notifications",
    `CREATE TABLE IF NOT EXISTS \`notifications\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`recipient_id\` integer NOT NULL,
      \`kind\` text NOT NULL,
      \`title\` text NOT NULL,
      \`body\` text,
      \`url\` text,
      \`related_contract_id\` integer,
      \`related_client_id\` integer,
      \`read_at\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`recipient_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`related_contract_id\`) REFERENCES \`contracts\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`related_client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`,
  );
  await run(
    "notifications_recipient_idx",
    "CREATE INDEX IF NOT EXISTS `notifications_recipient_idx` ON `notifications` (`recipient_id`)",
  );
  await run(
    "notifications_read_at_idx",
    "CREATE INDEX IF NOT EXISTS `notifications_read_at_idx` ON `notifications` (`read_at`)",
  );
  await run(
    "notifications_recipient_read_at_idx",
    "CREATE INDEX IF NOT EXISTS `notifications_recipient_read_at_idx` ON `notifications` (`recipient_id`, `read_at`)",
  );
  await run(
    "notifications_created_at_idx",
    "CREATE INDEX IF NOT EXISTS `notifications_created_at_idx` ON `notifications` (`created_at`)",
  );

  // 6. payload_locked_documents_rels FKs
  await run(
    "payload_locked_documents_rels.contract_reminders_id",
    "ALTER TABLE `payload_locked_documents_rels` ADD `contract_reminders_id` integer REFERENCES `contract_reminders`(`id`) ON DELETE cascade",
  );
  await run(
    "payload_locked_documents_rels.notifications_id",
    "ALTER TABLE `payload_locked_documents_rels` ADD `notifications_id` integer REFERENCES `notifications`(`id`) ON DELETE cascade",
  );

  for (const r of results) console.log(r);
  console.log("\n\u2713 Done");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
