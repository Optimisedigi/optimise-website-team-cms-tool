/**
 * One-off: create agent_memory + agent_soul tables directly in Turso,
 * then seed soul. Bypasses /api/migrate.
 *
 * Idempotent — uses CREATE TABLE IF NOT EXISTS, ADD COLUMN wrapped in
 * try/catch, INSERT/UPDATE upsert by aspect.
 *
 * Usage: node scripts/seed-agent-memory-tables.mjs
 * Reads DATABASE_URL + DATABASE_AUTH_TOKEN from .env.
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env", import.meta.url), "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[3];
    }
  } catch {
    /* no .env, fine */
  }
}
loadEnv();

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;
if (!url) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}
const client = createClient({ url, authToken });

async function safe(label, sql) {
  try {
    await client.execute(sql);
    console.log(`  OK   ${label}`);
  } catch (err) {
    const msg = err.message ?? String(err);
    if (msg.includes("already exists") || msg.includes("duplicate column")) {
      console.log(`  SKIP ${label} (already exists)`);
    } else {
      console.log(`  ERR  ${label}: ${msg}`);
    }
  }
}

async function run() {
  console.log("Creating agent_memory + agent_soul tables in Turso...");

  // --- agent_memory ---
  await safe(
    "agent_memory",
    `CREATE TABLE IF NOT EXISTS \`agent_memory\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`scope\` text NOT NULL DEFAULT 'client',
      \`client_id\` integer,
      \`category\` text NOT NULL,
      \`subject\` text NOT NULL,
      \`content\` text NOT NULL,
      \`importance\` integer DEFAULT 50,
      \`last_accessed_at\` text,
      \`created_by_id\` integer,
      \`agent_run_id\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`,
  );
  await safe("agent_memory_scope_idx", "CREATE INDEX IF NOT EXISTS `agent_memory_scope_idx` ON `agent_memory` (`scope`)");
  await safe("agent_memory_client_idx", "CREATE INDEX IF NOT EXISTS `agent_memory_client_idx` ON `agent_memory` (`client_id`)");
  await safe("agent_memory_subject_idx", "CREATE INDEX IF NOT EXISTS `agent_memory_subject_idx` ON `agent_memory` (`subject`)");
  await safe(
    "agent_memory_dedupe_idx",
    "CREATE INDEX IF NOT EXISTS `agent_memory_dedupe_idx` ON `agent_memory` (`scope`, `client_id`, `subject`)",
  );
  await safe(
    "agent_memory_importance_idx",
    "CREATE INDEX IF NOT EXISTS `agent_memory_importance_idx` ON `agent_memory` (`importance`)",
  );

  // --- agent_soul ---
  await safe(
    "agent_soul",
    `CREATE TABLE IF NOT EXISTS \`agent_soul\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`aspect\` text NOT NULL,
      \`content\` text NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`,
  );
  await safe(
    "agent_soul_aspect_idx",
    "CREATE UNIQUE INDEX IF NOT EXISTS `agent_soul_aspect_idx` ON `agent_soul` (`aspect`)",
  );

  // --- payload_locked_documents_rels FK columns ---
  await safe(
    "locked_docs_rels.agent_memory_id",
    "ALTER TABLE `payload_locked_documents_rels` ADD `agent_memory_id` integer REFERENCES `agent_memory`(`id`) ON DELETE cascade",
  );
  await safe(
    "locked_docs_rels.agent_soul_id",
    "ALTER TABLE `payload_locked_documents_rels` ADD `agent_soul_id` integer REFERENCES `agent_soul`(`id`) ON DELETE cascade",
  );

  console.log("\nSeeding agent_soul rows...");
  const SOUL = [
    {
      aspect: "tone",
      content:
        "Casual, fun, sharp. Talk like a clued-up coworker, not a corporate help-desk. Direct beats polite. Skip 'I'd be happy to', 'absolutely', 'great question'. Get to the point fast.",
    },
    {
      aspect: "formatting",
      content:
        "Lead with the answer. Numbers + the tool you got them from in parentheses, e.g. '$1,240 spent (get_campaign_performance)'. Short paragraphs. Bullets for lists, not for pairs. Tables only when comparing 3+ rows.",
    },
    {
      aspect: "brand-voice",
      content:
        "We're Optimise Digital. Confident, plain-English, occasional dry wit. No buzzwords ('synergy', 'leverage', 'unlock potential'). No emoji unless the user uses one first.",
    },
    {
      aspect: "pacing-style",
      content:
        "If a question is one sentence, the answer is usually one paragraph. Don't pad. Don't recap what the user just said. If you need more info, ask one tight question — not a list of five.",
    },
    {
      aspect: "uncertainty",
      content:
        "When you don't know, say so plainly: 'No data on that — want me to pull it?' or 'I'd guess X but I haven't checked.' Never invent numbers, never paper over a missing tool result.",
    },
    {
      aspect: "proposals",
      content:
        "When queueing an approval, say what you're proposing in one line, then why (with the supporting numbers), then end with 'Queued approval #<id> — review at /agent-approvals/<id>'. Don't apologise for queueing — that's the design.",
    },
    {
      aspect: "errors",
      content:
        "When a tool errors or returns nothing useful, say what failed and what you tried, then ask the user how to proceed. Don't fabricate a fallback. 'Search-terms tool returned empty for last 7 days — want me to widen to 30?' beats inventing a guess.",
    },
  ];

  const now = new Date().toISOString();
  let created = 0,
    updated = 0;
  for (const row of SOUL) {
    const existing = await client.execute({
      sql: "SELECT id FROM agent_soul WHERE aspect = ? LIMIT 1",
      args: [row.aspect],
    });
    if (existing.rows.length > 0) {
      await client.execute({
        sql: "UPDATE agent_soul SET content = ?, updated_at = ? WHERE id = ?",
        args: [row.content, now, existing.rows[0].id],
      });
      updated += 1;
      console.log(`  updated  ${row.aspect}`);
    } else {
      await client.execute({
        sql: "INSERT INTO agent_soul (aspect, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
        args: [row.aspect, row.content, now, now],
      });
      created += 1;
      console.log(`  created  ${row.aspect}`);
    }
  }

  console.log(`\nDone. ${created} soul rows created, ${updated} updated.`);
  console.log("Tables ready. agent-memory + agent-soul will work in the admin UI now.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
