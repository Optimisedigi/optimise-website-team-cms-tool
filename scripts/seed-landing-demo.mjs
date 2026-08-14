#!/usr/bin/env node
/**
 * Seed realistic landing A/B data so the dashboard can be demonstrated and
 * reviewed without waiting for real traffic.
 *
 * This script writes thousands of rows, so it refuses to run against anything
 * other than a local file database. That guard exists because an earlier
 * ad-hoc version of this script parsed `.env` directly while the dev server
 * resolves `.env.local` first, and quietly wrote 9,915 fake events into
 * production. The guard resolves the database the same way the dev server
 * does, and fails closed on anything it does not recognise as local.
 *
 * Usage:
 *   node scripts/seed-landing-demo.mjs          # seed
 *   node scripts/seed-landing-demo.mjs --clear  # remove seeded rows only
 */

import { createClient } from "@libsql/client";
import crypto from "node:crypto";
import { requireLocalDatabase } from "../src/lib/dev-database-guard.ts";

/** Every seeded row carries this prefix, so cleanup can never touch real traffic. */
const TAG = "demo-seed";

const CLIENT_ID = 6;
const PROPERTY_ID = 1;
const EXPERIMENT_ID = "landing-hero-v1";

/**
 * A modest, believable difference rather than a flattering one. The point of
 * the demo is to show the dashboard refusing to call a result it cannot
 * support, which a fantasy uplift would hide.
 */
const ARMS = {
  a: { sessions: 640, rate: 0.041, profile: "default" },
  b: { sessions: 655, rate: 0.058, profile: "hero-outcome" },
};

/**
 * Sections in page order, with the share of sessions that reach each one and
 * the seconds a reader typically spends there. Attention falls as people move
 * down the page, which is what makes a drop-off point visible at all.
 */
const SECTIONS = [
  { id: "hero", reach: 1.0, seconds: 9 },
  { id: "proof", reach: 0.82, seconds: 14 },
  { id: "how-it-works", reach: 0.61, seconds: 22 },
  { id: "pricing", reach: 0.44, seconds: 31 },
  { id: "faq", reach: 0.26, seconds: 17 },
  { id: "contact", reach: 0.18, seconds: 12 },
];

const FUNNEL = [
  ["scroll_depth", 1.9],
  ["cta_click", 0.55],
  ["form_start", 0.28],
  ["form_step", 0.42],
  ["form_error", 0.07],
  ["booking_open", 0.14],
];

const DAYS_BACK = 21;

function iso(date) {
  return date.toISOString();
}

async function clear(db) {
  const before = await db.execute("SELECT COUNT(*) c FROM landing_events");
  const deleted = await db.execute({
    sql: "DELETE FROM landing_events WHERE event_id LIKE ?",
    args: [`${TAG}-%`],
  });
  const after = await db.execute("SELECT COUNT(*) c FROM landing_events");
  console.log(
    `landing_events: ${before.rows[0].c} -> ${after.rows[0].c} (removed ${deleted.rowsAffected} seeded rows)`
  );
}

async function ensureConfig(db) {
  await db.execute(`INSERT OR IGNORE INTO landing_properties
    (id,name,client_id,property_key,status,consent_version,retention_days,updated_at,created_at)
    VALUES (${PROPERTY_ID},'Away Digital Teams — Landing',${CLIENT_ID},
            'away-digital-lp-45d726441e9fc0e1','active','2026-08-14',90,
            datetime('now'),datetime('now'))`);

  await db.execute(`INSERT OR IGNORE INTO landing_experiments
    (id,name,client_id,experiment_id,status,allocation_version,primary_goal,started_at,updated_at,created_at)
    VALUES (1,'Hero headline — capability vs outcome',${CLIENT_ID},'${EXPERIMENT_ID}',
            'running','1','booking_complete',datetime('now','-${DAYS_BACK} days'),
            datetime('now'),datetime('now'))`);

  const variants = [
    [1, "a", "Built-in hero (control)", "default"],
    [2, "b", "Outcome-led hero", "hero-outcome"],
  ];
  for (const [order, id, label, profile] of variants) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO landing_experiments_variants
            (_order,_parent_id,id,variant_id,label,weight,content_profile_id)
            VALUES (?,1,?,?,?,50,?)`,
      args: [order, `var-${id}`, id, label, profile],
    });
  }

  await db.execute(`UPDATE landing_properties SET active_experiment_id=1 WHERE id=${PROPERTY_ID}`);
}

function buildEvents() {
  const rows = [];
  const now = Date.now();

  for (const [variant, config] of Object.entries(ARMS)) {
    for (let index = 0; index < config.sessions; index += 1) {
      const session = `${TAG}-${variant}-s${index}`;
      const pageView = `${TAG}-${variant}-pv${index}`;
      const at = new Date(
        now - Math.floor(Math.random() * DAYS_BACK) * 86400000 - Math.floor(Math.random() * 86400000)
      );

      const push = (type) =>
        rows.push({ eventId: `${TAG}-${crypto.randomUUID()}`, type, at, session, pageView, variant, config, props: {} });

      push("page_view");

      // How far down the page this session got. Variant B holds attention
      // slightly longer, so the funnel and the dwell table tell one story.
      const depthBonus = variant === "b" ? 0.06 : 0;
      const seen = SECTIONS.filter((section) => Math.random() < Math.min(section.reach + depthBonus, 1));
      const reached = seen.length ? seen : [SECTIONS[0]];

      for (const section of reached) {
        rows.push({ eventId: `${TAG}-${crypto.randomUUID()}`, type: "section_view", at, session, pageView, variant, config, props: { section_id: section.id } });
      }
      // Dwell is reported as the page is left, so it comes after every view.
      for (const section of reached) {
        const jitter = 0.5 + Math.random() * 1.4;
        const activeMs = Math.round(section.seconds * 1000 * jitter);
        if (activeMs >= 3000) {
          rows.push({ eventId: `${TAG}-${crypto.randomUUID()}`, type: "section_engaged", at, session, pageView, variant, config, props: { section_id: section.id, active_ms: 3000 } });
        }
        rows.push({ eventId: `${TAG}-${crypto.randomUUID()}`, type: "section_dwell", at, session, pageView, variant, config, props: { section_id: section.id, active_ms: activeMs } });
      }

      for (const [type, mean] of FUNNEL) {
        const count = Math.random() < mean % 1 ? Math.ceil(mean) : Math.floor(mean);
        for (let i = 0; i < count; i += 1) push(type);
      }
      // A converting session fires both, the way the real funnel does.
      if (Math.random() < config.rate) {
        push("form_submit");
        push("booking_complete");
      }
    }
  }
  return rows;
}

async function seed(db) {
  const existing = await db.execute("SELECT COUNT(*) c FROM landing_events");
  if (Number(existing.rows[0].c) > 0) {
    console.error(
      `landing_events already holds ${existing.rows[0].c} rows. Run with --clear first, or inspect them before seeding.`
    );
    process.exit(1);
  }

  await ensureConfig(db);

  const rows = buildEvents();
  console.log(`inserting ${rows.length} events...`);

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.batch(
      rows.slice(i, i + CHUNK).map((row) => ({
        sql: `INSERT INTO landing_events
          (event_id,property_id,client_id,event_type,occurred_at,received_at,session_id,
           page_view_id,visitor_id,experiment_id,variant_id,allocation_version,
           content_profile_id,route,referrer_class,device_class,attribution,properties,
           updated_at,created_at)
          VALUES (?,${PROPERTY_ID},${CLIENT_ID},?,?,?,?,?,?,'${EXPERIMENT_ID}',?,'1',?,'/index.html',?,?,?,?,?,?)`,
        args: [
          row.eventId,
          row.type,
          iso(row.at),
          iso(row.at),
          row.session,
          row.pageView,
          `${TAG}-v-${row.session}`,
          row.variant,
          row.config.profile,
          ["search", "paid", "direct"][Math.floor(Math.random() * 3)],
          Math.random() < 0.62 ? "mobile" : "desktop",
          JSON.stringify({ utm_source: "google", utm_medium: "cpc", ad_group_id: "111" }),
          JSON.stringify(row.props ?? {}),
          iso(row.at),
          iso(row.at),
        ],
      })),
      "write"
    );
  }

  const summary = await db.execute(
    "SELECT variant_id, COUNT(DISTINCT session_id) s, SUM(event_type='booking_complete') c FROM landing_events GROUP BY variant_id"
  );
  console.log("seeded:");
  for (const row of summary.rows) {
    console.log(`  ${row.variant_id}: ${row.s} sessions, ${row.c} bookings (${((row.c / row.s) * 100).toFixed(2)}%)`);
  }
}

async function main() {
  // Nothing below this line may run against a remote database.
  const resolved = requireLocalDatabase();
  console.log(`✓ local database confirmed: ${resolved.url}`);

  const db = createClient({ url: resolved.url });
  if (process.argv.includes("--clear")) await clear(db);
  else await seed(db);
}

await main();
