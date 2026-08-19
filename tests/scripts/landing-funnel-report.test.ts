/**
 * scripts/landing-funnel-report.mjs points at production landing traffic, so
 * the properties worth pinning are the ones that keep it harmless and honest:
 * it must never issue a write, it must refuse arguments that would quietly
 * produce a wrong report, and it must render an empty window as "no data"
 * rather than as zeros that read like a finding.
 *
 * Every test here runs against a temporary local libsql file, created and
 * deleted per test. Nothing in this file reads DATABASE_URL, so it cannot
 * reach the production database even if the environment names one.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildReport,
  median,
  parseArgs,
  pct,
  readOnly,
  DEFAULT_CLIENT_ID,
  MAX_DAYS,
} from "../../scripts/landing-funnel-report.mjs";

let dir: string;
let db: Client;

const CLIENT_ID = 6;

/** Minimal shape of the production table: only the columns the report reads. */
async function createSchema(client: Client) {
  await client.execute(`
    CREATE TABLE landing_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT,
      client_id INTEGER,
      event_type TEXT,
      occurred_at TEXT,
      session_id TEXT,
      page_view_id TEXT,
      route TEXT,
      device_class TEXT,
      attribution TEXT,
      properties TEXT,
      page_id TEXT,
      market TEXT
    )`);
}

let eventSeq = 0;
async function insert(client: Client, row: Record<string, unknown>) {
  eventSeq += 1;
  const full = {
    event_id: `evt-${eventSeq}`,
    client_id: CLIENT_ID,
    occurred_at: new Date().toISOString(),
    session_id: "s1",
    page_view_id: "pv1",
    route: "/",
    device_class: "mobile",
    attribution: "{}",
    properties: "{}",
    page_id: "offshore-teams-au",
    market: "AU",
    ...row,
  };
  const keys = Object.keys(full);
  await client.execute({
    sql: `INSERT INTO landing_events (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    args: keys.map(k => full[k] as never),
  });
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "landing-funnel-"));
  db = createClient({ url: `file:${join(dir, "test.db")}` });
  await createSchema(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("readOnly guard", () => {
  it("passes SELECT and WITH statements through", async () => {
    const q = readOnly(db);
    await expect(q("SELECT 1 AS n")).resolves.toEqual([{ n: 1 }]);
    await expect(q("WITH x AS (SELECT 1 AS n) SELECT n FROM x")).resolves.toEqual([{ n: 1 }]);
    // Leading whitespace and lower case are still reads.
    await expect(q("\n  select 2 as n")).resolves.toEqual([{ n: 2 }]);
  });

  it.each([
    ["INSERT INTO landing_events (client_id) VALUES (1)"],
    ["UPDATE landing_events SET client_id = 2"],
    ["DELETE FROM landing_events"],
    ["DROP TABLE landing_events"],
    ["CREATE TABLE evil (id INTEGER)"],
    ["PRAGMA writable_schema = 1"],
    ["  insert into landing_events (client_id) values (1)"],
  ])("refuses %s", async statement => {
    await expect(readOnly(db)(statement)).rejects.toThrow(/read queries only/);
  });

  it("leaves the database untouched when a write is refused", async () => {
    await insert(db, { event_type: "page_view" });
    await expect(readOnly(db)("DELETE FROM landing_events")).rejects.toThrow();
    const remaining = await db.execute("SELECT COUNT(*) AS n FROM landing_events");
    expect(Number(remaining.rows[0].n)).toBe(1);
  });
});

describe("parseArgs", () => {
  it("applies documented defaults", () => {
    expect(parseArgs([])).toEqual({
      clientId: DEFAULT_CLIENT_ID,
      days: 30,
      pageFilter: null,
      asJson: false,
    });
  });

  it("reads --client, --days, --page and --json", () => {
    expect(parseArgs(["--client", "9", "--days", "7", "--page", "offshore-teams-us", "--json"])).toEqual({
      clientId: 9,
      days: 7,
      pageFilter: "offshore-teams-us",
      asJson: true,
    });
  });

  it("caps --days at the supported window rather than erroring", () => {
    expect(parseArgs(["--days", "5000"]).days).toBe(MAX_DAYS);
  });

  it.each([
    [["--client", "0"], /--client must be a positive integer/],
    [["--client", "-3"], /--client must be a positive integer/],
    [["--client", "1.5"], /--client must be a positive integer/],
    [["--client", "abc"], /--client must be a positive integer/],
    [["--days", "0"], /--days must be a positive number/],
    [["--days", "-1"], /--days must be a positive number/],
    [["--days", "soon"], /--days must be a positive number/],
  ])("refuses %s", (argv, message) => {
    expect(() => parseArgs(argv as string[])).toThrow(message);
  });

  it("treats a flag with no value as absent instead of swallowing the next flag", () => {
    // `--page --json` must not set pageFilter to "--json" and lose the json flag.
    expect(parseArgs(["--page", "--json"])).toMatchObject({ pageFilter: null, asJson: true });
  });
});

describe("buildReport", () => {
  it("reports an empty window as no sessions and no rows", async () => {
    const report = await buildReport(db, { clientId: CLIENT_ID, days: 30 });
    expect(report.totalSessions).toBe(0);
    expect(report.pages).toEqual([]);
    expect(report.sections).toEqual([]);
    expect(report.scroll).toEqual([]);
    expect(report.ctas).toEqual([]);
    expect(report.outcomes).toEqual([]);
    expect(report.attribution).toEqual([]);
    // Not measured must read as "—", never as 0.0s, which would look like a
    // real visit that bounced instantly.
    expect(report.medianActiveTime).toBe("—");
  });

  it("counts sessions, sections, scroll, CTAs and outcomes", async () => {
    await insert(db, { event_type: "page_view", session_id: "s1" });
    await insert(db, { event_type: "page_view", session_id: "s2", device_class: "desktop" });
    await insert(db, {
      event_type: "section_view",
      session_id: "s1",
      properties: JSON.stringify({ section_id: "hero" }),
    });
    await insert(db, {
      event_type: "section_engaged",
      session_id: "s1",
      properties: JSON.stringify({ section_id: "hero", active_ms: 4000 }),
    });
    await insert(db, {
      event_type: "section_dwell",
      session_id: "s1",
      properties: JSON.stringify({ section_id: "hero", active_ms: 4000 }),
    });
    await insert(db, {
      event_type: "scroll_depth",
      session_id: "s1",
      properties: JSON.stringify({ percent: 50 }),
    });
    await insert(db, {
      event_type: "cta_click",
      session_id: "s2",
      properties: JSON.stringify({ cta_id: "book-a-call" }),
    });
    await insert(db, { event_type: "booking_complete", session_id: "s2" });
    await insert(db, {
      event_type: "page_dwell",
      session_id: "s1",
      properties: JSON.stringify({ active_ms: 20_000 }),
    });

    const report = await buildReport(db, { clientId: CLIENT_ID, days: 30 });
    expect(report.totalSessions).toBe(2);
    expect(report.sections).toEqual([
      expect.objectContaining({ section: "hero", viewed: 1, engaged: 1, medianDwell: "4.0s" }),
    ]);
    expect(report.scroll).toEqual([{ depth: "50%", sessions: 1, ofAll: "50.0%" }]);
    expect(report.ctas).toEqual([{ cta: "book-a-call", sessions: 1 }]);
    expect(report.outcomes).toEqual([{ event_type: "booking_complete", sessions: 1 }]);
    expect(report.medianActiveTime).toBe("20.0s");
  });

  it("scopes to one page when --page is given, and to one client always", async () => {
    await insert(db, { event_type: "page_view", session_id: "au", page_id: "offshore-teams-au" });
    await insert(db, {
      event_type: "page_view",
      session_id: "us",
      page_id: "offshore-teams-us",
      market: "US",
    });
    // Another tenant's traffic in the same table must never be counted.
    await insert(db, { event_type: "page_view", session_id: "other", client_id: 99 });

    const all = await buildReport(db, { clientId: CLIENT_ID, days: 30 });
    expect(all.totalSessions).toBe(2);

    const scoped = await buildReport(db, {
      clientId: CLIENT_ID,
      days: 30,
      pageFilter: "offshore-teams-us",
    });
    expect(scoped.totalSessions).toBe(1);
    expect(scoped.page).toBe("offshore-teams-us");
    expect(scoped.pages).toEqual([
      expect.objectContaining({ page_id: "offshore-teams-us", sessions: 1 }),
    ]);
  });

  it("excludes events older than the requested window", async () => {
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await insert(db, { event_type: "page_view", session_id: "old", occurred_at: old });
    await insert(db, { event_type: "page_view", session_id: "new" });

    expect((await buildReport(db, { clientId: CLIENT_ID, days: 30 })).totalSessions).toBe(2);
    expect((await buildReport(db, { clientId: CLIENT_ID, days: 1 })).totalSessions).toBe(1);
  });

  it("labels untagged traffic rather than dropping it", async () => {
    await insert(db, { event_type: "page_view", session_id: "a", attribution: "{}" });
    await insert(db, {
      event_type: "page_view",
      session_id: "b",
      attribution: JSON.stringify({ utm_source: "adwords", utm_campaign: "AU - Exact" }),
    });

    const report = await buildReport(db, { clientId: CLIENT_ID, days: 30 });
    expect(report.attribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "(direct)", campaign: "(none)", sessions: 1 }),
        expect.objectContaining({ source: "adwords", campaign: "AU - Exact", sessions: 1 }),
      ]),
    );
  });
});

describe("formatting helpers", () => {
  it("returns an em dash instead of dividing by zero", () => {
    expect(pct(0, 0)).toBe("—");
    expect(pct(1, 4)).toBe("25.0%");
  });

  it("takes a median that a single long session cannot drag", () => {
    expect(median([])).toBeNull();
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 3])).toBe(2);
    expect(median([1, 1, 1, 1, 100_000])).toBe(1);
  });
});
