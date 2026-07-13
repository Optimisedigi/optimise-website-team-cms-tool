import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { captureAndUploadScreenshot, type ScreenshotOptions } from "@/lib/screenshots";
import { fetchMetaAdsForCompetitors } from "@/lib/proposal-meta-ads";
import { explicitUnavailableTraffic, extractRootDomain, hasValue, hasTrafficCoverage, formatTraffic, type FormattedTraffic } from "@/lib/proposal-audit-backfill";

// Allow up to 300s for the background audit pipeline (Vercel Pro max).
// Without this, the default ~15s timeout kills `after()` mid-execution,
// leaving auditStatus stuck at "running".
export const maxDuration = 300;

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const AUXILIARY_FETCH_TIMEOUT_MS = 20_000;
const AUDIT_TIMEOUT_SAFETY_MS = 45_000;
const TRAFFIC_BATCH_BUDGET_MS = 70_000;
// Content research is best-effort (it is never validated in
// validateProposalAuditReport) but each Growth Tools call can take 3+ minutes
// when the Google Ads volume API is throttled. Left unbounded it blocks the
// Promise.allSettled below and pushes screenshots/meta/traffic post-processing
// past Vercel's maxDuration, so the function is killed before the final status
// write and the proposal is stranded at "running". Cap it (still under the
// overall audit deadline) so a runaway upstream can't consume the whole budget,
// while leaving enough headroom for the questions to actually come back — they
// feed the Organic Propulsion slide. Timed-out keywords are simply dropped.
const CONTENT_RESEARCH_BUDGET_MS = 180_000;

async function withTimeout<T>(work: Promise<T>, ms = AUXILIARY_FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms)),
  ]);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTrafficRecoverable(rootDomain: string): Promise<FormattedTraffic> {
  const backoffs = [1000, 3000, 7000];
  let lastReason = "failed";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${GROWTH_TOOLS_URL}/api/traffic?domain=${encodeURIComponent(rootDomain)}`, {
        headers: { "x-internal-key": INTERNAL_API_KEY! },
        signal: AbortSignal.timeout(AUXILIARY_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Traffic API failed: ${res.status}`);
      const data = await res.json();
      if (data?.status === "unavailable") {
        return formatTraffic(data);
      }
      return formatTraffic(data);
    } catch (err: any) {
      lastReason = err?.name === "TimeoutError" || err?.name === "AbortError" ? "timeout" : lastReason;
      if (attempt < 2) await sleep(backoffs[attempt] + Math.floor(Math.random() * 500));
    }
  }

  return explicitUnavailableTraffic(lastReason);
}

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
      const competitors = Array.isArray(competitorAnalysis?.competitors) ? competitorAnalysis.competitors : [];
      const profiles = [competitorAnalysis?.yourProfile, ...competitors].filter(Boolean);
      const missingTrafficProfiles = profiles.filter((profile: any) => !hasTrafficCoverage(profile));
      if (profiles.length === 0 || missingTrafficProfiles.length > 0) {
        missing.push(
          `profiles without traffic status (${missingTrafficProfiles.length || profiles.length}/${profiles.length || 1})`,
        );
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
      data: { auditProgress: `${stage}|${percent}` } as any,
      overrideAccess: true,
    }).catch(() => {});

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
    const hasTimeForTrafficBatch = () => Date.now() + TRAFFIC_BATCH_BUDGET_MS < auditDeadlineAt;

    // Meta Ads is best-effort and must never block proposal completion — its
    // outcome is tracked separately so it can be re-run via the refresh button.
    let metaAdsStatus: "idle" | "completed" | "failed" = "idle";
    let metaAdsError: string | null = null;

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
          searchVolume: k.searchVolume ?? k.search_volume ?? k.volume ?? k.monthlySearches ?? k.monthly_searches ?? 0,
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

    // Post-processing: capture website screenshots via Scrapling service (→ Blob URL)
    // Falls back to PageSpeed (→ base64). Traffic backfill still uses growth-tools /api/traffic.
    const compAnalysisId = auditIds.competitorAnalysis ?? proposal.competitorAnalysis?.id ?? proposal.competitorAnalysis;
    if (compAnalysisId != null) {
      try {
        // Load existing record if growth-tools failed this run
        let compData: any = null;
        if (compResult.status === "fulfilled") {
          compData = compResult.value;
        } else if (typeof compAnalysisId === "number" || typeof compAnalysisId === "string") {
          const existing = await payload.findByID({
            collection: "competitor-analyses",
            id: compAnalysisId as number,
            overrideAccess: true,
          });
          compData = existing;
        }

        if (compData) {
          await updateProgress("Capturing website screenshots", 65);
          const yourDomain = compData?.yourProfile?.domain || websiteUrl;
          const competitorDomains: string[] = (compData?.competitors || []).map((c: any) => c.domain).filter(Boolean);

          // Screenshot options for the prospect's own site (e.g. age-gate click)
          const clickSelector = (proposal as any).screenshotClickSelector as string | undefined;
          const yourDomainClean = yourDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
          const screenshotOpts: ScreenshotOptions | undefined = clickSelector ? { clickSelector } : undefined;

          // Collect CMS-only competitors (not in API response)
          const cmsCompetitors = (proposal.competitors ?? []) as { name: string; websiteUrl?: string | null }[];
          const apiDomains = new Set(competitorDomains.map((d: string) => d.replace(/^www\./, "")));
          const cmsOnlyDomains: string[] = [];
          for (const c of cmsCompetitors) {
            if (!c.websiteUrl) continue;
            const domain = c.websiteUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
            if (!apiDomains.has(domain)) cmsOnlyDomains.push(domain);
          }

          // Single pass: capture all screenshots in parallel via Scrapling → Blob (or PageSpeed fallback)
          const allDomains = [yourDomain, ...competitorDomains, ...cmsOnlyDomains];
          console.log(`[screenshots] Capturing screenshots for ${allDomains.length} domains`);

          const captureResults = await Promise.allSettled(
            allDomains.map(async (domain: string) => {
              const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
              const opts = cleanDomain === yourDomainClean ? screenshotOpts : undefined;
              const screenshot = await withTimeout(
                captureAndUploadScreenshot(`https://${cleanDomain}`, opts),
                AUXILIARY_FETCH_TIMEOUT_MS,
              );
              return { domain, screenshot };
            })
          );

          // Build a lookup map
          const screenshotMap = new Map<string, string>();
          for (const result of captureResults) {
            if (result.status === "fulfilled" && result.value.screenshot) {
              const cleanDomain = result.value.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
              screenshotMap.set(cleanDomain, result.value.screenshot);
            }
          }

          // Merge screenshots into competitor data (preserve existing metaAds from growth-tools)
          const enrichedYourProfile = compData?.yourProfile ? { ...compData.yourProfile } : null;
          if (enrichedYourProfile) {
            const key = (enrichedYourProfile.domain || yourDomain).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
            const screenshot = screenshotMap.get(key);
            if (screenshot) enrichedYourProfile.websiteScreenshot = screenshot;
          }

          const enrichedCompetitors = (compData?.competitors || []).map((comp: any) => {
            const key = (comp.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
            const screenshot = screenshotMap.get(key);
            if (screenshot) {
              return { ...comp, websiteScreenshot: screenshot };
            }
            return comp;
          });

          // Append CMS-only competitors as stub entries with screenshots
          for (const domain of cmsOnlyDomains) {
            const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
            enrichedCompetitors.push({
              domain: cleanDomain,
              traffic: null,
              websiteScreenshot: screenshotMap.get(cleanDomain) || null,
              metaAds: null,
              googleAds: null,
              googleBusinessProfile: null,
            });
          }

          // Combined pass: extract social links → Meta Ad Library per competitor.
          // This is best-effort: it self-limits against the audit deadline and
          // never throws upward, so a slow/flaky Scrapling service can no longer
          // strand the whole proposal at "running". A failure is recorded in
          // metaAdsStatus and can be re-run via /api/proposals/[id]/refresh-meta-ads.
          await updateProgress("Checking social links & Meta Ad Library", 71);
          console.log(`[social+meta] Processing ${enrichedCompetitors.length} competitors (social links → meta ads)`);
          try {
            const metaResult = await fetchMetaAdsForCompetitors(enrichedCompetitors, {
              timeoutMs: AUXILIARY_FETCH_TIMEOUT_MS,
              deadlineAt: auditDeadlineAt,
            });
            metaResult.updated.forEach((u: any, i: number) => {
              if (!u) return;
              if (u.metaAds !== undefined) enrichedCompetitors[i].metaAds = u.metaAds;
              if (u.socialLinks !== undefined) enrichedCompetitors[i].socialLinks = u.socialLinks;
            });
            if (metaResult.failed > 0 || metaResult.skipped > 0) {
              metaAdsStatus = "failed";
              metaAdsError = `Meta Ads incomplete: ${metaResult.failed} failed, ${metaResult.skipped} skipped (deadline) of ${metaResult.attempted}. Use "Refresh Meta Ads" to retry.`;
            } else {
              metaAdsStatus = "completed";
            }
          } catch (metaErr: any) {
            metaAdsStatus = "failed";
            metaAdsError = `Meta Ads enrichment failed: ${metaErr?.message || metaErr}. Use "Refresh Meta Ads" to retry.`;
            console.error("[social+meta] failed (non-fatal):", metaErr?.message || metaErr);
          }
          await updateProgress("Processing results", 85);

          // Fetch traffic for CMS-only competitors when there is enough runtime left.
          // If the audit is close to Vercel's function limit, mark traffic unavailable
          // so the proposal can still save instead of getting stranded at 87%.
          if (cmsOnlyDomains.length > 0) {
            await updateProgress("Fetching CMS competitor traffic data", 87);
            const cmsTrafficResults = hasTimeForTrafficBatch()
              ? await Promise.allSettled(
                  cmsOnlyDomains.map(async (domain) => {
                    const rootDomain = extractRootDomain(domain);
                    const traffic = rootDomain ? await fetchTrafficRecoverable(rootDomain) : explicitUnavailableTraffic("invalid_domain");
                    return { domain, traffic };
                  })
                )
              : cmsOnlyDomains.map((domain) => ({
                  status: "fulfilled" as const,
                  value: { domain, traffic: explicitUnavailableTraffic("timeout") },
                }));
            for (const r of cmsTrafficResults) {
              if (r.status !== "fulfilled") continue;
              const { domain, traffic } = r.value;
              const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
              const comp = enrichedCompetitors.find((c: any) => {
                const k = (c.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
                return k === cleanDomain;
              });
              if (comp) {
                comp.traffic = traffic;
              }
            }
          }

          // Backfill traffic via /api/traffic for any competitor missing valid traffic data
          const noTrafficComps = enrichedCompetitors.filter((c: any) => !hasTrafficCoverage(c));
          if (noTrafficComps.length > 0) {
            await updateProgress("Backfilling traffic data", 85);
            console.log(`[traffic-backfill] Fetching traffic for ${noTrafficComps.length} competitors with null traffic`);
            const trafficResults = hasTimeForTrafficBatch()
              ? await Promise.allSettled(
                  noTrafficComps.map(async (comp: any) => {
                    const rootDomain = extractRootDomain(comp.domain || "");
                    const traffic = rootDomain ? await fetchTrafficRecoverable(rootDomain) : explicitUnavailableTraffic("invalid_domain");
                    return { domain: comp.domain, traffic };
                  })
                )
              : noTrafficComps.map((comp: any) => ({
                  status: "fulfilled" as const,
                  value: { domain: comp.domain, traffic: explicitUnavailableTraffic("timeout") },
                }));
            const trafficMap = new Map<string, FormattedTraffic>();
            for (const r of trafficResults) {
              if (r.status === "fulfilled") {
                trafficMap.set(r.value.domain, r.value.traffic);
              }
            }
            for (const comp of enrichedCompetitors) {
              if (!hasTrafficCoverage(comp) && trafficMap.has(comp.domain)) {
                comp.traffic = trafficMap.get(comp.domain);
              }
            }
          }

          // Also backfill yourProfile traffic if missing or invalid
          if (enrichedYourProfile && !hasTrafficCoverage(enrichedYourProfile)) {
            try {
              if (!hasTimeForTrafficBatch()) {
                enrichedYourProfile.traffic = explicitUnavailableTraffic("timeout");
              } else {
                const rootDomain = extractRootDomain(enrichedYourProfile.domain || yourDomain);
                enrichedYourProfile.traffic = rootDomain
                  ? await fetchTrafficRecoverable(rootDomain)
                  : explicitUnavailableTraffic("invalid_domain");
              }
            } catch (e: any) {
              console.error("[traffic-backfill] yourProfile failed:", e.message);
              enrichedYourProfile.traffic = explicitUnavailableTraffic("failed");
            }
          }

          // GBP enrichment: for CMS competitors with a googleMapsUrl but no GBP data,
          // look up GBP by business name via growth-tools /api/gbp-lookup
          const cmsCompsWithMaps = (proposal.competitors ?? []) as { name: string; websiteUrl?: string | null; googleMapsUrl?: string | null }[];
          const gbpLookups = cmsCompsWithMaps
            .filter((c) => c.googleMapsUrl && c.name)
            .map((c) => {
              const domain = c.websiteUrl
                ? c.websiteUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
                : null;
              // Find the matching entry in enrichedCompetitors
              const comp = domain
                ? enrichedCompetitors.find((ec: any) => {
                    const k = (ec.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
                    return k === domain;
                  })
                : null;
              return { cmsComp: c, comp, domain };
            })
            .filter(({ comp }) => !comp?.googleBusinessProfile);

          if (gbpLookups.length > 0 && hasTimeForTrafficBatch()) {
            await updateProgress("Fetching Google Business Profile data", 88);
            console.log(`[gbp-enrich] Looking up GBP for ${gbpLookups.length} competitors by name`);
            const gbpResults = await Promise.allSettled(
              gbpLookups.map(async ({ cmsComp, comp, domain }) => {
                const res = await fetch(`${GROWTH_TOOLS_URL}/api/gbp-lookup`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY! },
                  body: JSON.stringify({ name: cmsComp.name, location: targetLocation || undefined, language: searchLanguage || undefined }),
                  signal: AbortSignal.timeout(AUXILIARY_FETCH_TIMEOUT_MS),
                });
                if (!res.ok) return { domain, cmsComp, gbp: null };
                const gbp = await res.json();
                return { domain, cmsComp, gbp };
              })
            );

            // Merge GBP data into enrichedCompetitors and collect updates for CMS overrides
            const gbpCmsUpdates: { name: string; gbpRating: number; gbpReviewCount: number; gbpRespondsToReviews: boolean }[] = [];
            for (const r of gbpResults) {
              if (r.status !== "fulfilled" || !r.value.gbp) continue;
              const { domain, cmsComp, gbp } = r.value;
              console.log(`[gbp-enrich] ${cmsComp.name}: rating=${gbp.rating}, reviews=${gbp.reviewCount}`);

              // Find and update the enriched competitor
              if (domain) {
                const comp = enrichedCompetitors.find((c: any) => {
                  const k = (c.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
                  return k === domain;
                });
                if (comp) {
                  comp.googleBusinessProfile = {
                    name: gbp.name,
                    rating: gbp.rating,
                    reviewCount: gbp.reviewCount,
                    category: gbp.category ?? null,
                    respondsToReviews: gbp.respondsToReviews ?? false,
                    responseRate: gbp.responseRate ?? null,
                  };
                }
              }

              // Collect data for CMS override persist
              gbpCmsUpdates.push({
                name: cmsComp.name,
                gbpRating: gbp.rating,
                gbpReviewCount: gbp.reviewCount,
                gbpRespondsToReviews: gbp.respondsToReviews ?? false,
              });
            }

            // Persist GBP data back to the proposal's competitors array as overrides
            if (gbpCmsUpdates.length > 0) {
              try {
                const updatedCompetitors = ((proposal.competitors ?? []) as any[]).map((c: any) => {
                  const update = gbpCmsUpdates.find((u) => u.name === c.name);
                  if (update && !c.gbpRating) {
                    return {
                      ...c,
                      gbpRating: update.gbpRating,
                      gbpReviewCount: update.gbpReviewCount,
                      gbpRespondsToReviews: update.gbpRespondsToReviews,
                    };
                  }
                  return c;
                });
                await payload.update({
                  collection: "client-proposals",
                  id,
                  data: { ...preservedArrayFields, competitors: updatedCompetitors } as any,
                  overrideAccess: true,
                });
                console.log(`[gbp-enrich] Persisted GBP overrides for ${gbpCmsUpdates.length} competitors`);
              } catch (e: any) {
                console.error("[gbp-enrich] Failed to persist CMS overrides:", e.message);
              }
            }
          }

          const recordId = (auditIds.competitorAnalysis ?? compAnalysisId) as number;
          await payload.update({
            collection: "competitor-analyses",
            id: recordId,
            data: {
              yourProfile: enrichedYourProfile,
              competitors: enrichedCompetitors,
            },
            overrideAccess: true,
          });

          const captured = screenshotMap.size;
          console.log(`[screenshots] Finished: ${captured}/${allDomains.length} domains captured`);
        }
      } catch (e: any) {
        // Non-fatal — log and continue
        console.error("[screenshots] Post-processing failed:", e.message);
        errors.push(`Screenshot post-processing failed: ${e.message}`);
      }
    }

    // Determine final status. Required report sections are validated after all
    // post-processing so incomplete client proposals never get marked completed.
    await updateProgress("Validating report completeness", 95);
    const validationErrors = await validateProposalAuditReport(payload, id, auditIds);
    errors.push(...validationErrors);

    await updateProgress("Saving results", 98);
    const allFailed = Object.values(auditIds).every((v) => v === null);
    const reportIncomplete = validationErrors.length > 0;
    const finalStatus = allFailed || reportIncomplete ? "failed" : "completed";
    const finalProgress = allFailed
      ? "Failed|100"
      : reportIncomplete
        ? "Report incomplete — retry required|100"
        : "Complete|100";
    const finalError = reportIncomplete
      ? [
          "Critical: required audit report sections are missing. Retry the audit before using this client proposal.",
          ...errors,
        ].join("\n")
      : errors.length > 0
        ? errors.join("\n")
        : null;

    try {
      await payload.update({
        collection: "client-proposals",
        id,
        data: {
          auditStatus: finalStatus,
          auditProgress: finalProgress,
          auditCompletedAt: new Date().toISOString(),
          auditError: finalError,
          metaAdsStatus,
          metaAdsError,
          metaAdsUpdatedAt: new Date().toISOString(),
          ...(auditIds.seoAudit ? { seoAudit: auditIds.seoAudit } : {}),
          ...(auditIds.croAudit ? { croAudit: auditIds.croAudit } : {}),
          ...(auditIds.keywordSnapshot ? { keywordSnapshot: auditIds.keywordSnapshot } : {}),
          ...(auditIds.competitorAnalysis ? { competitorAnalysis: auditIds.competitorAnalysis } : {}),
          ...(auditIds.contentResearch ? { contentResearch: auditIds.contentResearch } : {}),
          ...preservedArrayFields,
        } as any,
        overrideAccess: true,
      });
    } catch (updateErr: any) {
      console.error("[run-audits] Final status update via Payload failed, falling back to raw SQL:", updateErr.message);
      try {
        const sqlClient = (payload.db as any).client;
        if (sqlClient) {
          const completedAt = new Date().toISOString();
          let sql = "UPDATE `client_proposals` SET `audit_status` = ?, `audit_progress` = ?, `audit_completed_at` = ?, `audit_error` = ?, `meta_ads_status` = ?, `meta_ads_error` = ?, `meta_ads_updated_at` = ?";
          const params: any[] = [finalStatus, finalProgress, completedAt, finalError, metaAdsStatus, metaAdsError, completedAt];
          if (auditIds.seoAudit) { sql += ", `seo_audit_id` = ?"; params.push(auditIds.seoAudit); }
          if (auditIds.croAudit) { sql += ", `cro_audit_id` = ?"; params.push(auditIds.croAudit); }
          if (auditIds.keywordSnapshot) { sql += ", `keyword_snapshot_id` = ?"; params.push(auditIds.keywordSnapshot); }
          if (auditIds.competitorAnalysis) { sql += ", `competitor_analysis_id` = ?"; params.push(auditIds.competitorAnalysis); }
          sql += " WHERE `id` = ?";
          params.push(id);
          await sqlClient.execute({ sql, args: params });
        }
      } catch (sqlErr: any) {
        console.error("[run-audits] Raw SQL fallback also failed:", sqlErr.message);
      }
    }

    console.log(`[run-audits] Finished for proposal ${id}: ${finalStatus}${reportIncomplete ? " (report incomplete — retry required)" : ""}`);
  } catch (e: any) {
    // Unexpected error — mark as failed
    console.error("[run-audits] Unexpected error:", e.message);
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
    }).catch(() => {});
  }

  }; // end auditWork

  // Use next/server after() to keep the serverless function alive after the response
  after(auditWork);

  return NextResponse.json({ ok: true, status: "running" });
}
