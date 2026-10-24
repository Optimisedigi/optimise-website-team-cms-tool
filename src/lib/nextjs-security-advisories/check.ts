/**
 * Daily check for new Next.js security advisories.
 *
 * Reads the GitHub Advisory Database (reviewed advisories for the npm package
 * `next`) from a hardcoded host, with an optional GITHUB_TOKEN for a higher
 * rate limit, and raises one bell notification per admin when a new high or
 * critical advisory is published. The notification names the patched versions
 * so the team knows what to update every Next.js app to.
 *
 * No collection of its own: each notification lists the GHSA ids it covers,
 * and an id already named in an earlier `nextjs-security-advisory`
 * notification is never raised again.
 */

import { getPayload, type Payload } from "payload";

import config from "@/payload.config";

export const NEXT_ADVISORIES_URL =
  "https://api.github.com/advisories?ecosystem=npm&affects=next&sort=published&direction=desc&per_page=50";
const FETCH_TIMEOUT_MS = 15_000;
/** Only advisories this recent are raised, so the first run doesn't dredge up old ones. */
export const FRESH_WINDOW_DAYS = 21;
/** Medium and low advisories are not worth interrupting someone for. */
export const ALERT_SEVERITIES = ["critical", "high"] as const;
const NOTIFICATION_KIND = "nextjs-security-advisory" as const;

type Severity = (typeof ALERT_SEVERITIES)[number];

export interface NextAdvisory {
  ghsaId: string; // "GHSA-2464-fhr4-w9xw"
  severity: Severity;
  summary: string;
  publishedAt: string; // ISO
  url: string; // https://github.com/advisories/GHSA-...
  /** Fixed versions of `next`, one per affected release line, e.g. ["16.4.1", "15.5.28"]. */
  patchedVersions: string[];
}

export interface NextAdvisoriesCronSummary {
  fresh: string[];
  alreadyNotified: string[];
  notified: number;
  error?: string;
}

const GHSA_RE = /^GHSA(-[a-z0-9]{4}){3}$/;

function safeAdvisoryUrl(ghsaId: string): string {
  return `https://github.com/advisories/${ghsaId}`;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/**
 * New high/critical advisories for `next`, newest and most severe first.
 * Pure, so it is tested without the network.
 */
export function findFreshAdvisories(
  raw: unknown,
  now: Date = new Date(),
  windowDays: number = FRESH_WINDOW_DAYS,
): NextAdvisory[] {
  if (!Array.isArray(raw)) return [];
  const cutoff = now.getTime() - windowDays * 86_400_000;
  const out: NextAdvisory[] = [];

  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const a = row as Record<string, unknown>;
    const ghsaId = typeof a.ghsa_id === "string" ? a.ghsa_id : "";
    const severity = typeof a.severity === "string" ? a.severity.toLowerCase() : "";
    const publishedAt = typeof a.published_at === "string" ? a.published_at : "";
    if (!GHSA_RE.test(ghsaId)) continue;
    if (!(ALERT_SEVERITIES as readonly string[]).includes(severity)) continue;
    if (a.withdrawn_at) continue;
    const published = Date.parse(publishedAt);
    if (!Number.isFinite(published) || published < cutoff) continue;

    const vulns = Array.isArray(a.vulnerabilities) ? a.vulnerabilities : [];
    const patched = new Set<string>();
    let affectsNext = false;
    for (const v of vulns) {
      const pkg = (v as { package?: { name?: unknown; ecosystem?: unknown } })?.package;
      if (pkg?.name !== "next" || pkg?.ecosystem !== "npm") continue;
      affectsNext = true;
      const fixed = (v as { first_patched_version?: unknown }).first_patched_version;
      if (typeof fixed === "string" && /^\d+\.\d+\.\d+$/.test(fixed)) patched.add(fixed);
    }
    if (!affectsNext) continue;

    out.push({
      ghsaId,
      severity: severity as Severity,
      summary: (typeof a.summary === "string" ? a.summary : ghsaId).replace(/\s+/g, " ").trim().slice(0, 160),
      publishedAt,
      url: safeAdvisoryUrl(ghsaId),
      patchedVersions: [...patched].sort((x, y) => compareVersions(y, x)),
    });
  }

  const rank = (s: Severity) => (s === "critical" ? 0 : 1);
  return out.sort((x, y) => rank(x.severity) - rank(y.severity) || y.publishedAt.localeCompare(x.publishedAt));
}

/** Every patched version across the advisories, newest release line first: "16.4.1 / 15.5.28". */
function patchedSummary(advisories: NextAdvisory[]): string {
  const best = new Map<string, string>(); // major -> highest first-patched version needed
  for (const a of advisories) {
    for (const v of a.patchedVersions) {
      const major = v.split(".")[0];
      const seen = best.get(major);
      if (!seen || compareVersions(v, seen) > 0) best.set(major, v);
    }
  }
  return [...best.values()].sort((x, y) => compareVersions(y, x)).join(" / ");
}

export function notificationTitle(advisories: NextAdvisory[]): string {
  const critical = advisories.filter((a) => a.severity === "critical").length;
  const high = advisories.length - critical;
  const counts = [critical && `${critical} critical`, high && `${high} high`].filter(Boolean).join(", ");
  const patched = patchedSummary(advisories);
  return `Next.js security fix: ${counts}${patched ? ` (update to ${patched})` : ""}`;
}

export function notificationBody(advisories: NextAdvisory[]): string {
  const top = advisories[0];
  const more = advisories.length > 1 ? ` +${advisories.length - 1} more` : "";
  return (
    `${top.summary}${more}. ` +
    "Run /live-security-update next in GG Coder on my-projects. " +
    `Advisories: ${advisories.map((a) => a.ghsaId).join(", ")}`
  );
}

async function fetchAdvisories(): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "optimise-digital-cms",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(NEXT_ADVISORIES_URL, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub advisories returned ${res.status}`);
  return res.json();
}

export interface RunNextAdvisoriesCronOptions {
  payload?: Payload;
  fetchAdvisories?: () => Promise<unknown>;
  now?: Date;
}

export async function runNextjsSecurityAdvisoriesCron(
  opts: RunNextAdvisoriesCronOptions = {},
): Promise<NextAdvisoriesCronSummary> {
  let raw: unknown;
  try {
    raw = await (opts.fetchAdvisories ?? fetchAdvisories)();
  } catch (err) {
    return { fresh: [], alreadyNotified: [], notified: 0, error: (err as Error).message };
  }

  const fresh = findFreshAdvisories(raw, opts.now ?? new Date());
  const summary: NextAdvisoriesCronSummary = {
    fresh: fresh.map((a) => a.ghsaId),
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
  const seenText = (previous.docs as Array<{ title?: string; body?: string; url?: string }>)
    .map((d) => `${d.title ?? ""} ${d.body ?? ""} ${d.url ?? ""}`)
    .join("\n");

  const toRaise = fresh.filter((a) => !seenText.includes(a.ghsaId));
  summary.alreadyNotified = fresh.filter((a) => seenText.includes(a.ghsaId)).map((a) => a.ghsaId);
  if (toRaise.length === 0) return summary;

  const admins = await payload.find({
    collection: "users",
    where: { role: { equals: "admin" } },
    depth: 0,
    limit: 100,
    overrideAccess: true,
  });
  for (const admin of admins.docs) {
    await payload.create({
      collection: "notifications" as never,
      data: {
        recipient: admin.id,
        kind: NOTIFICATION_KIND,
        title: notificationTitle(toRaise),
        body: notificationBody(toRaise),
        url: toRaise[0].url,
      } as never,
      overrideAccess: true,
    });
    summary.notified++;
  }
  return summary;
}
