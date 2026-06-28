import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { explicitUnavailableTraffic, extractRootDomain, formatTraffic, hasTrafficCoverage, type FormattedTraffic } from "@/lib/proposal-audit-backfill";

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
    console.error(`[refresh-competitor-traffic] Failed to fetch proposal ${id}:`, err?.message || err);
    return NextResponse.json({ error: "Proposal not found", detail: err?.message }, { status: 404 });
  }

  const competitorAnalysisId = relationshipId(proposal.competitorAnalysis);
  if (competitorAnalysisId == null) {
    return NextResponse.json({ error: "No linked competitor analysis found for this proposal" }, { status: 400 });
  }

  await payload.update({
    collection: "client-proposals",
    id,
    data: {
      auditStatus: "running",
      auditProgress: "Refreshing competitor monthly visits|0",
      auditStartedAt: new Date().toISOString(),
      auditCompletedAt: null,
      auditError: null,
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

  const refreshWork = async () => {
    const errors: string[] = [];

    try {
      await updateProgress("Loading competitor analysis", 10);
      const competitorAnalysis = await payload.findByID({
        collection: "competitor-analyses",
        id: competitorAnalysisId as any,
        overrideAccess: true,
      });

      const competitors = Array.isArray((competitorAnalysis as any)?.competitors) ? (competitorAnalysis as any).competitors : [];
      const profiles: { key: string; profile: any }[] = [];

      if ((competitorAnalysis as any)?.yourProfile && !hasTrafficCoverage((competitorAnalysis as any).yourProfile)) {
        profiles.push({ key: "yourProfile", profile: (competitorAnalysis as any).yourProfile });
      }
      competitors.forEach((profile: any, index: number) => {
        if (!hasTrafficCoverage(profile)) profiles.push({ key: String(index), profile });
      });

      if (profiles.length === 0) {
        await payload.update({
          collection: "client-proposals",
          id,
          data: {
            auditStatus: "completed",
            auditProgress: "Competitor monthly visits already complete|100",
            auditCompletedAt: new Date().toISOString(),
            auditError: null,
          } as any,
          overrideAccess: true,
        });
        return;
      }

      await updateProgress(`Fetching traffic for ${profiles.length} profile(s)`, 25);
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

      await updateProgress("Saving monthly visits", 85);
      const updatedYourProfile = (competitorAnalysis as any)?.yourProfile && typeof (competitorAnalysis as any).yourProfile === "object"
        ? { ...((competitorAnalysis as any).yourProfile as Record<string, any>) }
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
        } as any,
        overrideAccess: true,
      });

      await payload.update({
        collection: "client-proposals",
        id,
        data: {
          auditStatus: "completed",
          auditProgress: errors.length > 0 ? "Competitor monthly visits refreshed with warnings|100" : "Competitor monthly visits refreshed|100",
          auditCompletedAt: new Date().toISOString(),
          auditError: errors.length > 0 ? errors.join("\n") : null,
        } as any,
        overrideAccess: true,
      });
    } catch (e: any) {
      console.error("[refresh-competitor-traffic] Failed:", e?.message || e);
      await payload.update({
        collection: "client-proposals",
        id,
        data: {
          auditStatus: "failed",
          auditProgress: "Competitor monthly visits refresh failed|100",
          auditCompletedAt: new Date().toISOString(),
          auditError: e?.message || "Unexpected competitor traffic refresh error",
        } as any,
        overrideAccess: true,
      }).catch(() => {});
    }
  };

  after(refreshWork);

  return NextResponse.json({ ok: true, status: "running" });
}
