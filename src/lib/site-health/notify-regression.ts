import type { Payload } from "payload";

/** One entry of the crawl-to-crawl issue delta Growth Tools now returns. */
export interface IssueDelta {
  type?: string;
  url?: string;
  severity?: string;
  message?: string;
}

export interface SiteHealthComparison {
  newIssues?: number;
  fixedIssues?: number;
  newIssuesList?: IssueDelta[];
  fixedIssuesList?: IssueDelta[];
  scoreChange?: number;
}

/** New critical issues in this crawl, i.e. what a human should look at today. */
export function newCriticalIssues(comparison: SiteHealthComparison | null | undefined): IssueDelta[] {
  const list = Array.isArray(comparison?.newIssuesList) ? comparison!.newIssuesList! : [];
  return list.filter((issue) => String(issue?.severity || "").toLowerCase() === "critical");
}

/**
 * Tell the internal team when a finished crawl introduced critical issues.
 * The client's own email is separate (Growth Tools sends it); this is the CMS
 * bell. Never throws — a notification failure must not fail the crawl.
 */
export async function notifyOnRegression(
  payload: Payload,
  args: {
    clientId: string | number;
    clientName: string;
    reportId: string | number;
    comparison: SiteHealthComparison | null | undefined;
  },
): Promise<number> {
  const critical = newCriticalIssues(args.comparison);
  if (critical.length === 0) return 0;

  try {
    const admins = await payload.find({
      collection: "users",
      where: { role: { equals: "admin" } },
      depth: 0,
      limit: 100,
      overrideAccess: true,
    });

    const sample = critical
      .slice(0, 3)
      .map((issue) => `${issue.type}${issue.url ? ` — ${issue.url}` : ""}`)
      .join("; ");
    const more = critical.length > 3 ? ` (+${critical.length - 3} more)` : "";

    let sent = 0;
    for (const admin of admins.docs) {
      await payload.create({
        collection: "notifications",
        data: {
          recipient: admin.id,
          kind: "site-health-regression",
          title: `${args.clientName}: ${critical.length} new critical site issue${critical.length === 1 ? "" : "s"}`,
          body: `${sample}${more}`,
          url: `/admin/collections/site-health-reports/${args.reportId}`,
        },
        overrideAccess: true,
      });
      sent++;
    }
    return sent;
  } catch (err) {
    console.error("[site-health] regression notification failed:", (err as Error).message);
    return 0;
  }
}
