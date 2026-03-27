import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Authenticate via CRON_SECRET bearer token
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY" },
      { status: 500 }
    );
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const today = new Date();
  const dayOfMonth = today.getDate();

  // Find clients with monthly health monitoring enabled and matching day
  const { docs: clients } = await payload.find({
    collection: "clients",
    where: {
      and: [
        { "seoAuto.monthlyHealthEnabled": { equals: true } },
        { "seoAuto.healthReportDayOfMonth": { equals: dayOfMonth } },
        { "seoAuto.siteUrl": { exists: true } },
      ],
    },
    limit: 100,
    overrideAccess: true,
  });

  const results: Array<{
    clientName: string;
    clientId: string | number;
    status: string;
    error?: string;
  }> = [];

  for (const client of clients) {
    const c = client as any;
    const clientName = c.name || `Client ${c.id}`;
    const siteUrl = c.seoAuto?.siteUrl;

    if (!siteUrl?.trim()) {
      results.push({
        clientName,
        clientId: c.id,
        status: "skipped",
        error: "No site URL configured",
      });
      continue;
    }

    try {
      // Create a new report record
      const report = await payload.create({
        collection: "site-health-reports",
        data: {
          client: c.id,
          siteUrl: siteUrl.trim(),
          reportDate: today.toISOString(),
          auditStatus: "running",
          auditProgress: "Starting audit|0",
        } as any,
        overrideAccess: true,
      });

      // Trigger Growth Tools audit
      const response = await fetch(
        `${GROWTH_TOOLS_URL}/api/site-health/run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-key": INTERNAL_API_KEY!,
          },
          body: JSON.stringify({
            siteUrl: siteUrl.trim(),
            gscSiteUrl: c.seoAuto?.gscSiteUrl || undefined,
            maxPages: c.seoAuto?.maxPages || 200,
            checkExternalLinks: c.seoAuto?.checkExternalLinks || false,
            clientId: String(c.id),
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Growth Tools failed (${response.status}): ${errorBody}`
        );
      }

      const result = await response.json();

      // Update the report with results
      await payload.update({
        collection: "site-health-reports",
        id: report.id,
        data: {
          healthScore: result.healthScore,
          reportDate: result.reportDate || today.toISOString(),
          crawlStats: result.crawlStats,
          issuesSummary: result.issuesSummary,
          issuesByCategory: result.issuesByCategory,
          issues: result.issues,
          pages: result.pages,
          comparison: result.comparison || undefined,
          gscData: result.gscData || undefined,
          auditStatus: "completed",
          auditProgress: "Complete|100",
          auditError: null,
        } as any,
        overrideAccess: true,
      });

      results.push({
        clientName,
        clientId: c.id,
        status: "completed",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      console.error(
        `[site-health-cron] Failed for ${clientName}:`,
        message
      );

      results.push({
        clientName,
        clientId: c.id,
        status: "failed",
        error: message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    date: today.toISOString().split("T")[0],
    dayOfMonth,
    clientsChecked: clients.length,
    results,
  });
}
