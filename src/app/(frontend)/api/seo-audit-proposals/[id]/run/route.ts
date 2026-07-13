import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

// SEO Audit Proposal runs the full Growth Tools engine (GSC + crawl + LLM),
// which can take 1–3 minutes. Keep the function alive for the background work.
export const maxDuration = 300;

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/** Resolve the relation id whether it's an object or a scalar. */
function relId(value: unknown): number | string | null {
  if (value == null) return null;
  if (typeof value === "object") return (value as { id?: number | string }).id ?? null;
  return value as number | string;
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

  // Load the SEO Audit Proposal record.
  let record: any;
  try {
    record = await payload.findByID({
      collection: "seo-audit-proposals",
      id,
      overrideAccess: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "SEO Audit Proposal not found", detail: err?.message }, { status: 404 });
  }

  // Resolve inputs: start from the record, then backfill from a linked
  // client-proposal or client doc. Record values win (explicit overrides).
  let websiteUrl: string | undefined = record.websiteUrl || undefined;
  let gscSiteUrl: string | undefined = record.gscSiteUrl || undefined;
  let businessType: string | undefined = record.businessType || undefined;
  let location: string | undefined = record.location || undefined;
  let searchLanguage: string | undefined = record.searchLanguage || undefined;
  let brandKeywords: string | undefined = record.brandKeywords || undefined;
  let averageOrderValue: number | undefined = record.averageOrderValue ?? undefined;
  let conversionRate: number | undefined = record.conversionRate ?? undefined;
  let costPerLead: number | undefined = record.costPerLead ?? undefined;

  const proposalId = relId(record.proposal);
  const clientId = relId(record.client);

  if (proposalId != null) {
    try {
      const p: any = await payload.findByID({
        collection: "client-proposals",
        id: proposalId,
        overrideAccess: true,
      });
      websiteUrl = websiteUrl || p.websiteUrl || undefined;
      gscSiteUrl = gscSiteUrl || p.gscSiteUrl || undefined;
      businessType = businessType || p.businessType || undefined;
      location = location || p.targetLocation || undefined;
      searchLanguage = searchLanguage || p.searchLanguage || undefined;
      averageOrderValue = averageOrderValue ?? p.averageOrderValue ?? undefined;
      // leadConversionRate is a percentage (e.g. 3 = 3%).
      conversionRate = conversionRate ?? p.leadConversionRate ?? undefined;
    } catch {
      /* proposal fetch failed — fall through with what we have */
    }
  }

  if (clientId != null) {
    try {
      const c: any = await payload.findByID({
        collection: "clients",
        id: clientId,
        overrideAccess: true,
      });
      websiteUrl = websiteUrl || c.websiteUrl || undefined;
      gscSiteUrl = gscSiteUrl || c.gscSiteUrl || undefined;
      businessType = businessType || c.businessType || undefined;
      location = location || c.targetLocation || undefined;
      searchLanguage = searchLanguage || c.searchLanguage || undefined;
      brandKeywords = brandKeywords || c.brandKeywords || undefined;
      averageOrderValue = averageOrderValue ?? c.averageOrderValue ?? undefined;
      conversionRate = conversionRate ?? c.leadConversionRate ?? undefined;
    } catch {
      /* client fetch failed — fall through */
    }
  }

  if (!websiteUrl || !gscSiteUrl) {
    return NextResponse.json(
      { error: "Missing required inputs: websiteUrl and gscSiteUrl (set them on the record, or on the linked client/proposal)" },
      { status: 400 },
    );
  }

  // Persist the resolved inputs + mark running.
  await payload.update({
    collection: "seo-audit-proposals",
    id,
    data: {
      websiteUrl,
      gscSiteUrl,
      businessType: businessType || null,
      location: location || null,
      searchLanguage: searchLanguage || null,
      brandKeywords: brandKeywords || null,
      averageOrderValue: averageOrderValue ?? null,
      conversionRate: conversionRate ?? null,
      costPerLead: costPerLead ?? null,
      status: "running",
      progress: "Starting SEO Audit Proposal|0",
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    } as any,
    overrideAccess: true,
  });

  const setProgress = (stage: string, percent: number) =>
    payload
      .update({
        collection: "seo-audit-proposals",
        id,
        data: { progress: `${stage}|${percent}` } as any,
        overrideAccess: true,
      })
      .catch(() => {});

  // Build the engine request body. Brand terms are split from the textarea
  // (newline OR comma separated). conversionRate is a percentage here; the
  // Growth Tools engine normalises 3 → 0.03.
  const brandTerms = (brandKeywords || "")
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

  const engineBody: Record<string, unknown> = {
    websiteUrl,
    gscSiteUrl,
    businessType: businessType || "other",
    includeTopicClusters: true,
  };
  if (location) engineBody.location = location;
  if (searchLanguage) engineBody.language = searchLanguage;
  if (brandTerms.length > 0) engineBody.brandTerms = brandTerms;
  if (typeof averageOrderValue === "number") engineBody.averageOrderValue = averageOrderValue;
  if (typeof conversionRate === "number") engineBody.conversionRate = conversionRate;
  if (typeof costPerLead === "number") engineBody.costPerLead = costPerLead;

  // Run the heavy work in the background; the button polls /status.
  const work = async () => {
    try {
      await setProgress("Contacting analysis engine", 5);

      const res = await fetch(`${GROWTH_TOOLS_URL}/api/seo-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY! },
        body: JSON.stringify(engineBody),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Engine returned ${res.status}: ${text.slice(0, 500)}`);
      }

      await setProgress("Saving report", 90);
      const report = await res.json();
      const verdict = report?.synthesis?.verdict ?? null;

      await payload.update({
        collection: "seo-audit-proposals",
        id,
        data: {
          report,
          verdict,
          status: "completed",
          progress: "Complete|100",
          completedAt: new Date().toISOString(),
          error: null,
        } as any,
        overrideAccess: true,
      });

      console.log(`[run-seo-proposal] Completed for record ${id}`);
    } catch (e: any) {
      console.error("[run-seo-proposal] Failed:", e?.message || e);
      await payload
        .update({
          collection: "seo-audit-proposals",
          id,
          data: {
            status: "failed",
            progress: "Failed|100",
            completedAt: new Date().toISOString(),
            error: e?.message || "Unexpected error",
          } as any,
          overrideAccess: true,
        })
        .catch(() => {});
    }
  };

  after(work);

  return NextResponse.json({ ok: true, status: "running" });
}
