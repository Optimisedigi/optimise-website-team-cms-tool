import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { captureWebsiteScreenshot, captureScreenshotViaGrowthTools, captureScreenshotViaScreenshotOne } from "@/lib/screenshots";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// SimilarWeb only tracks root domains, not subdomains.
// e.g. "my.clevelandclinic.org" → "clevelandclinic.org"
// Handles multi-part TLDs like .org.au, .co.uk, .com.au
const MULTI_PART_TLDS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'co.nz', 'co.za', 'com.au', 'org.au', 'net.au',
  'co.in', 'co.jp', 'co.kr', 'com.br', 'com.mx', 'com.sg', 'com.hk', 'com.tw',
  'co.il', 'co.th', 'or.jp', 'ne.jp', 'org.nz', 'com.ar', 'com.co', 'com.vn',
]);

function extractRootDomain(domain: string): string {
  const clean = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const parts = clean.split('.');
  if (parts.length <= 2) return clean;

  // Check if the last two parts form a multi-part TLD
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo)) {
    // root domain = name + multi-part TLD (e.g. tg.org.au)
    return parts.slice(-3).join('.');
  }
  // Standard TLD: root domain = name + TLD (e.g. clevelandclinic.org)
  return parts.slice(-2).join('.');
}

// Traffic endpoint returns monthlyVisits as an array of {month, visits} objects.
// Extract the latest month's visits, or fall back to averageMonthlyVisits.
function extractMonthlyVisits(td: any): number | null {
  if (!td) return null;
  if (typeof td.averageMonthlyVisits === "number") return td.averageMonthlyVisits;
  if (Array.isArray(td.monthlyVisits) && td.monthlyVisits.length > 0) {
    const last = td.monthlyVisits[td.monthlyVisits.length - 1];
    return typeof last === "number" ? last : last?.visits ?? null;
  }
  if (typeof td.monthlyVisits === "number") return td.monthlyVisits;
  if (typeof td.estimatedMonthlyVisits === "number") return td.estimatedMonthlyVisits;
  return null;
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
  } catch {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  // Validate required fields
  const { websiteUrl, businessType, conversionGoal, targetLocation } = proposal;

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

    const kwPromise = fetch(`${GROWTH_TOOLS_URL}/api/track-keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY },
      body: JSON.stringify({ website: websiteUrl, keywords: keywordsNewlineSeparated, location: targetLocation || undefined }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`Keywords failed: ${res.status}`);
      const data = await res.json();
      await onStepDone(2);
      return data;
    });

    const compPromise = fetch(`${GROWTH_TOOLS_URL}/api/competitor-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY },
      body: JSON.stringify({ websiteUrl, keywords: keywordsCommaSeparated, location: targetLocation || undefined }),
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
      const results = await Promise.allSettled(
        topKeywords.map((keyword: string) =>
          fetch(`${GROWTH_TOOLS_URL}/api/content-research`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY! },
            body: JSON.stringify({ keyword, location: crLocation }),
          }).then(async (res) => {
            if (!res.ok) throw new Error(`Content research failed for "${keyword}": ${res.status}`);
            return res.json();
          })
        )
      );
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
        // Debug: check if screenshots are in the API response
        const firstComp = comp.competitors?.[0];
        if (firstComp) {
          console.log(`[competitor-debug] ${firstComp.domain}: websiteScreenshot=${firstComp.websiteScreenshot ? 'YES (' + String(firstComp.websiteScreenshot).length + ' chars)' : 'NO'}, metaAds.adScreenshots=${firstComp.metaAds?.adScreenshots?.length ?? 0} items`);
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

    // Post-processing: capture website screenshots via Google PageSpeed Insights API
    // Meta Ads data is kept from growth-tools API response (scraping Facebook is unreliable)
    // Falls back to existing competitor analysis if the growth-tools API failed this run
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
          const allDomains = [yourDomain, ...competitorDomains];

          console.log(`[screenshots] Starting PageSpeed screenshot capture for ${allDomains.length} domains`);

          // Capture screenshots in parallel via PageSpeed API
          const captureResults = await Promise.allSettled(
            allDomains.map(async (domain: string) => {
              const screenshot = await captureWebsiteScreenshot(domain);
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

          // Capture screenshots for CMS competitors not found in the API response
          const cmsCompetitors = (proposal.competitors ?? []) as { name: string; websiteUrl?: string | null }[];
          const apiDomains = new Set(competitorDomains.map((d: string) => d.replace(/^www\./, "")));
          const missingCmsCompetitors: { name: string; domain: string }[] = [];

          for (const c of cmsCompetitors) {
            if (!c.websiteUrl) continue;
            const domain = c.websiteUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
            if (!apiDomains.has(domain)) {
              missingCmsCompetitors.push({ name: c.name, domain });
            }
          }

          if (missingCmsCompetitors.length > 0) {
            await updateProgress("Fetching CMS competitor data", 75);
            console.log(`[cms-competitors] Fetching data for ${missingCmsCompetitors.length} CMS-only competitors`);

            // Fetch traffic data (SimilarWeb) AND screenshots in parallel for each CMS competitor
            // Uses the lightweight /api/traffic endpoint instead of full competitor-analysis
            const cmsDataResults = await Promise.allSettled(
              missingCmsCompetitors.map(async ({ domain }) => {
                const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
                const rootDomain = extractRootDomain(domain);

                const [trafficResult, screenshotResult] = await Promise.allSettled([
                  fetch(`${GROWTH_TOOLS_URL}/api/traffic?domain=${encodeURIComponent(rootDomain)}`, {
                    headers: { "x-internal-key": INTERNAL_API_KEY! },
                  }).then(async (res) => {
                    if (!res.ok) return null;
                    return res.json();
                  }),
                  captureWebsiteScreenshot(domain).then(async (result) => {
                    if (result) return result;
                    // Fallback to growth-tools Puppeteer endpoint
                    return captureScreenshotViaGrowthTools(domain);
                  }),
                ]);

                const trafficData = trafficResult.status === "fulfilled" ? trafficResult.value : null;
                const screenshot = screenshotResult.status === "fulfilled" ? screenshotResult.value : null;

                console.log(`[cms-competitors] ${domain} — traffic endpoint:`, trafficData ? JSON.stringify(trafficData).slice(0, 300) : 'null');

                return { domain, trafficData, screenshot };
              })
            );

            // Append enriched competitor entries using traffic endpoint data
            for (const result of cmsDataResults) {
              if (result.status === "fulfilled") {
                const { domain, trafficData, screenshot } = result.value;
                // Traffic endpoint returns: { monthlyVisits, globalRank, categoryRank, sources, ... }
                const traffic = trafficData ? {
                  monthlyVisits: extractMonthlyVisits(trafficData),
                  globalRank: trafficData.globalRank ?? null,
                  categoryRank: trafficData.categoryRank ?? null,
                  sources: trafficData.sources ?? trafficData.trafficSources ?? null,
                } : null;
                enrichedCompetitors.push({
                  domain,
                  traffic,
                  websiteScreenshot: screenshot || null,
                  metaAds: null,
                  googleAds: null,
                  googleBusinessProfile: null,
                });
                if (screenshot) screenshotMap.set(domain, screenshot);
              }
            }
          }

          // Backfill traffic via /api/traffic for any competitor (API-discovered or CMS) missing valid traffic data
          const noTrafficComps = enrichedCompetitors.filter((c: any) =>
            !c.traffic || typeof c.traffic.monthlyVisits !== "number"
          );
          if (noTrafficComps.length > 0) {
            await updateProgress("Backfilling traffic data", 85);
            console.log(`[traffic-backfill] Fetching traffic for ${noTrafficComps.length} competitors with null traffic`);
            const trafficResults = await Promise.allSettled(
              noTrafficComps.map(async (comp: any) => {
                const rootDomain = extractRootDomain(comp.domain || "");
                const res = await fetch(`${GROWTH_TOOLS_URL}/api/traffic?domain=${encodeURIComponent(rootDomain)}`, {
                  headers: { "x-internal-key": INTERNAL_API_KEY! },
                });
                if (!res.ok) return { domain: comp.domain, trafficData: null };
                const trafficData = await res.json();
                console.log(`[traffic-backfill] ${rootDomain}:`, trafficData ? JSON.stringify(trafficData).slice(0, 300) : 'null');
                return { domain: comp.domain, trafficData };
              })
            );
            const trafficMap = new Map<string, any>();
            for (const r of trafficResults) {
              if (r.status === "fulfilled" && r.value.trafficData) {
                trafficMap.set(r.value.domain, r.value.trafficData);
              }
            }
            for (const comp of enrichedCompetitors) {
              if ((!comp.traffic || typeof comp.traffic.monthlyVisits !== "number") && trafficMap.has(comp.domain)) {
                const td = trafficMap.get(comp.domain);
                comp.traffic = {
                  monthlyVisits: extractMonthlyVisits(td),
                  globalRank: td.globalRank ?? null,
                  categoryRank: td.categoryRank ?? null,
                  sources: td.sources ?? td.trafficSources ?? null,
                };
              }
            }
          }

          // Also backfill yourProfile traffic if missing or invalid
          if (enrichedYourProfile && (!enrichedYourProfile.traffic || typeof enrichedYourProfile.traffic.monthlyVisits !== "number")) {
            try {
              const rootDomain = extractRootDomain(enrichedYourProfile.domain || yourDomain);
              const res = await fetch(`${GROWTH_TOOLS_URL}/api/traffic?domain=${encodeURIComponent(rootDomain)}`, {
                headers: { "x-internal-key": INTERNAL_API_KEY! },
              });
              if (res.ok) {
                const td = await res.json();
                console.log(`[traffic-backfill] yourProfile ${rootDomain}:`, JSON.stringify(td).slice(0, 300));
                enrichedYourProfile.traffic = {
                  monthlyVisits: extractMonthlyVisits(td),
                  globalRank: td.globalRank ?? null,
                  categoryRank: td.categoryRank ?? null,
                  sources: td.sources ?? td.trafficSources ?? null,
                };
              }
            } catch (e: any) {
              console.error("[traffic-backfill] yourProfile failed:", e.message);
            }
          }

          const recordId = (auditIds.competitorAnalysis ?? compAnalysisId) as number;
          // Update the competitor-analyses record with enriched screenshots (including CMS stubs)
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
          const totalDomains = allDomains.length + missingCmsCompetitors.length;
          console.log(`[screenshots] Finished: ${captured}/${totalDomains} domains captured`);

          // ScreenshotOne backfill: only call the paid API for screenshots that failed
          const missingScreenshotComps = enrichedCompetitors.filter((c: any) => !c.websiteScreenshot && c.domain);
          const yourProfileMissing = enrichedYourProfile && !enrichedYourProfile.websiteScreenshot;

          if (missingScreenshotComps.length > 0 || yourProfileMissing) {
            await updateProgress("Backfilling missing screenshots (ScreenshotOne)", 90);
            const backfillDomains: { domain: string; isYourProfile: boolean }[] = [];

            if (yourProfileMissing) {
              backfillDomains.push({ domain: enrichedYourProfile.domain || yourDomain, isYourProfile: true });
            }
            for (const c of missingScreenshotComps) {
              backfillDomains.push({ domain: c.domain, isYourProfile: false });
            }

            console.log(`[screenshots-backfill] Using ScreenshotOne for ${backfillDomains.length} missing screenshots`);

            const backfillResults = await Promise.allSettled(
              backfillDomains.map(async ({ domain }) => {
                const screenshot = await captureScreenshotViaScreenshotOne(domain);
                return { domain, screenshot };
              })
            );

            let backfilled = 0;
            for (const result of backfillResults) {
              if (result.status !== "fulfilled" || !result.value.screenshot) continue;
              const { domain, screenshot } = result.value;
              const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
              backfilled++;

              // Update yourProfile if it was missing
              if (enrichedYourProfile && !enrichedYourProfile.websiteScreenshot) {
                const yourKey = (enrichedYourProfile.domain || yourDomain).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
                if (yourKey === cleanDomain) {
                  enrichedYourProfile.websiteScreenshot = screenshot;
                }
              }

              // Update matching competitor
              for (const comp of enrichedCompetitors) {
                const compKey = (comp.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
                if (compKey === cleanDomain && !comp.websiteScreenshot) {
                  comp.websiteScreenshot = screenshot;
                }
              }
            }

            if (backfilled > 0) {
              console.log(`[screenshots-backfill] ScreenshotOne filled ${backfilled}/${backfillDomains.length} gaps`);
              // Re-save with backfilled screenshots
              await payload.update({
                collection: "competitor-analyses",
                id: recordId,
                data: {
                  yourProfile: enrichedYourProfile,
                  competitors: enrichedCompetitors,
                },
                overrideAccess: true,
              });
            } else {
              console.log(`[screenshots-backfill] ScreenshotOne could not fill any gaps`);
            }
          }
        }
      } catch (e: any) {
        // Non-fatal — log and continue
        console.error("[screenshots] Post-processing failed:", e.message);
        errors.push(`Screenshot post-processing failed: ${e.message}`);
      }
    }

    // Create content research records (one per keyword)
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

    // Determine final status
    await updateProgress("Saving results", 95);
    const anySucceeded = Object.values(auditIds).some((v) => v !== null);
    const allFailed = Object.values(auditIds).every((v) => v === null);

    try {
      await payload.update({
        collection: "client-proposals",
        id,
        data: {
          auditStatus: allFailed ? "failed" : "completed",
          auditProgress: allFailed ? "Failed|100" : "Complete|100",
          auditCompletedAt: new Date().toISOString(),
          auditError: errors.length > 0 ? errors.join("\n") : null,
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
        const db = (payload.db as any).drizzle;
        if (db) {
          await db.run(
            `UPDATE client_proposals SET audit_status = '${allFailed ? "failed" : "completed"}', audit_progress = '${allFailed ? "Failed|100" : "Complete|100"}', audit_completed_at = '${new Date().toISOString()}'${auditIds.seoAudit ? `, seo_audit_id = ${auditIds.seoAudit}` : ""}${auditIds.croAudit ? `, cro_audit_id = ${auditIds.croAudit}` : ""}${auditIds.keywordSnapshot ? `, keyword_snapshot_id = ${auditIds.keywordSnapshot}` : ""}${auditIds.competitorAnalysis ? `, competitor_analysis_id = ${auditIds.competitorAnalysis}` : ""} WHERE id = ${id}`
          );
        }
      } catch (sqlErr: any) {
        console.error("[run-audits] Raw SQL fallback also failed:", sqlErr.message);
      }
    }

    console.log(`[run-audits] Finished for proposal ${id}: ${allFailed ? "failed" : "completed"}`);
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
