import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { buildAuditProgressUpdate, failedOptionalEnrichmentState, persistCoreAuditCheckpoint } from "@/lib/proposal-audit-checkpoint";
import { hasValue } from "@/lib/proposal-audit-backfill";
import { dispatchProposalAuditEnrichment } from "@/lib/proposal-audit-enrichment";

// Allow up to 300s for the background audit pipeline (Vercel Pro max).
// Without this, the default ~15s timeout kills `after()` mid-execution,
// leaving auditStatus stuck at "running".
export const maxDuration = 300;

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const AUDIT_TIMEOUT_SAFETY_MS = 45_000;
const SEO_AUDIT_REQUEST_BUDGET_MS = 210_000;
// Content research is best-effort (it is never validated in
// validateProposalAuditReport) but Google Ads throttling can make individual
// calls slow. Bound it so core records always have time to persist and link.
const CONTENT_RESEARCH_BUDGET_MS = 180_000;


async function validateProposalAuditReport(payload: any, proposalId: string, auditIds: Record<string, number | string | number[] | null>) {
  const missing: string[] = [];

  if (!auditIds.seoAudit) {
    missing.push("seoAudit record");
  } else {
    try {
      const seoAudit = await payload.findByID({
        collection: "seo-audits",
        id: auditIds.seoAudit as number,
        overrideAccess: true,
      });
      if (!hasValue(seoAudit?.lighthouseScores)) {
        missing.push("seoAudit.lighthouseScores");
      }
    } catch (e: any) {
      missing.push(`seoAudit could not be loaded: ${e.message}`);
    }
  }

  if (!auditIds.competitorAnalysis) {
    missing.push("competitorAnalysis record");
  } else {
    try {
      const competitorAnalysis = await payload.findByID({
        collection: "competitor-analyses",
        id: auditIds.competitorAnalysis as number,
        overrideAccess: true,
      });
      if (!hasValue(competitorAnalysis?.competitors)) {
        missing.push("competitorAnalysis.competitors");
      }
    } catch (e: any) {
      missing.push(`competitorAnalysis could not be loaded: ${e.message}`);
    }
  }

  return missing.map((field) => `Missing required audit report section for proposal ${proposalId}: ${field}`);
}

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
  } catch (err: any) {
    console.error(`[run-audits] Failed to fetch proposal ${id}:`, err?.message || err);
    return NextResponse.json({ error: "Proposal not found", detail: err?.message }, { status: 404 });
  }

  // Validate required fields
  const { websiteUrl, businessType, conversionGoal, targetLocation, searchLanguage } = proposal;

  // Build keyword list from categories (preferred) or legacy field
  const keywordCategories = (proposal as any).keywordCategories as { categoryName: string; keywords: string }[] | null;
  const legacyKeywordsRaw = (proposal as any).keywords as string | null;

  let keywordsRaw = "";
  if (keywordCategories && keywordCategories.length > 0) {
    keywordsRaw = keywordCategories.map((c) => c.keywords || "").join("\n");
  } else if (legacyKeywordsRaw) {
    keywordsRaw = legacyKeywordsRaw;
  }

  if (!websiteUrl || !businessType || !keywordsRaw.trim()) {
    return NextResponse.json(
      { error: "Missing required fields: websiteUrl, businessType, keywords" },
      { status: 400 }
    );
  }

  // Preserve array fields that Payload clears on partial updates
  const preservedArrayFields = {
    competitors: proposal.competitors ?? [],
    keywordCategories: (proposal as any).keywordCategories ?? [],
    googleMapsUrls: (proposal as any).googleMapsUrls ?? [],
    flightPlanImages: (proposal as any).flightPlanImages ?? [],
    missionResourcesImages: (proposal as any).missionResourcesImages ?? [],
  };

  // Mark as running
  await payload.update({
    collection: "client-proposals",
    id,
    data: {
      auditStatus: "running",
      auditProgress: "Starting audits|0",
      auditStartedAt: new Date().toISOString(),
      auditCompletedAt: null,
      auditError: null,
      ...preservedArrayFields,
    } as any,
    overrideAccess: true,
  });

  // Helper to update progress stage (non-blocking, best-effort)
  const updateProgress = (stage: string, percent: number) =>
    payload.update({
      collection: "client-proposals",
      id,
      data: buildAuditProgressUpdate(stage, percent, preservedArrayFields) as any,
      overrideAccess: true,
    }).catch((error: any) => {
      console.error(`[run-audits] Progress update failed for proposal ${id}:`, error?.message || error);
    });

  const proposalId = Number(id);
  const existingSeoAuditId = typeof proposal.seoAudit === "object" ? proposal.seoAudit?.id : proposal.seoAudit;

  // Parse keywords
  const keywordsList = keywordsRaw
    .split("\n")
    .map((k: string) => k.trim())
    .filter(Boolean);

  const keywordsNewlineSeparated = keywordsList.join("\n");
  const keywordsCommaSeparated = keywordsList.join(",");

  // Return immediately — run the audit work in the background
  // (the frontend polls /api/proposals/[id]/audit-status for progress)
  const auditWork = async () => {

  try {
    const auditDeadlineAt = Date.now() + maxDuration * 1000 - AUDIT_TIMEOUT_SAFETY_MS;
    const remainingCoreMs = (capMs: number) => Math.min(capMs, Math.max(1_000, auditDeadlineAt - Date.now()));

    await updateProgress("Running SEO, CRO, keywords, competitors & content research", 5);

    // Track individual completions for progress updates
    let completed = 0;
    const totalSteps = 5;
    const stepLabels = ["SEO audit", "CRO audit", "Keyword tracking", "Competitor analysis", "Content research"];
    const onStepDone = async (index: number) => {
      completed++;
      const percent = Math.round((completed / totalSteps) * 60); // 0-60% for API calls
      await updateProgress(`${stepLabels[index]} complete (${completed}/${totalSteps})`, percent);
    };

    // Call 5 growth-tools endpoints in parallel, tracking progress
    const seoPromise = fetch(`${GROWTH_TOOLS_URL}/api/seo-audits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY },
      body: JSON.stringify({ websiteUrl, businessType }),
      // Growth Tools owns its 3-minute crawl budget; this outer bound prevents
      // one upstream request from consuming the CMS function's entire lifetime.
      signal: AbortSignal.timeout(Math.min(SEO_AUDIT_REQUEST_BUDGET_MS, Math.max(1_000, auditDeadlineAt - Date.now()))),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`SEO audit failed: ${res.status}`);
      const data = await res.json();
      await onStepDone(0);
      return data;
    });

    const croPromise = fetch(`${GROWTH_TOOLS_URL}/api/audits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY },
      body: JSON.stringify({ websiteUrl, conversionGoal: conversionGoal || "lead generation", businessType }),
      signal: AbortSignal.timeout(remainingCoreMs(120_000)),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`CRO audit failed: ${res.status}`);
      const data = await res.json();
      await onStepDone(1);
      return data;
    });

    // Batch keywords in chunks of 50 (Growth Tools API limit)
    const KW_BATCH_SIZE = 50;
    const kwPromise = (async () => {
      const batches: string[][] = [];
      for (let i = 0; i < keywordsList.length; i += KW_BATCH_SIZE) {
        batches.push(keywordsList.slice(i, i + KW_BATCH_SIZE));
      }
      console.log(`[kw-batch] Sending ${keywordsList.length} keywords in ${batches.length} batch(es)`);

      const batchResults = await Promise.all(
        batches.map(async (batch) => {
          const res = await fetch(`${GROWTH_TOOLS_URL}/api/track-keywords`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY },
            body: JSON.stringify({ website: websiteUrl, keywords: batch.join("\n"), location: targetLocation || undefined, language: searchLanguage || undefined }),
            signal: AbortSignal.timeout(remainingCoreMs(210_000)),
          });
          if (!res.ok) throw new Error(`Keywords failed: ${res.status}`);
          return res.json();
        })
      );

      // Merge batch results — combine keyword arrays from each batch
      const merged: any = { ...batchResults[0] };
      const allKeywords: any[] = [];
      for (const result of batchResults) {
        const kws = result.keywords || result.results || result;
        if (Array.isArray(kws)) allKeywords.push(...kws);
      }
      merged.keywords = allKeywords;
      console.log(`[kw-batch] Merged ${allKeywords.length} keywords from ${batches.length} batch(es)`);

      await onStepDone(2);
      return merged;
    })();

    const compPromise = fetch(`${GROWTH_TOOLS_URL}/api/competitor-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY },
      body: JSON.stringify({ websiteUrl, keywords: keywordsCommaSeparated, location: targetLocation || undefined, language: searchLanguage || undefined }),
      signal: AbortSignal.timeout(remainingCoreMs(210_000)),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`Competitor analysis failed: ${res.status}`);
      const data = await res.json();
      await onStepDone(3);
      return data;
    });

    const crPromise = (async () => {
      const crLocation = targetLocation ? targetLocation.split(":")[0] : "au";

      // Pick content research keywords distributed across categories
      let topKeywords: string[];
      if (keywordCategories && keywordCategories.length > 1) {
        // Round-robin across categories until we have up to 5
        const catKeywordLists = keywordCategories.map((c) =>
          (c.keywords || "").split("\n").map((k: string) => k.trim()).filter(Boolean)
        );
        topKeywords = [];
        let round = 0;
        while (topKeywords.length < 5) {
          let added = false;
          for (const list of catKeywordLists) {
            if (round < list.length && topKeywords.length < 5) {
              topKeywords.push(list[round]);
              added = true;
            }
          }
          if (!added) break;
          round++;
        }
      } else {
        topKeywords = keywordsList.slice(0, 5);
      }
      // Bound content research against both its own budget and the overall audit
      // deadline so a slow/throttled upstream can never strand the proposal.
      const crDeadlineAt = Math.min(auditDeadlineAt, Date.now() + CONTENT_RESEARCH_BUDGET_MS);
      const results = await Promise.allSettled(
        topKeywords.map((keyword: string) => {
          const remainingMs = Math.max(1000, crDeadlineAt - Date.now());
          return fetch(`${GROWTH_TOOLS_URL}/api/content-research`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY! },
            body: JSON.stringify({ keyword, location: crLocation, language: searchLanguage || undefined }),
            signal: AbortSignal.timeout(remainingMs),
          }).then(async (res) => {
            if (!res.ok) throw new Error(`Content research failed for "${keyword}": ${res.status}`);
            return res.json();
          });
        })
      );
      const crDropped = results.filter((r) => r.status === "rejected").length;
      if (crDropped > 0) {
        console.warn(`[content-research] ${crDropped}/${topKeywords.length} keyword(s) dropped (budget/timeout) — best-effort, not blocking completion`);
      }
      await onStepDone(4);
      return results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
        .map((r) => r.value);
    })();

    const [seoResult, croResult, kwResult, compResult, crResult] = await Promise.allSettled([
      seoPromise, croPromise, kwPromise, compPromise, crPromise,
    ]);

    const auditIds: Record<string, number | string | number[] | null> = {
      seoAudit: null,
      croAudit: null,
      keywordSnapshot: null,
      competitorAnalysis: null,
      contentResearch: null,
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
            lighthouseScores: seo.lighthouseScores ?? null,
            proposal: proposalId,
          },
          overrideAccess: true,
        });
        auditIds.seoAudit = created.id;
      } catch (e: any) {
        errors.push(`SEO record creation failed: ${e.message}`);
      }
    } else {
      const seoError = seoResult.reason?.message || "SEO audit failed";
      if (existingSeoAuditId) {
        try {
          const existingSeoAudit = await payload.findByID({
            collection: "seo-audits",
            id: existingSeoAuditId,
            overrideAccess: true,
          });
          if (hasValue(existingSeoAudit?.lighthouseScores)) {
            auditIds.seoAudit = existingSeoAuditId;
            errors.push(`${seoError}; reused existing SEO audit ${existingSeoAuditId}`);
          } else {
            errors.push(`${seoError}; existing SEO audit ${existingSeoAuditId} is incomplete`);
          }
        } catch (e: any) {
          errors.push(`${seoError}; existing SEO audit ${existingSeoAuditId} could not be loaded: ${e.message}`);
        }
      } else {
        errors.push(seoError);
      }
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
            firstImpressionScore: cro.firstImpressionScore,
            trustScore: cro.trustScore,
            ctaScore: cro.ctaScore,
            leadCaptureScore: cro.leadCaptureScore,
            contentReadabilityScore: cro.contentReadabilityScore,
            navigationScore: cro.navigationScore,
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
        const kwArrayRaw = Array.isArray(kwData) ? kwData : [];
        // Debug: log first keyword entry to identify field names from Growth Tools API
        if (kwArrayRaw.length > 0) {
          console.log("[kw-debug] First keyword entry fields:", JSON.stringify(Object.keys(kwArrayRaw[0])), "sample:", JSON.stringify(kwArrayRaw[0]));
        }
        // Normalize field names — Growth Tools may return search_volume, volume, monthlySearches etc.
        const kwArray = kwArrayRaw.map((k: any) => ({
          ...k,
          searchVolume: k.searchVolume ?? k.search_volume ?? k.volume ?? k.monthlySearches ?? k.monthly_searches ?? null,
        }));

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
        // Debug: log the full structure of the first competitor to diagnose missing fields
        const firstComp = comp.competitors?.[0];
        console.log(`[competitor-debug] API returned ${comp.competitors?.length ?? 0} competitors. Keys on response: ${Object.keys(comp).join(", ")}`);
        if (firstComp) {
          console.log(`[competitor-debug] First competitor keys: ${Object.keys(firstComp).join(", ")}`);
          console.log(`[competitor-debug] ${firstComp.domain || firstComp.url || firstComp.website || "NO-DOMAIN"}: websiteScreenshot=${firstComp.websiteScreenshot ? 'YES (' + String(firstComp.websiteScreenshot).length + ' chars)' : 'NO'}, metaAds.adScreenshots=${firstComp.metaAds?.adScreenshots?.length ?? 0} items`);
        }
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

    // Create content research records (one per keyword) BEFORE the slow
    // screenshot/meta/traffic post-processing below. Content research is the
    // longest-running upstream call, so persisting its questions here means the
    // Organic Propulsion slide's questions survive even if post-processing later
    // overruns the function budget and the run is killed before the final write.
    if (crResult.status === "fulfilled") {
      try {
        const crResults = crResult.value as any[];
        const crIds: number[] = [];
        for (const cr of crResults) {
          const created = await payload.create({
            collection: "content-researches",
            data: {
              keyword: cr.keyword,
              location: cr.location || null,
              totalQuestions: cr.totalQuestions || 0,
              clusters: cr.clusters || [],
              externalId: cr.id || null,
              proposal: proposalId,
            },
            overrideAccess: true,
          });
          crIds.push(created.id as number);
        }
        if (crIds.length > 0) {
          auditIds.contentResearch = crIds;
        }
      } catch (e: any) {
        errors.push(`Content research record creation failed: ${e.message}`);
      }
    } else {
      errors.push(crResult.reason?.message || "Content research failed");
    }

    // Commit and link the core audit records before optional screenshots, Meta
    // and traffic enrichment. If Vercel later terminates the auxiliary phase,
    // the proposal remains usable instead of being stranded at "running" with
    // orphaned records.
    await updateProgress("Saving core audit results", 62);
    const coreValidationErrors = await validateProposalAuditReport(payload, id, auditIds);
    await persistCoreAuditCheckpoint({
      payload,
      proposalId: id,
      auditIds,
      errors,
      validationErrors: coreValidationErrors,
      preservedFields: preservedArrayFields,
    });

    // Dispatch optional work to a separate Vercel invocation with its own
    // maxDuration. The core proposal is already linked and complete at this point.
    if (auditIds.competitorAnalysis) {
      try {
        await dispatchProposalAuditEnrichment({
          origin: req.nextUrl.origin,
          proposalId: id,
          internalApiKey: INTERNAL_API_KEY,
        });
      } catch (dispatchError: any) {
        console.error("[run-audits] Optional enrichment dispatch failed:", dispatchError?.message || dispatchError);
        const failed = failedOptionalEnrichmentState(dispatchError);
        await payload.update({
          collection: "client-proposals",
          id,
          data: {
            metaAdsStatus: failed.status,
            metaAdsError: failed.error,
            metaAdsUpdatedAt: new Date().toISOString(),
          } as any,
          overrideAccess: true,
        }).catch((statusError: any) => {
          console.error("[run-audits] Failed to persist enrichment dispatch error:", statusError?.message || statusError);
        });
      }
    }

    console.log(`[run-audits] Core audit finished for proposal ${id}; optional enrichment dispatched separately`);
  } catch (e: any) {
    // Unexpected error — mark as failed
    console.error("[run-audits] Unexpected error:", e.message);
    try {
      await payload.update({
        collection: "client-proposals",
        id,
        data: {
          auditStatus: "failed",
          auditProgress: "Failed|100",
          auditCompletedAt: new Date().toISOString(),
          auditError: e.message || "Unexpected error",
          ...preservedArrayFields,
        } as any,
        overrideAccess: true,
      });
    } catch (statusError: any) {
      console.error("[run-audits] Failed to persist unexpected-error status:", statusError?.message || statusError);
    }
  }

  }; // end auditWork

  // Use next/server after() to keep the serverless function alive after the response
  after(auditWork);

  return NextResponse.json({ ok: true, status: "running" });
}
