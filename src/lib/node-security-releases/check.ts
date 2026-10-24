/**
 * Daily check for new Node.js security releases.
 *
 * Reads the official release index and release schedule from nodejs.org /
 * GitHub (hardcoded hosts, no credentials, never a caller-supplied URL) and
 * raises one bell notification per admin when a supported Node.js line gets a
 * new security release. The notification tells the team to run the
 * `/live-security-update node` command across the live apps in ~/my-projects.
 *
 * No collection of its own: the notification title names every version it
 * covers, and a version already named in an earlier `node-security-release`
 * notification is never raised again.
 */

import { getPayload, type Payload } from "payload";

import config from "@/payload.config";

export const NODE_INDEX_URL = "https://nodejs.org/dist/index.json";
export const NODE_SCHEDULE_URL = "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json";
const FETCH_TIMEOUT_MS = 15_000;
/** Only releases this recent are raised, so the first run doesn't dredge up old ones. */
export const FRESH_WINDOW_DAYS = 21;
const NOTIFICATION_KIND = "node-security-release" as const;

export interface NodeIndexEntry {
  version: string;
  date: string;
  lts: string | false;
  security: boolean;
}

export type NodeSchedule = Record<string, { start?: string; lts?: string; end?: string }>;

export interface NodeSecurityRelease {
  version: string; // "24.22.1"
  major: string; // "v24"
  date: string; // "2026-10-20"
  lts: string | null; // "Krypton"
}

export interface NodeSecurityCronSummary {
  supportedLines: string[];
  fresh: string[];
  alreadyNotified: string[];
  notified: number;
  error?: string;
}

function isIndexEntry(value: unknown): value is NodeIndexEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.version === "string" &&
    /^v\d+\.\d+\.\d+$/.test(row.version) &&
    typeof row.date === "string" &&
    typeof row.security === "boolean"
  );
}

/**
 * The newest security release of each still-supported line, released within
 * the freshness window. Pure, so it is tested without the network.
 */
export function findFreshSecurityReleases(
  index: unknown,
  schedule: unknown,
  now: Date = new Date(),
  windowDays: number = FRESH_WINDOW_DAYS,
): NodeSecurityRelease[] {
  if (!Array.isArray(index) || !schedule || typeof schedule !== "object") return [];
  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const lines = schedule as NodeSchedule;

  const newestSecurityByLine = new Map<string, NodeIndexEntry>();
  for (const entry of index) {
    if (!isIndexEntry(entry) || !entry.security) continue;
    const major = entry.version.split(".")[0];
    const line = lines[major];
    // Supported = has started and has not reached its end-of-life date.
    if (!line?.end || line.end < today || (line.start && line.start > today)) continue;
    const seen = newestSecurityByLine.get(major);
    if (!seen || compareVersions(entry.version, seen.version) > 0) newestSecurityByLine.set(major, entry);
  }

  return [...newestSecurityByLine.entries()]
    .filter(([, entry]) => entry.date >= cutoff)
    .map(([major, entry]) => ({
      version: entry.version.slice(1),
      major,
      date: entry.date,
      lts: typeof entry.lts === "string" ? entry.lts : null,
    }))
    .sort((a, b) => compareVersions(`v${b.version}`, `v${a.version}`));
}

function compareVersions(a: string, b: string): number {
  const pa = a.slice(1).split(".").map(Number);
  const pb = b.slice(1).split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export function notificationTitle(releases: NodeSecurityRelease[]): string {
  return `Node.js security release: ${releases.map((r) => r.version).join(", ")}`;
}

export function notificationBody(releases: NodeSecurityRelease[]): string {
  const date = releases.map((r) => r.date).sort().at(-1);
  return (
    `New Node.js security fixes${date ? ` (${date})` : ""}. ` +
    "Run /live-security-update node in GG Coder on my-projects, then update your Mac " +
    "(brew upgrade node, nvm install)."
  );
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

export interface RunNodeSecurityCronOptions {
  payload?: Payload;
  fetchJson?: (url: string) => Promise<unknown>;
  now?: Date;
}

export async function runNodeSecurityReleasesCron(
  opts: RunNodeSecurityCronOptions = {},
): Promise<NodeSecurityCronSummary> {
  const get = opts.fetchJson ?? fetchJson;
  let index: unknown;
  let schedule: unknown;
  try {
    [index, schedule] = await Promise.all([get(NODE_INDEX_URL), get(NODE_SCHEDULE_URL)]);
  } catch (err) {
    return { supportedLines: [], fresh: [], alreadyNotified: [], notified: 0, error: (err as Error).message };
  }

  const fresh = findFreshSecurityReleases(index, schedule, opts.now ?? new Date());
  const summary: NodeSecurityCronSummary = {
    supportedLines: [...new Set(fresh.map((r) => r.major))],
    fresh: fresh.map((r) => r.version),
    alreadyNotified: [],
    notified: 0,
  };
  if (fresh.length === 0) return summary;

  const payload = opts.payload ?? (await getPayload({ config: await config }));

  const previous = await payload.find({
    collection: "notifications" as never,
    where: { kind: { equals: NOTIFICATION_KIND } },
    depth: 0,
    limit: 500,
    overrideAccess: true,
  });
  const previousTitles = (previous.docs as Array<{ title?: string }>).map((d) => d.title ?? "");
  const isNotified = (version: string) =>
    previousTitles.some((title) => new RegExp(`(^|[^\\d.])${version.replace(/\./g, "\\.")}($|[^\\d.])`).test(title));

  const toRaise = fresh.filter((r) => !isNotified(r.version));
  summary.alreadyNotified = fresh.filter((r) => isNotified(r.version)).map((r) => r.version);
  if (toRaise.length === 0) return summary;

  const admins = await payload.find({
    collection: "users",
    where: { role: { equals: "admin" } },
    depth: 0,
    limit: 100,
    overrideAccess: true,
  });
  const newest = toRaise[0];
  for (const admin of admins.docs) {
    await payload.create({
      collection: "notifications" as never,
      data: {
        recipient: admin.id,
        kind: NOTIFICATION_KIND,
        title: notificationTitle(toRaise),
        body: notificationBody(toRaise),
        url: `https://nodejs.org/en/blog/release/v${newest.version}`,
      } as never,
      overrideAccess: true,
    });
    summary.notified++;
  }
  return summary;
}
