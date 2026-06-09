import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY" },
      { status: 500 }
    );
  }

  // Fetch the report record
  let report: any;
  try {
    report = await payload.findByID({
      collection: "site-health-reports",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const { siteUrl } = report;
  if (!siteUrl?.trim()) {
    return NextResponse.json(
      { error: "Missing required field: siteUrl" },
      { status: 400 }
    );
  }

  // Resolve client config for GSC URL and max pages
  const clientId =
    typeof report.client === "object" ? report.client?.id : report.client;
  let gscSiteUrl: string | undefined;
  let maxPages = 200;
  let maxGscInspections = 200;
  let checkExternalLinks = false;

  if (clientId) {
    try {
      const client = await payload.findByID({
        collection: "clients",
        id: clientId,
        overrideAccess: true,
      });
      const c = client as any;
      gscSiteUrl = c.seoAuto?.gscSiteUrl || undefined;
      maxPages = c.seoAuto?.maxPages || 200;
      maxGscInspections = c.seoAuto?.maxGscInspections || 200;
      checkExternalLinks = c.seoAuto?.checkExternalLinks || false;
    } catch {
      // Client lookup failed — use defaults
    }
  }

  // Mark as running
  await payload.update({
    collection: "site-health-reports",
    id,
    data: {
      auditStatus: "running",
      auditProgress: "Starting audit|0",
      auditError: null,
    } as any,
    overrideAccess: true,
  });

  const updateProgress = (stage: string, percent: number) =>
    payload
      .update({
        collection: "site-health-reports",
        id,
        data: { auditProgress: `${stage}|${percent}` } as any,
        overrideAccess: true,
      })
      .catch(() => {});

  const auditWork = async () => {
    try {
      await updateProgress("Crawling site", 10);

      const response = await fetch(`${GROWTH_TOOLS_URL}/api/site-health/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY!,
        },
        body: JSON.stringify({
          siteUrl: siteUrl.trim(),
          gscSiteUrl: gscSiteUrl || undefined,
          maxPages,
          maxGscInspections,
          checkExternalLinks,
          clientId: clientId ? String(clientId) : undefined,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Growth Tools site-health failed (${response.status}): ${errorBody}`
        );
      }

      await updateProgress("Processing results", 70);

      const result = await response.json();

      // Store results on the report record
      await payload.update({
        collection: "site-health-reports",
        id,
        data: {
          healthScore: result.healthScore,
          reportDate: result.reportDate || new Date().toISOString(),
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
    } catch (e: any) {
      console.error(
        `[SiteHealth] Audit failed for report ${id}:`,
        e.message
      );

      await payload
        .update({
          collection: "site-health-reports",
          id,
          data: {
            auditStatus: "failed",
            auditProgress: "Failed|100",
            auditError: e.message || "Unknown error",
          } as any,
          overrideAccess: true,
        })
        .catch(() => {});
    }
  };

  after(auditWork);
  return NextResponse.json({ ok: true, status: "running" });
}
