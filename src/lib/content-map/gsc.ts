/**
 * Search Console for the Content Map (CONTRACT-3 §3). Weekly per client with
 * `gscConnected` + tokens: query×page for the last 28 days and the previous
 * 28 days by page, stored raw (trimmed) in content-map-gsc (latest 8 kept).
 * Signals are built at read time against the latest snapshot, so a new map
 * re-maps old pulls. A missing or expired connection never throws.
 */

import { google } from "googleapis";
import type { Payload } from "payload";
import { createGoogleOAuth2Client } from "@/lib/google-oauth-client";
import { refreshAccessToken } from "@/lib/gsc-service";
import { normTitle } from "./ideas";
import type { ContentMapSnapshot, GscPageSignal, GscQuerySignal } from "./types";

type Doc = Record<string, unknown>;

export const RETAIN_GSC_PULLS = 8;
export const GSC_MIN_AGE_MS = 6 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS_STORED = 5000;
const MAX_PAGE_SIGNALS = 200;
const MAX_QUERY_SIGNALS = 300;

export interface GscRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
}
export interface GscPageRow {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
  prevClicks: number | null;
}

/** One Search Analytics query → rows of { keys, clicks, impressions, position }. Injected in tests. */
export type GscQueryFn = (input: {
  accessToken: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit: number;
}) => Promise<Array<{ keys?: string[] | null; clicks?: number | null; impressions?: number | null; position?: number | null }>>;

const defaultQuery: GscQueryFn = async (input) => {
  const auth = createGoogleOAuth2Client(process.env.GSC_REDIRECT_URI);
  auth.setCredentials({ access_token: input.accessToken });
  const sc = google.searchconsole({ version: "v1", auth });
  const res = await sc.searchanalytics.query({
    siteUrl: input.siteUrl,
    requestBody: { startDate: input.startDate, endDate: input.endDate, dimensions: input.dimensions, rowLimit: input.rowLimit },
  });
  return res.data.rows ?? [];
};

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** "/Blog/X?utm=1#a" and "https://site.com/blog/x" → "/blog/x/". */
export function normPath(url: string): string {
  let path = url.trim();
  try {
    path = new URL(/^https?:\/\//i.test(path) ? path : `https://x.invalid${path.startsWith("/") ? "" : "/"}${path}`).pathname;
  } catch {
    path = path.split(/[?#]/)[0] ?? "";
  }
  path = path.toLowerCase().replace(/\/{2,}/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  if (!path.endsWith("/") && !/\.[a-z0-9]{2,5}$/.test(path)) path += "/";
  return path;
}

/** Normalised path → snapshot node id (pages only). */
export function nodeIndex(snapshot: ContentMapSnapshot | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of snapshot?.nodes ?? []) if (!n.agg && !map.has(normPath(n.id))) map.set(normPath(n.id), n.id);
  return map;
}

export function isQuestionQuery(q: string): boolean {
  return q.includes("?") || /^(how|what|why|when|where|who|which|can|could|do|does|did|is|are|should|will|would)\b/i.test(q.trim());
}

const tokens = (t: string) => new Set(normTitle(t).split(" ").filter((w) => w.length > 2));
/** Share of the query's words found in the title. */
function containment(query: string, title: string): number {
  const q = tokens(query);
  if (!q.size) return 0;
  const t = tokens(title);
  let hit = 0;
  for (const w of q) if (t.has(w)) hit++;
  return hit / q.size;
}

export interface GscPullResult {
  ok: boolean;
  connected: boolean;
  doc: Doc | null;
  error?: string;
}

/** Pull last 28 days query×page + previous 28 days by page. Not connected / expired → { connected: false }, no throw. */
export async function pullGsc(
  payload: Payload,
  clientId: string,
  deps: { now?: () => number; query?: GscQueryFn; refresh?: typeof refreshAccessToken } = {},
): Promise<GscPullResult> {
  const now = deps.now ?? Date.now;
  let client: Doc;
  try {
    client = (await payload.findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true })) as unknown as Doc;
  } catch {
    return { ok: false, connected: false, doc: null, error: "Client not found" };
  }
  let accessToken = typeof client.gscAccessToken === "string" ? client.gscAccessToken : "";
  const refreshToken = typeof client.gscRefreshToken === "string" ? client.gscRefreshToken : "";
  const siteUrl = typeof client.gscPropertyUrl === "string" ? client.gscPropertyUrl : "";
  if (client.gscConnected !== true || !refreshToken || !siteUrl) return { ok: false, connected: false, doc: null, error: "Search Console is not connected" };
  const expiry = Date.parse(String(client.gscTokenExpiry ?? ""));
  if (!accessToken || !Number.isFinite(expiry) || expiry <= now()) {
    try {
      const refreshed = await (deps.refresh ?? refreshAccessToken)(refreshToken);
      accessToken = refreshed.accessToken;
      await payload.update({ collection: "clients", id: clientId, data: { gscAccessToken: refreshed.accessToken, gscTokenExpiry: refreshed.expiry } as never, overrideAccess: true });
    } catch (err) {
      return { ok: false, connected: false, doc: null, error: `Search Console token refresh failed: ${(err as Error).message}` };
    }
  }
  // Search Console data lags ~2-3 days.
  const end = now() - 3 * DAY_MS;
  const start = end - 27 * DAY_MS;
  const prevEnd = start - DAY_MS;
  const prevStart = prevEnd - 27 * DAY_MS;
  const query = deps.query ?? defaultQuery;
  let rows: GscRow[];
  let prev: Map<string, number>;
  try {
    const [cur, before] = await Promise.all([
      query({ accessToken, siteUrl, startDate: isoDay(start), endDate: isoDay(end), dimensions: ["query", "page"], rowLimit: 25000 }),
      query({ accessToken, siteUrl, startDate: isoDay(prevStart), endDate: isoDay(prevEnd), dimensions: ["page"], rowLimit: 25000 }),
    ]);
    rows = cur
      .map((r) => ({ query: String(r.keys?.[0] ?? ""), page: String(r.keys?.[1] ?? ""), clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: round1(r.position ?? 0) }))
      .filter((r) => r.query && r.page);
    prev = new Map(before.map((r) => [String(r.keys?.[0] ?? ""), r.clicks ?? 0]));
  } catch (err) {
    const message = (err as Error).message;
    const auth = /invalid_grant|unauthori[sz]ed|401|403|permission/i.test(message);
    return { ok: false, connected: !auth, doc: null, error: `Search Console query failed: ${message}` };
  }
  const byPage = new Map<string, { clicks: number; impressions: number; posSum: number }>();
  for (const r of rows) {
    const p = byPage.get(r.page) ?? { clicks: 0, impressions: 0, posSum: 0 };
    p.clicks += r.clicks;
    p.impressions += r.impressions;
    p.posSum += r.position * r.impressions;
    byPage.set(r.page, p);
  }
  const pages: GscPageRow[] = [...byPage.entries()]
    .map(([page, p]) => ({ page, clicks: p.clicks, impressions: p.impressions, position: p.impressions ? round1(p.posSum / p.impressions) : 0, prevClicks: prev.has(page) ? (prev.get(page) ?? 0) : null }))
    .sort((a, b) => b.impressions - a.impressions || a.page.localeCompare(b.page));
  const stored = [...rows].sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query)).slice(0, MAX_ROWS_STORED);
  const doc = (await payload.create({
    collection: "content-map-gsc",
    data: {
      client: Number(clientId) || clientId,
      pulledAt: new Date(now()).toISOString(),
      periodStart: isoDay(start),
      periodEnd: isoDay(end),
      pages,
      queries: stored,
    } as never,
    overrideAccess: true,
  })) as unknown as Doc;
  await applyGscRetention(payload, clientId);
  return { ok: true, connected: true, doc };
}

export async function applyGscRetention(payload: Payload, clientId: string): Promise<number> {
  const res = await payload.find({
    collection: "content-map-gsc",
    where: { client: { equals: clientId } },
    sort: "-pulledAt",
    limit: 200,
    depth: 0,
    overrideAccess: true,
    select: { pulledAt: true },
  });
  const drop = (res.docs as unknown as Doc[]).slice(RETAIN_GSC_PULLS).map((d) => d.id);
  if (drop.length) await payload.delete({ collection: "content-map-gsc", where: { id: { in: drop as number[] } }, overrideAccess: true });
  return drop.length;
}

export async function latestGsc(payload: Payload, clientId: string): Promise<Doc | null> {
  const res = await payload.find({ collection: "content-map-gsc", where: { client: { equals: clientId } }, sort: "-pulledAt", limit: 1, depth: 0, overrideAccess: true });
  return (res.docs[0] as unknown as Doc | undefined) ?? null;
}

/** Weekly: pull when the last pull is ≥ 6 days old (or none) and the client is connected. */
export async function maybePullWeeklyGsc(payload: Payload, clientId: string, deps: Parameters<typeof pullGsc>[2] = {}): Promise<GscPullResult | null> {
  const now = deps.now ?? Date.now;
  const last = await latestGsc(payload, clientId);
  const at = Date.parse(String(last?.pulledAt ?? ""));
  if (last && Number.isFinite(at) && now() - at < GSC_MIN_AGE_MS) return null;
  return pullGsc(payload, clientId, deps);
}

const rowList = (v: unknown): GscRow[] => (Array.isArray(v) ? (v as GscRow[]).filter((r) => r && typeof r.query === "string" && typeof r.page === "string") : []);
const pageList = (v: unknown): GscPageRow[] => (Array.isArray(v) ? (v as GscPageRow[]).filter((r) => r && typeof r.page === "string") : []);

export interface GscSignals {
  pages: GscPageSignal[];
  queries: GscQuerySignal[];
}

/** Page and query signals (CONTRACT-3 §3) for a stored pull, mapped onto the snapshot's nodes. */
export function buildGscSignals(doc: Doc | null, snapshot: ContentMapSnapshot | null): GscSignals {
  if (!doc) return { pages: [], queries: [] };
  const index = nodeIndex(snapshot);
  const nodes = new Map((snapshot?.nodes ?? []).filter((n) => !n.agg).map((n) => [n.id, n]));
  const topicKeys = new Set((snapshot?.topics ?? []).filter((t) => !t.agg && t.k !== "core").map((t) => t.k));
  const rows = rowList(doc.queries);
  const toNode = (url: string) => index.get(normPath(url)) ?? null;

  // Pages: merge URL variants mapping to the same node.
  const pageAgg = new Map<string, { clicks: number; impressions: number; posSum: number; prev: number | null }>();
  for (const p of pageList(doc.pages)) {
    const id = toNode(p.page);
    if (!id) continue;
    const a = pageAgg.get(id) ?? { clicks: 0, impressions: 0, posSum: 0, prev: null };
    a.clicks += p.clicks;
    a.impressions += p.impressions;
    a.posSum += p.position * p.impressions;
    if (p.prevClicks !== null && p.prevClicks !== undefined) a.prev = (a.prev ?? 0) + p.prevClicks;
    pageAgg.set(id, a);
  }
  const queriesByNode = new Map<string, Array<{ query: string; impressions: number; position: number }>>();
  for (const r of rows) {
    const id = toNode(r.page);
    if (!id) continue;
    const list = queriesByNode.get(id) ?? [];
    list.push({ query: r.query, impressions: r.impressions, position: r.position });
    queriesByNode.set(id, list);
  }
  const pages: GscPageSignal[] = [...pageAgg.entries()]
    .map(([nodeId, a]) => ({
      nodeId,
      clicks: a.clicks,
      impressions: a.impressions,
      position: a.impressions ? round1(a.posSum / a.impressions) : 0,
      clicksChange: a.prev ? Math.round(((a.clicks - a.prev) / a.prev) * 1000) / 1000 : null,
      topQueries: (queriesByNode.get(nodeId) ?? []).sort((x, y) => y.impressions - x.impressions || x.query.localeCompare(y.query)).slice(0, 5),
    }))
    .sort((a, b) => b.impressions - a.impressions || a.nodeId.localeCompare(b.nodeId))
    .slice(0, MAX_PAGE_SIGNALS);

  // Queries.
  const byQuery = new Map<string, { clicks: number; impressions: number; posSum: number; pages: Map<string, number> }>();
  for (const r of rows) {
    const key = r.query.trim().toLowerCase();
    const q = byQuery.get(key) ?? { clicks: 0, impressions: 0, posSum: 0, pages: new Map<string, number>() };
    q.clicks += r.clicks;
    q.impressions += r.impressions;
    q.posSum += r.position * r.impressions;
    const id = toNode(r.page);
    if (id) q.pages.set(id, (q.pages.get(id) ?? 0) + r.impressions);
    byQuery.set(key, q);
  }
  const titles = [...nodes.values()].map((n) => n.t);
  const queries: GscQuerySignal[] = [];
  for (const [query, q] of byQuery) {
    const position = q.impressions ? round1(q.posSum / q.impressions) : 0;
    const ranked = [...q.pages.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const question = isQuestionQuery(query);
    const answered = titles.some((t) => containment(query, t) >= 0.6);
    let kind: GscQuerySignal["kind"] | null = null;
    if (ranked.filter(([, imp]) => q.impressions > 0 && imp / q.impressions >= 0.2).length >= 2) kind = "cannibal";
    else if ((q.impressions >= 50 && position > 10 && !answered) || (question && q.impressions >= 20 && position > 20)) kind = "unanswered";
    else if (question && q.impressions >= 20) kind = "question";
    if (!kind) continue;
    const top = ranked[0]?.[0];
    const g = top ? nodes.get(top)?.g : undefined;
    queries.push({
      query,
      clicks: q.clicks,
      impressions: q.impressions,
      position,
      pages: ranked.map(([id]) => id),
      kind,
      topic: g && topicKeys.has(g) ? g : null,
    });
  }
  queries.sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query));
  return { pages, queries: queries.slice(0, MAX_QUERY_SIGNALS) };
}

/** Raw stored rows (for keyword coverage checks). */
export function gscRows(doc: Doc | null): GscRow[] {
  return rowList(doc?.queries);
}

/** Sydney calendar day (YYYY-MM-DD) — "a new day" for the team means their day, not UTC's. */
export function sydneyDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/**
 * Free daily refresh (user decision 2026-10-24): the first time a client's page
 * is opened on a new Sydney day, pull that client's Search Console once (free:
 * Google's API with the client's own login). Only Search Console: everything
 * paid (AI citations, research) still waits for its button or the schedule.
 * Never throws; skipped when not connected or already pulled today.
 */
export function needsDailyGsc(client: Doc, last: Doc | null, now: number): boolean {
  if (client.gscConnected !== true) return false;
  const at = Date.parse(String(last?.pulledAt ?? ""));
  return !Number.isFinite(at) || sydneyDay(at) !== sydneyDay(now);
}
