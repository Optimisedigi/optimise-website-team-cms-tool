import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth: require Payload session
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

  // Fetch the proposal
  let proposal: any;
  try {
    proposal = await payload.findByID({
      collection: "client-proposals",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  // Validate required fields
  const { websiteUrl, businessType, keywords: keywordsRaw, conversionGoal, targetLocation } = proposal;
  if (!websiteUrl || !businessType || !keywordsRaw?.trim()) {
    return NextResponse.json(
      { error: "Missing required fields: websiteUrl, businessType, keywords" },
      { status: 400 }
    );
  }

  // Mark as running
  await payload.update({
    collection: "client-proposals",
    id,
    data: {
      auditStatus: "running",
      auditStartedAt: new Date().toISOString(),
      auditCompletedAt: null,
      auditError: null,
    } as any,
    overrideAccess: true,
  });

  const proposalId = Number(id);

  // Parse keywords
  const keywordsList = keywordsRaw
    .split("\n")
    .map((k: string) => k.trim())
    .filter(Boolean);

  const keywordsNewlineSeparated = keywordsList.join("\n");
  const keywordsCommaSeparated = keywordsList.join(",");

  try {
    // Call 4 growth-tools endpoints in parallel
    const [seoResult, croResult, kwResult, compResult] = await Promise.allSettled([
      // SEO audit
      fetch(`${GROWTH_TOOLS_URL}/api/seo-audits`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY,
        },
        body: JSON.stringify({ websiteUrl, businessType }),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`SEO audit failed: ${res.status}`);
        return res.json();
      }),

      // CRO audit
      fetch(`${GROWTH_TOOLS_URL}/api/audits`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          websiteUrl,
          conversionGoal: conversionGoal || "lead generation",
          businessType,
        }),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`CRO audit failed: ${res.status}`);
        return res.json();
      }),

      // Keyword tracking
      fetch(`${GROWTH_TOOLS_URL}/api/track-keywords`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          website: websiteUrl,
          keywords: keywordsNewlineSeparated,
          location: targetLocation || undefined,
        }),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`Keywords failed: ${res.status}`);
        return res.json();
      }),

      // Competitor analysis (no internal key needed)
      fetch(`${GROWTH_TOOLS_URL}/api/competitor-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl,
          keywords: keywordsCommaSeparated,
          location: targetLocation || undefined,
        }),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`Competitor analysis failed: ${res.status}`);
        return res.json();
      }),
    ]);

    const auditIds: Record<string, number | string | null> = {
      seoAudit: null,
      croAudit: null,
      keywordSnapshot: null,
      competitorAnalysis: null,
    };

    const errors: string[] = [];

    // Create SEO audit record
    if (seoResult.status === "fulfilled") {
      try {
        const seo = seoResult.value;
        const created = await payload.create({
          collection: "seo-audits",
          data: {
            websiteUrl: seo.websiteUrl || websiteUrl,
            businessType: seo.businessType || businessType,
            overallScore: seo.overallScore,
            pagesAnalyzed: seo.pagesAnalyzed,
            categoryScores: seo.categoryScores,
            pageResults: seo.pageResults,
            siteWideFindings: seo.siteWideFindings,
            recommendations: seo.recommendations,
            extractedData: seo.extractedData,
            proposal: proposalId,
          },
          overrideAccess: true,
        });
        auditIds.seoAudit = created.id;
      } catch (e: any) {
        errors.push(`SEO record creation failed: ${e.message}`);
      }
    } else {
      errors.push(seoResult.reason?.message || "SEO audit failed");
    }

    // Create CRO audit record
    if (croResult.status === "fulfilled") {
      try {
        const cro = croResult.value;
        const created = await payload.create({
          collection: "cro-audits",
          data: {
            websiteUrl: cro.websiteUrl || websiteUrl,
            conversionGoal: cro.conversionGoal || conversionGoal || "lead generation",
            overallScore: cro.overallScore,
            aboveFoldScore: cro.aboveFoldScore,
            ctaScore: cro.ctaScore,
            navigationScore: cro.navigationScore,
            contentScore: cro.contentScore,
            findings: cro.findings,
            recommendations: cro.recommendations,
            extractedContent: cro.extractedContent,
            proposal: proposalId,
          },
          overrideAccess: true,
        });
        auditIds.croAudit = created.id;
      } catch (e: any) {
        errors.push(`CRO record creation failed: ${e.message}`);
      }
    } else {
      errors.push(croResult.reason?.message || "CRO audit failed");
    }

    // Create keyword snapshot record
    if (kwResult.status === "fulfilled") {
      try {
        const kw = kwResult.value;
        const kwData = kw.keywords || kw.results || kw;
        const kwArray = Array.isArray(kwData) ? kwData : [];

        // Calculate summary stats
        const totalKeywords = kwArray.length;
        const ranked = kwArray.filter((k: any) => k.position != null && k.position > 0);
        const top10 = ranked.filter((k: any) => k.position <= 10).length;
        const avgPosition =
          ranked.length > 0
            ? Math.round(
                (ranked.reduce((sum: number, k: any) => sum + k.position, 0) /
                  ranked.length) *
                  10
              ) / 10
            : null;
        const opportunities = kwArray.filter(
          (k: any) => k.opportunity === "high" || k.opportunity === "medium"
        ).length;

        const top20 = ranked.filter((k: any) => k.position <= 20).length;
        const top50 = ranked.filter((k: any) => k.position <= 50).length;
        const notFound = totalKeywords - ranked.length;

        const created = await payload.create({
          collection: "keyword-snapshots",
          data: {
            websiteUrl,
            totalKeywords,
            top10,
            avgPosition,
            opportunities,
            keywords: kwArray,
            rankingDistribution: { top10, top20, top50, notFound },
            proposal: proposalId,
          },
          overrideAccess: true,
        });
        auditIds.keywordSnapshot = created.id;
      } catch (e: any) {
        errors.push(`Keyword record creation failed: ${e.message}`);
      }
    } else {
      errors.push(kwResult.reason?.message || "Keyword tracking failed");
    }

    // Create competitor analysis record
    if (compResult.status === "fulfilled") {
      try {
        const comp = compResult.value;
        const created = await payload.create({
          collection: "competitor-analyses",
          data: {
            websiteUrl,
            keywords: keywordsList,
            location: targetLocation || null,
            totalCompetitors: comp.competitors?.length || 0,
            yourProfile: comp.yourProfile || null,
            competitors: comp.competitors || [],
            proposal: proposalId,
          },
          overrideAccess: true,
        });
        auditIds.competitorAnalysis = created.id;
      } catch (e: any) {
        errors.push(`Competitor record creation failed: ${e.message}`);
      }
    } else {
      errors.push(compResult.reason?.message || "Competitor analysis failed");
    }

    // Determine final status
    const anySucceeded = Object.values(auditIds).some((v) => v !== null);
    const allFailed = Object.values(auditIds).every((v) => v === null);

    await payload.update({
      collection: "client-proposals",
      id,
      data: {
        auditStatus: allFailed ? "failed" : "completed",
        auditCompletedAt: new Date().toISOString(),
        auditError: errors.length > 0 ? errors.join("\n") : null,
        ...(auditIds.seoAudit ? { seoAudit: auditIds.seoAudit } : {}),
        ...(auditIds.croAudit ? { croAudit: auditIds.croAudit } : {}),
        ...(auditIds.keywordSnapshot ? { keywordSnapshot: auditIds.keywordSnapshot } : {}),
        ...(auditIds.competitorAnalysis ? { competitorAnalysis: auditIds.competitorAnalysis } : {}),
      } as any,
      overrideAccess: true,
    });

    return NextResponse.json({
      ok: anySucceeded,
      status: allFailed ? "failed" : "completed",
      auditIds,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    // Unexpected error — mark as failed
    await payload.update({
      collection: "client-proposals",
      id,
      data: {
        auditStatus: "failed",
        auditCompletedAt: new Date().toISOString(),
        auditError: e.message || "Unexpected error",
      } as any,
      overrideAccess: true,
    });

    return NextResponse.json(
      { error: e.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
