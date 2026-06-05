import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";

/**
 * Returns the list of clients shown on the Google Ads hub page.
 *
 * Returns ALL active clients (not just ones with a Google Ads customer ID),
 * because the hub is also where you'd go to set the customer ID for a new
 * client. The shape includes everything the hub UI needs to render its
 * status badges and trajectory indicators without further fetches.
 */
export async function GET() {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!userHasFeature(user, "nav:google-ads")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await payload.find({
      collection: "clients",
      where: { isActive: { not_equals: false } },
      sort: "name",
      limit: 500,
      depth: 0,
      select: {
        id: true,
        name: true,
        slug: true,
        googleAdsCustomerId: true,
        createdAt: true,
        gadsTrajectoryLatestScore: true,
        gadsTrajectoryPreviousScore: true,
        gadsTrajectoryScoreChange: true,
        gadsTrajectoryTrend: true,
        gadsAutoDashboardEnabled: true,
        gadsAutoWeeklyReportWeeklyReportEnabled: true,
        gadsAutoNegativeSweepEnabled: true,
        gadsAutoReauditEnabled: true,
      } as any,
    });

    // For each client, find the latest Google Ads audit (if any) so we can
    // surface the score and audit status alongside the customer ID.
    const clientIds = result.docs.map((c: any) => c.id);
    const audits = clientIds.length
      ? await payload.find({
          collection: "google-ads-audits",
          where: { client: { in: clientIds } },
          sort: "-createdAt",
          limit: 500,
          depth: 0,
          select: {
            id: true,
            client: true,
            createdAt: true,
            overallScore: true,
            auditStatus: true,
          } as any,
        })
      : { docs: [] as any[] };

    const latestAuditByClient = new Map<number, any>();
    for (const a of audits.docs as any[]) {
      const cid = typeof a.client === "object" ? a.client?.id : a.client;
      if (cid != null && !latestAuditByClient.has(cid)) {
        latestAuditByClient.set(cid, a);
      }
    }

    const clients = (result.docs as any[]).map((c) => {
      const a = latestAuditByClient.get(c.id);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        googleAdsCustomerId: c.googleAdsCustomerId || null,
        createdAt: c.createdAt,
        latestAudit: a
          ? {
              id: a.id,
              overallScore: a.overallScore ?? null,
              auditStatus: a.auditStatus ?? null,
              createdAt: a.createdAt,
            }
          : null,
        scoreTrajectory: {
          latest: c.gadsTrajectoryLatestScore ?? null,
          previous: c.gadsTrajectoryPreviousScore ?? null,
          change: c.gadsTrajectoryScoreChange ?? null,
          trend: c.gadsTrajectoryTrend ?? null,
        },
        automation: {
          dashboardEnabled: !!c.gadsAutoDashboardEnabled,
          weeklyReportEnabled:
            !!c.gadsAutoWeeklyReportWeeklyReportEnabled,
          negativeSweepEnabled: !!c.gadsAutoNegativeSweepEnabled,
          reauditEnabled: !!c.gadsAutoReauditEnabled,
        },
      };
    });

    return NextResponse.json(clients);
  } catch (err) {
    console.error("[clients/google-ads-list] error:", err);
    return NextResponse.json(
      { error: "Failed to load clients" },
      { status: 500 },
    );
  }
}
