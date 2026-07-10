import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export const maxDuration = 300;

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const CONTENT_RESEARCH_TIMEOUT_MS = 180_000;

function pickContentResearchKeywords(proposal: any): string[] {
  const keywordCategories = proposal.keywordCategories as { categoryName?: string; keywords?: string }[] | null;
  const legacyKeywordsRaw = proposal.keywords as string | null;

  if (keywordCategories && keywordCategories.length > 1) {
    const catKeywordLists = keywordCategories.map((c) =>
      (c.keywords || "")
        .split("\n")
        .map((k: string) => k.trim())
        .filter(Boolean),
    );
    const topKeywords: string[] = [];
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
    return topKeywords;
  }

  const raw = keywordCategories?.length
    ? keywordCategories.map((c) => c.keywords || "").join("\n")
    : legacyKeywordsRaw || "";

  return raw
    .split("\n")
    .map((k: string) => k.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function totalQuestionsFor(researches: any[]): number {
  return researches.reduce((total, research) => {
    const clusters = Array.isArray(research?.clusters) ? research.clusters : [];
    return total + clusters.reduce((sum: number, cluster: any) => sum + (Array.isArray(cluster?.questions) ? cluster.questions.length : 0), 0);
  }, 0);
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
    console.error(`[refresh-content-questions] Failed to fetch proposal ${id}:`, err?.message || err);
    return NextResponse.json({ error: "Proposal not found", detail: err?.message }, { status: 404 });
  }

  const keywords = pickContentResearchKeywords(proposal);
  if (keywords.length === 0) {
    return NextResponse.json(
      { error: "No proposal keywords found. Add keyword categories or legacy keywords first." },
      { status: 400 },
    );
  }

  const location = proposal.targetLocation ? String(proposal.targetLocation).split(":")[0] : "au";
  const deadlineAt = Date.now() + CONTENT_RESEARCH_TIMEOUT_MS;

  const results = await Promise.allSettled(
    keywords.map((keyword) => {
      const remainingMs = Math.max(1000, deadlineAt - Date.now());
      return fetch(`${GROWTH_TOOLS_URL}/api/content-research`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY! },
        body: JSON.stringify({ keyword, location }),
        signal: AbortSignal.timeout(remainingMs),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`Content research failed for "${keyword}": ${res.status}`);
        return res.json();
      });
    }),
  );

  const refreshed = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map((r) => r.value);
  const failed = results.length - refreshed.length;

  if (refreshed.length === 0) {
    return NextResponse.json(
      {
        error: "Content questions refresh failed for every keyword. Existing questions were left untouched.",
        attempted: keywords.length,
      },
      { status: 504 },
    );
  }

  // Only replace the existing section after we have fresh data and all new
  // records have been created, so a flaky upstream or CMS write failure never
  // wipes the already-generated report questions.
  const existing = await payload.find({
    collection: "content-researches",
    where: { proposal: { equals: Number(id) } },
    limit: 100,
    overrideAccess: true,
  });

  const createdIds: number[] = [];
  for (const research of refreshed) {
    const created = await payload.create({
      collection: "content-researches",
      data: {
        keyword: research.keyword,
        location: research.location || location,
        totalQuestions: research.totalQuestions || 0,
        clusters: research.clusters || [],
        externalId: research.id || null,
        proposal: Number(id),
      },
      overrideAccess: true,
    });
    createdIds.push(created.id as number);
  }

  for (const doc of existing.docs) {
    await payload.delete({
      collection: "content-researches",
      id: doc.id,
      overrideAccess: true,
    });
  }

  const preservedArrayFields = {
    competitors: proposal.competitors ?? [],
    keywordCategories: proposal.keywordCategories ?? [],
    googleMapsUrls: proposal.googleMapsUrls ?? [],
    flightPlanImages: proposal.flightPlanImages ?? [],
    missionResourcesImages: proposal.missionResourcesImages ?? [],
  };

  await payload.update({
    collection: "client-proposals",
    id,
    data: {
      contentResearch: createdIds,
      ...preservedArrayFields,
    } as any,
    overrideAccess: true,
  });

  return NextResponse.json({
    ok: true,
    refreshed: refreshed.length,
    failed,
    questions: totalQuestionsFor(refreshed),
    contentResearchIds: createdIds,
  });
}
