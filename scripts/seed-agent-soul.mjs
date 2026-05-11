/**
 * One-off: seed the agent_soul table with Optimate's starter voice
 * guidelines. Idempotent — uses INSERT ... ON CONFLICT DO UPDATE so it's
 * safe to re-run.
 *
 * Usage:
 *   node scripts/seed-agent-soul.mjs                   # uses Turso prod
 *   node scripts/seed-agent-soul.mjs --local           # uses local SQLite
 *
 * Reads DATABASE_URL + DATABASE_AUTH_TOKEN from .env.
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

// Tiny .env parser so we don't pull dotenv just for this.
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

const useLocal = process.argv.includes("--local");
const url = useLocal
  ? "file:./content-cms.db"
  : process.env.DATABASE_URL;
const authToken = useLocal ? undefined : process.env.DATABASE_AUTH_TOKEN;

if (!url) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const client = createClient({ url, authToken });

const SOUL_SEED = [
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

async function run() {
  const env = useLocal ? "local SQLite" : "Turso production";
  console.log(`Seeding agent_soul → ${env}`);

  // Sanity check: table must exist (otherwise migration didn't run).
  try {
    await client.execute("SELECT 1 FROM agent_soul LIMIT 1");
  } catch (err) {
    console.error(
      `agent_soul table not found. Did you run the migration?\n  ${err.message}`,
    );
    process.exit(1);
  }

  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;

  for (const row of SOUL_SEED) {
    // Manual upsert because Payload's auto-id constraints differ across
    // SQLite drivers; safer than ON CONFLICT for portability.
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

  console.log(`\nDone. ${created} created, ${updated} updated.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
