import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { resolveBrandTerms } from "@/lib/brand-terms";

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

  // Fetch the audit record
  let audit: any;
  try {
    audit = await payload.findByID({
      collection: "google-ads-audits",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const { customerId } = audit;
  if (!customerId) {
    return NextResponse.json(
      { error: "Missing required field: customerId" },
      { status: 400 }
    );
  }

  // Archive current scores to history if this is a re-run
  const existingHistory = (audit.history as any[] | undefined) ?? [];
  if (audit.overallScore != null && audit.scoredReport) {
    const stepScores = (audit.scoredReport as any)?.steps?.map((s: any) => ({
      step: s.step, name: s.name, score: s.score,
    })) ?? null;

    existingHistory.push({
      runDate: audit.auditCompletedAt || audit.auditStartedAt || new Date().toISOString(),
      overallScore: audit.overallScore,
      stepScores,
      notes: `Re-run triggered — previous score: ${audit.overallScore}/100`,
    });
  }

  // Preserve array fields that Payload clears on partial updates
  const preservedArrayFields = {
    conversionObjectives: audit.conversionObjectives ?? "",
    brandTerms: audit.brandTerms ?? "",
    history: existingHistory,
    actionItems: (audit.actionItems as any[] | undefined) ?? [],
  };

  // Mark as running
  await payload.update({
    collection: "google-ads-audits",
    id,
    data: {
      auditStatus: "running",
      auditProgress: "Starting audit|0",
      auditStartedAt: new Date().toISOString(),
      auditCompletedAt: null,
      auditError: null,
      ...preservedArrayFields,
    } as any,
    overrideAccess: true,
  });

  // Helper to update progress (non-blocking)
  const updateProgress = (stage: string, percent: number) =>
    payload.update({
      collection: "google-ads-audits",
      id,
      data: { auditProgress: `${stage}|${percent}`, ...preservedArrayFields } as any,
      overrideAccess: true,
    }).catch(() => {});

  // Return immediately — run work in background
  const auditWork = async () => {
    try {
      await updateProgress("Pulling data from Google Ads API", 10);

      // Build manual inputs from CMS fields.
      // Brand terms: per-audit override (audit.brandTerms) takes priority,
      // otherwise fall back to the canonical client field (clients.brandKeywords).
      let clientBrandKeywords: string | undefined;
      const clientRef = (audit as any).client;
      const clientId = typeof clientRef === "object" && clientRef ? clientRef.id : clientRef;
      if (clientId) {
        try {
          const clientDoc = await payload.findByID({
            collection: "clients",
            id: clientId,
            depth: 0,
            overrideAccess: true,
          });
          clientBrandKeywords = (clientDoc as any)?.brandKeywords;
        } catch { /* fall through with empty fallback */ }
      }
      // Legacy support: brandTerms may historically have been an array of {term} objects
      const brandTermsRaw = typeof audit.brandTerms === "string"
        ? audit.brandTerms
        : (audit.brandTerms as any[] | undefined)?.map((bt: any) => bt.term).filter(Boolean).join("\n");
      const brandTerms = resolveBrandTerms(clientBrandKeywords, brandTermsRaw);
      const conversionObjectives = typeof audit.conversionObjectives === "string"
        ? audit.conversionObjectives.split("\n").map((t: string) => t.trim()).filter(Boolean)
        : (audit.conversionObjectives as any[] | undefined)?.map((co: any) => co.objective).filter(Boolean);

      // Call the comprehensive audit endpoint on growth-tools
      const response = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/comprehensive-audit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY!,
        },
        body: JSON.stringify({
          customerId: customerId.replace(/-/g, ""),
          brandTerms: brandTerms?.length ? brandTerms : undefined,
          conversionObjectives: conversionObjectives?.length ? conversionObjectives : undefined,
          monthlySpend: audit.monthlySpend || undefined,
          businessContext: audit.notes || undefined,
          clientName: audit.businessName || undefined,
          contactName: undefined,
          presentationUrl: audit.slug
            ? `https://www.optimisedigital.online/partners/google-ads-audit/${audit.slug}?pin=${audit.presentationPin || ""}`
            : undefined,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Growth tools audit failed (${response.status}): ${errorBody}`);
      }

      await updateProgress("Scoring complete, storing results", 70);

      const result = await response.json();

      // Auto-generate default curation with all items selected
      const scored = result.scored;
      const defaultCuration = {
        stepFindings: Object.fromEntries(
          scored.steps.map((s: any) => [s.step, s.findings.map((_: any, i: number) => i)])
        ),
        stepRecommendations: Object.fromEntries(
          scored.steps.map((s: any) => [s.step, s.recommendations.map((_: any, i: number) => i)])
        ),
        emailQuickWins: scored.quickWins.map((_: any, i: number) => i),
        presentationQuickWins: scored.quickWins.map((_: any, i: number) => i),
      };

      // Store raw data + scored report + email HTML + default curation on the CMS record
      await payload.update({
        collection: "google-ads-audits",
        id,
        data: {
          rawData: result.raw,
          scoredReport: result.scored,
          overallScore: result.scored.overallScore,
          emailHtml: result.emailHtml || null,
          curatedFindings: defaultCuration,
          auditProgress: "Storing results|90",
          ...preservedArrayFields,
        } as any,
        overrideAccess: true,
      });

      // Mark as completed
      await payload.update({
        collection: "google-ads-audits",
        id,
        data: {
          auditStatus: "completed",
          auditProgress: "Complete|100",
          auditCompletedAt: new Date().toISOString(),
          ...preservedArrayFields,
        } as any,
        overrideAccess: true,
      });

    } catch (e: any) {
      console.error(`[GoogleAdsAudit] Pipeline failed for ${id}:`, e.message);

      await payload.update({
        collection: "google-ads-audits",
        id,
        data: {
          auditStatus: "failed",
          auditProgress: "Failed|100",
          auditError: e.message || "Unknown error",
          ...preservedArrayFields,
        } as any,
        overrideAccess: true,
      }).catch(() => {});
    }
  };

  after(auditWork);
  return NextResponse.json({ ok: true, status: "running" });
}
