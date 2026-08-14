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
/**
 * Two markets, each with its own page and its own section layout. They are
 * separate audiences, not an experiment, which is exactly why the dashboard
 * shows them side by side rather than pooling them.
 */
const PAGES = [
  {
    pageId: "offshore-teams-au",
    market: "AU",
    sections: [
      { id: "hero", reach: 1.0, seconds: 9 },
      { id: "proof", reach: 0.82, seconds: 14 },
      { id: "how-it-works", reach: 0.61, seconds: 22 },
      { id: "pricing", reach: 0.44, seconds: 31 },
      { id: "faq", reach: 0.26, seconds: 17 },
      { id: "contact", reach: 0.18, seconds: 12 },
    ],
    sessions: 1295,
    rate: 0.052,
  },
  {
    pageId: "offshore-teams-us",
    market: "US",
    sections: [
      { id: "hero", reach: 1.0, seconds: 7 },
      { id: "case-studies", reach: 0.7, seconds: 19 },
      { id: "security", reach: 0.48, seconds: 26 },
      { id: "pricing", reach: 0.33, seconds: 24 },
      { id: "contact", reach: 0.12, seconds: 10 },
    ],
    sessions: 780,
    rate: 0.038,
  },
];

/** Mobile dominates paid traffic and converts worse, which is the point of the toggle. */
const DEVICES = [
  { id: "mobile", share: 0.62, conversionFactor: 0.72 },
  { id: "desktop", share: 0.31, conversionFactor: 1.55 },
  { id: "tablet", share: 0.07, conversionFactor: 0.9 },
];

function pickDevice() {
  const roll = Math.random();
  let cumulative = 0;
  for (const device of DEVICES) {
    cumulative += device.share;
    if (roll < cumulative) return device;
  }
  return DEVICES[DEVICES.length - 1];
}

const ARMS = {
  a: { weight: 0.5, rateFactor: 0.85, profile: "default" },
  b: { weight: 0.5, rateFactor: 1.15, profile: "hero-outcome" },
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

  for (const page of PAGES) {
    for (const [variant, arm] of Object.entries(ARMS)) {
      // Split each page's traffic across the two arms.
      const sessions = Math.round((page.sessions * arm.weight));
      for (let index = 0; index < sessions; index += 1) {
        const session = `${TAG}-${page.pageId}-${variant}-s${index}`;
        const pageView = `${TAG}-${page.pageId}-${variant}-pv${index}`;
        const at = new Date(
          now - Math.floor(Math.random() * DAYS_BACK) * 86400000 - Math.floor(Math.random() * 86400000)
        );
        const device = pickDevice();

        const base = { at, session, pageView, variant, page, device };
        const push = (type, props) =>
          rows.push({ eventId: `${TAG}-${crypto.randomUUID()}`, type, props: props ?? {}, ...base });

        push("page_view");

        // Mobile readers get through less of the page, which is what makes the
        // device toggle worth having rather than a decoration.
        const depthBonus = (variant === "b" ? 0.06 : 0) + (device.id === "desktop" ? 0.08 : -0.05);
        const seen = page.sections.filter((section) => Math.random() < Math.min(section.reach + depthBonus, 1));
        const reached = seen.length ? seen : [page.sections[0]];

        for (const section of reached) push("section_view", { section_id: section.id });
        for (const section of reached) {
          const jitter = 0.5 + Math.random() * 1.4;
          const dwellFactor = device.id === "mobile" ? 0.75 : 1;
          const activeMs = Math.round(section.seconds * 1000 * jitter * dwellFactor);
          if (activeMs >= 3000) push("section_engaged", { section_id: section.id, active_ms: 3000 });
          push("section_dwell", { section_id: section.id, active_ms: activeMs });
        }

        for (const [type, mean] of FUNNEL) {
          const count = Math.random() < mean % 1 ? Math.ceil(mean) : Math.floor(mean);
          for (let i = 0; i < count; i += 1) push(type);
        }

        const rate = page.rate * arm.rateFactor * device.conversionFactor;
        if (Math.random() < rate) {
          push("form_submit");
          push("booking_complete");
        }
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
           content_profile_id,route,page_id,market,referrer_class,device_class,attribution,properties,
           updated_at,created_at)
          VALUES (?,${PROPERTY_ID},${CLIENT_ID},?,?,?,?,?,?,'${EXPERIMENT_ID}',?,'1',?,?,?,?,?,?,?,?,?,?)`,
        args: [
          row.eventId,
          row.type,
          iso(row.at),
          iso(row.at),
          row.session,
          row.pageView,
          `${TAG}-v-${row.session}`,
          row.variant,
          ARMS[row.variant].profile,
          `/${row.page.pageId}.html`,
          row.page.pageId,
          row.page.market,
          ["search", "paid", "direct"][Math.floor(Math.random() * 3)],
          row.device.id,
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
