import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { explicitUnavailableTraffic, extractRootDomain, formatTraffic, hasTrafficCoverage, normaliseDomain, type FormattedTraffic } from "@/lib/proposal-audit-backfill";

export const maxDuration = 300;

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const TRAFFIC_FETCH_TIMEOUT_MS = 20_000;

function relationshipId(value: any): number | string | null {
  if (!value) return null;
  if (typeof value === "object") return value.id ?? null;
  return value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTrafficRecoverable(rootDomain: string): Promise<FormattedTraffic> {
  const backoffs = [1000, 3000, 7000];
  let lastReason = "failed";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${GROWTH_TOOLS_URL}/api/traffic?domain=${encodeURIComponent(rootDomain)}`, {
        headers: { "x-internal-key": INTERNAL_API_KEY! },
        signal: AbortSignal.timeout(TRAFFIC_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Traffic API failed: ${res.status}`);
      const data = await res.json();
      if (data?.status === "unavailable") {
        lastReason = data.unavailableReason ?? "failed";
        if (["blocked", "failed"].includes(lastReason) && attempt < 2) throw new Error(`Traffic unavailable: ${lastReason}`);
      }
      return formatTraffic(data);
    } catch (err: any) {
      lastReason = err?.name === "TimeoutError" || err?.name === "AbortError" ? "timeout" : lastReason;
      if (attempt < 2) await sleep(backoffs[attempt] + Math.floor(Math.random() * 500));
    }
  }

  return explicitUnavailableTraffic(lastReason);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
      { status: 500 },
    );
  }

  let proposal: any;
  try {
    proposal = await payload.findByID({
      collection: "client-proposals",
      id,
      overrideAccess: true,
    });
  } catch (err: any) {
    console.error(`[backfill-report-data] Failed to fetch proposal ${id}:`, err?.message || err);
    return NextResponse.json({ error: "Proposal not found", detail: err?.message }, { status: 404 });
  }

  const { websiteUrl, businessType } = proposal;
  if (!websiteUrl || !businessType) {
    return NextResponse.json(
      { error: "Missing required fields: websiteUrl, businessType" },
      { status: 400 },
    );
  }

  const preservedArrayFields = {
    competitors: proposal.competitors ?? [],
    keywordCategories: (proposal as any).keywordCategories ?? [],
    googleMapsUrls: (proposal as any).googleMapsUrls ?? [],
    flightPlanImages: (proposal as any).flightPlanImages ?? [],
    missionResourcesImages: (proposal as any).missionResourcesImages ?? [],
  };

  await payload.update({
    collection: "client-proposals",
    id,
    data: {
      auditStatus: "running",
      auditProgress: "Backfilling SEO/PageSpeed and competitor traffic|0",
      auditStartedAt: new Date().toISOString(),
      auditCompletedAt: null,
      auditError: null,
      ...preservedArrayFields,
    } as any,
    overrideAccess: true,
  });

  const updateProgress = (stage: string, percent: number) =>
    payload.update({
      collection: "client-proposals",
      id,
      data: { auditProgress: `${stage}|${percent}` } as any,
      overrideAccess: true,
    }).catch(() => {});

  const auditWork = async () => {
    const errors: string[] = [];
    let seoAuditId: number | string | null = null;
    const competitorAnalysisId = relationshipId(proposal.competitorAnalysis);

    try {
      await updateProgress("Running SEO/PageSpeed audit", 10);
      const seoRes = await fetch(`${GROWTH_TOOLS_URL}/api/seo-audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY! },
        body: JSON.stringify({ websiteUrl, businessType }),
      });
      if (!seoRes.ok) throw new Error(`SEO audit failed: ${seoRes.status}`);
      const seo = await seoRes.json();

      await updateProgress("Saving SEO/PageSpeed result", 45);
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
          proposal: Number(id),
        },
        overrideAccess: true,
      });
      seoAuditId = created.id;

      if (competitorAnalysisId != null) {
        await updateProgress("Backfilling missing competitor traffic", 60);
        const competitorAnalysis = await payload.findByID({
          collection: "competitor-analyses",
          id: competitorAnalysisId as any,
          overrideAccess: true,
        });

        const profiles: { key: string; profile: any }[] = [];
        if (competitorAnalysis?.yourProfile && !hasTrafficCoverage(competitorAnalysis.yourProfile)) {
          profiles.push({ key: "yourProfile", profile: competitorAnalysis.yourProfile });
        }
        const competitors = Array.isArray(competitorAnalysis?.competitors) ? competitorAnalysis.competitors : [];
        competitors.forEach((profile: any, index: number) => {
          if (!hasTrafficCoverage(profile)) profiles.push({ key: String(index), profile });
        });

        const trafficResults = await Promise.allSettled(
          profiles.map(async ({ key, profile }) => {
            const domain = profile?.domain || profile?.website || profile?.url;
            if (!domain) return { key, traffic: explicitUnavailableTraffic("invalid_domain"), domain: "" };
            const rootDomain = extractRootDomain(domain);
            if (!rootDomain) return { key, traffic: explicitUnavailableTraffic("invalid_domain"), domain };
            const traffic = await fetchTrafficRecoverable(rootDomain);
            return { key, traffic, domain: rootDomain };
          }),
        );

        const trafficMap = new Map<string, FormattedTraffic>();
        for (const result of trafficResults) {
          if (result.status === "fulfilled") {
            trafficMap.set(result.value.key, result.value.traffic);
            if (result.value.traffic.status === "unavailable" && result.value.domain) {
              errors.push(`Traffic unavailable for ${result.value.domain}`);
            }
          }
        }

        const updatedYourProfile = competitorAnalysis?.yourProfile && typeof competitorAnalysis.yourProfile === "object"
          ? { ...(competitorAnalysis.yourProfile as Record<string, any>) }
          : null;
        if (updatedYourProfile && trafficMap.has("yourProfile")) {
          updatedYourProfile.traffic = trafficMap.get("yourProfile");
        }

        const updatedCompetitors = competitors.map((profile: any, index: number) => {
          const key = String(index);
          if (!trafficMap.has(key)) return profile;
          return { ...profile, traffic: trafficMap.get(key) };
        });

        await payload.update({
          collection: "competitor-analyses",
          id: competitorAnalysisId as any,
          data: {
            yourProfile: updatedYourProfile,
            competitors: updatedCompetitors,
          },
          overrideAccess: true,
        });

        const remainingProfiles = [updatedYourProfile, ...updatedCompetitors].filter(Boolean);
        const missingTraffic = remainingProfiles.filter((profile: any) => !hasTrafficCoverage(profile));
        if (missingTraffic.length > 0) {
          const domains = missingTraffic
            .map((profile: any) => normaliseDomain(profile?.domain || profile?.website || profile?.url || ""))
            .filter(Boolean);
          errors.push(`Traffic still missing for ${missingTraffic.length} profile(s)${domains.length ? `: ${domains.join(", ")}` : ""}`);
        }
      } else {
        errors.push("No linked competitor analysis found; SEO/PageSpeed refreshed only.");
      }

      await updateProgress("Saving backfill results", 95);
      await payload.update({
        collection: "client-proposals",
        id,
        data: {
          auditStatus: "completed",
          auditProgress: errors.length > 0 ? "Backfill completed with warnings|100" : "Backfill complete|100",
          auditCompletedAt: new Date().toISOString(),
          auditError: errors.length > 0 ? errors.join("\n") : null,
          seoAudit: seoAuditId,
          ...preservedArrayFields,
        } as any,
        overrideAccess: true,
      });
    } catch (e: any) {
      console.error("[backfill-report-data] Failed:", e?.message || e);
      await payload.update({
        collection: "client-proposals",
        id,
        data: {
          auditStatus: "failed",
          auditProgress: "Backfill failed|100",
          auditCompletedAt: new Date().toISOString(),
          auditError: e?.message || "Unexpected backfill error",
          ...(seoAuditId ? { seoAudit: seoAuditId } : {}),
          ...preservedArrayFields,
        } as any,
        overrideAccess: true,
      }).catch(() => {});
    }
  };

  after(auditWork);

  return NextResponse.json({ ok: true, status: "running" });
}
