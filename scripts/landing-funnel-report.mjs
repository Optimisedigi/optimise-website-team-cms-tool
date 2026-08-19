#!/usr/bin/env node
/**
 * Read-only funnel report for one client's landing pages, printed to stdout.
 *
 * The dashboard route (/api/dashboard/landing-experiments) answers the same
 * questions behind a PIN, but needs a browser session. This is the same data
 * for someone working on the page itself: which sections get seen, where the
 * scroll stops, which CTAs get clicked, and how that differs by device.
 *
 * Read-only by construction: `readOnly` refuses any statement that is not a
 * SELECT/WITH, and every caller goes through it. That guard is not decoration —
 * this points at production traffic, where a stray write would corrupt the only
 * record of it.
 *
 * The pieces are exported so tests can drive them against a local file
 * database; the CLI runs only when this file is executed directly.
 *
 * Usage:
 *   node --env-file=.env scripts/landing-funnel-report.mjs [--client 6] [--days 30] [--page offshore-teams-au] [--json]
 */

import { createClient } from "@libsql/client";
import { pathToFileURL } from "node:url";

export const DEFAULT_CLIENT_ID = 6;
export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 365;

/**
 * Parse CLI flags, rejecting anything that would silently produce a wrong
 * report. `--client foo` yielding NaN and then querying client NaN is worse
 * than refusing: the output would look like "no traffic" rather than an error.
 */
export function parseArgs(argv) {
  const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return fallback;
    const value = argv[i + 1];
    // A flag followed by another flag has no value.
    return value === undefined || value.startsWith("--") ? fallback : value;
  };

  const clientId = Number(flag("client", DEFAULT_CLIENT_ID));
  const rawDays = Number(flag("days", DEFAULT_DAYS));
  const pageFilter = flag("page", null);

  if (!Number.isInteger(clientId) || clientId <= 0) {
    throw new Error("--client must be a positive integer");
  }
  if (!Number.isFinite(rawDays) || rawDays <= 0) {
    throw new Error("--days must be a positive number");
  }

  return {
    clientId,
    // Capped rather than refused: a caller asking for "everything" gets the
    // largest window the report supports instead of an error.
    days: Math.min(rawDays, MAX_DAYS),
    pageFilter,
    asJson: argv.includes("--json"),
  };
}

/**
 * The read-only gate. Wraps a libsql client so no caller in this file can issue
 * a statement that mutates production traffic data.
 */
export function readOnly(db) {
  return async (sql, args = []) => {
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
      throw new Error("landing-funnel-report issues read queries only");
    }
    const result = await db.execute({ sql, args });
    return result.rows.map(row => ({ ...row }));
  };
}

export const pct = (n, of) => (of ? `${((n / of) * 100).toFixed(1)}%` : "—");
export const secs = ms => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`);

/** Median in JS: SQLite has no percentile, and one tab left open skews a mean. */
export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function buildReport(db, { clientId, days, pageFilter = null }) {
  const query = readOnly(db);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  /* Every query is parameterised. The dashboard route interpolates because it
     runs through Drizzle's raw SQL; there is no reason to repeat that here. */
  const scopeClause = pageFilter ? "AND page_id = ?" : "";
  const scopeParams = pageFilter ? [pageFilter] : [];
  const WHERE = `WHERE client_id = ? AND occurred_at >= ? ${scopeClause}`;
  const q = (sql, extra = []) => query(sql, [clientId, since, ...scopeParams, ...extra]);

  const pages = await q(`
    SELECT page_id, market, device_class,
           COUNT(DISTINCT session_id) AS sessions
    FROM landing_events ${WHERE}
    GROUP BY page_id, market, device_class
    ORDER BY sessions DESC`);

  const totalSessions = Number(
    (await q(`SELECT COUNT(DISTINCT session_id) AS sessions FROM landing_events ${WHERE}`))[0]
      ?.sessions ?? 0,
  );

  /* Sections in the order visitors actually reach them: first appearance by
     time, not by name, so the drop-off column reads top-to-bottom like the
     page does. */
  const sections = await q(`
    SELECT json_extract(properties, '$.section_id') AS section,
           MIN(occurred_at) AS first_seen,
           COUNT(DISTINCT CASE WHEN event_type = 'section_view' THEN session_id END) AS viewed,
           COUNT(DISTINCT CASE WHEN event_type = 'section_engaged' THEN session_id END) AS engaged
    FROM landing_events ${WHERE}
      AND event_type IN ('section_view', 'section_engaged', 'section_dwell')
      AND json_extract(properties, '$.section_id') IS NOT NULL
    GROUP BY section
    ORDER BY first_seen`);

  /* Median dwell per section, taken over the per-session maximum so a section
     revisited on scroll-back counts once rather than twice. */
  const dwellRows = await q(`
    SELECT json_extract(properties, '$.section_id') AS section,
           session_id,
           MAX(CAST(json_extract(properties, '$.active_ms') AS REAL)) AS ms
    FROM landing_events ${WHERE}
      AND event_type = 'section_dwell'
      AND json_extract(properties, '$.active_ms') IS NOT NULL
    GROUP BY section, session_id`);

  const dwellBySection = new Map();
  for (const row of dwellRows) {
    if (!Number.isFinite(Number(row.ms))) continue;
    if (!dwellBySection.has(row.section)) dwellBySection.set(row.section, []);
    dwellBySection.get(row.section).push(Number(row.ms));
  }

  const scroll = await q(`
    SELECT CAST(json_extract(properties, '$.percent') AS INTEGER) AS depth,
           COUNT(DISTINCT session_id) AS sessions
    FROM landing_events ${WHERE} AND event_type = 'scroll_depth'
    GROUP BY depth ORDER BY depth`);

  const ctas = await q(`
    SELECT json_extract(properties, '$.cta_id') AS cta,
           COUNT(DISTINCT session_id) AS sessions
    FROM landing_events ${WHERE} AND event_type = 'cta_click'
    GROUP BY cta ORDER BY sessions DESC`);

  const outcomes = await q(`
    SELECT event_type,
           COUNT(DISTINCT session_id) AS sessions
    FROM landing_events ${WHERE}
      AND event_type IN ('form_start', 'form_step', 'form_error', 'form_submit', 'booking_open', 'booking_complete')
    GROUP BY event_type ORDER BY sessions DESC`);

  const pageDwell = await q(`
    SELECT session_id, SUM(ms) AS ms FROM (
      SELECT session_id, page_view_id,
             MAX(CAST(json_extract(properties, '$.active_ms') AS REAL)) AS ms
      FROM landing_events ${WHERE}
        AND event_type = 'page_dwell'
        AND json_extract(properties, '$.active_ms') IS NOT NULL
      GROUP BY session_id, page_view_id)
    GROUP BY session_id`);

  const attribution = await q(`
    SELECT COALESCE(NULLIF(json_extract(attribution, '$.utm_source'), ''), '(direct)') AS source,
           COALESCE(NULLIF(json_extract(attribution, '$.utm_campaign'), ''), '(none)') AS campaign,
           COUNT(DISTINCT session_id) AS sessions,
           COUNT(DISTINCT CASE WHEN event_type = 'booking_complete' THEN session_id END) AS bookings
    FROM landing_events ${WHERE}
    GROUP BY source, campaign ORDER BY sessions DESC LIMIT 20`);

  return {
    clientId,
    days,
    page: pageFilter ?? "(all)",
    since,
    totalSessions,
    pages,
    sections: sections.map(s => ({
      section: s.section,
      viewed: s.viewed,
      engaged: s.engaged,
      engagedRate: pct(s.engaged, s.viewed),
      reachRate: pct(s.viewed, totalSessions),
      medianDwell: secs(median(dwellBySection.get(s.section) ?? [])),
    })),
    scroll: scroll.map(r => ({
      depth: `${r.depth}%`,
      sessions: r.sessions,
      ofAll: pct(r.sessions, totalSessions),
    })),
    ctas,
    outcomes,
    medianActiveTime: secs(median(pageDwell.map(r => Number(r.ms)).filter(Number.isFinite))),
    attribution,
  };
}

export function printReport(report) {
  console.log(`\nLanding funnel — client ${report.clientId}, last ${report.days}d, page ${report.page}`);
  console.log(`Sessions: ${report.totalSessions}   Median active time: ${report.medianActiveTime}\n`);
  console.log("Sessions by page / market / device"); console.table(report.pages);
  console.log("Sections, in page order"); console.table(report.sections);
  console.log("Scroll depth"); console.table(report.scroll);
  console.log("CTA clicks"); console.table(report.ctas);
  console.log("Form & booking outcomes"); console.table(report.outcomes);
  console.log("Attribution"); console.table(report.attribution);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const db = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
  try {
    const report = await buildReport(db, options);
    if (options.asJson) console.log(JSON.stringify(report, null, 2));
    else printReport(report);
    return report;
  } finally {
    db.close();
  }
}

// Only when executed directly, so importing this module runs no queries.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
