import type { Payload } from "payload";

export const REQUIRED_AUDIT_SLIDE_IDS = ["cover", "executive-summary", "recommendations", "closing"] as const;

export const AUDIT_SLIDE_CATALOG = [
  ["cover", "Google Ads audit", true], ["executive-summary", "Executive summary", true], ["account-glance", "Account at a glance", false],
  ["conversion-tracking", "Conversion tracking", false], ["audit-score", "Audit score and methodology", false], ["structure", "Campaign and ad-group structure", false],
  ["brand-generic", "Brand versus generic", false], ["campaign-performance", "Campaign and category performance", false], ["impression-share", "Impression-share opportunity", false],
  ["competitors", "Auction and competitor analysis", false], ["search-terms", "Search terms and wasted spend", false], ["negatives", "Negative-keyword coverage", false],
  ["ad-copy", "Ad-copy performance", false], ["landing-pages", "Landing-page performance", false], ["recommendations", "Prioritized recommendations", true],
  ["quantified-opportunity", "Quantified opportunity", false], ["how-we-work", "How we work", false], ["working-together", "Working together", false],
  ["closing", "Next steps", true], ["methodology", "Methodology and data appendix", false],
] as const;

export function generateSemanticDeckPayload(audit: any, snapshot: any): any {
  if (!snapshot?.analysis || snapshot.status !== "completed") throw new Error("A completed stored snapshot is required");
  const analysis = snapshot.analysis as any;
  const assessment = (id: string): "opportunity" | "mixed" | "strength" | "not_applicable" => {
    if (id === "conversion-tracking") return analysis.conversionDiagnostics?.primaryActions > 0 ? "strength" : "opportunity";
    if (id === "search-terms") return analysis.searchTerms?.confirmedWasteAmount > 0 ? "opportunity" : "strength";
    if (id === "negatives") return analysis.negatives?.campaignCount + analysis.negatives?.sharedCount > 0 ? "mixed" : "opportunity";
    return "mixed";
  };
  const visibility = audit.deckSlideVisibility ?? {};
  const slides = AUDIT_SLIDE_CATALOG.map(([id, title, required]) => ({
    id, title, required, assessment: assessment(id), completeness: "complete",
    hidden: required ? false : Boolean(visibility[id]), evidence: evidenceForSlide(id, analysis),
  }));
  return {
    version: 2,
    templateSlug: "google-ads-audit-15-slide",
    auditId: String(audit.id),
    snapshotId: String(snapshot.id),
    clientName: audit.businessName,
    provenance: {
      requestedAt: snapshot.requestedAt, capturedAt: snapshot.capturedAt, periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd, accountTimeZone: snapshot.accountTimeZone, currencyCode: snapshot.currencyCode,
      earliestAvailableActivityDate: snapshot.earliestAvailableActivityDate, retentionCaveat: snapshot.retentionCaveat,
      sourceRowCounts: snapshot.sourceRowCounts,
    },
    analysis,
    slides,
  };
}

function evidenceForSlide(id: string, analysis: any): unknown {
  const map: Record<string, unknown> = {
    "account-glance": { totals: analysis.totals, monthlyTrend: analysis.monthlyTrend }, "conversion-tracking": analysis.conversionDiagnostics,
    "audit-score": analysis.scoring, structure: analysis.structure, "brand-generic": analysis.brandGeneric,
    "campaign-performance": analysis.channelPerformance, "impression-share": analysis.impressionShare, competitors: analysis.competitors,
    "search-terms": analysis.searchTerms, negatives: analysis.negatives, "ad-copy": analysis.adCopy,
    "landing-pages": analysis.landingPages, recommendations: analysis.recommendations, "quantified-opportunity": { cpa: analysis.totals?.cpa },
  };
  return map[id] ?? null;
}

export async function generateAuditDeck(payload: Payload, auditId: string): Promise<any> {
  const audit = await (payload as any).findByID({ collection: "google-ads-audits", id: auditId, depth: 0, overrideAccess: true });
  const snapshotId = typeof audit.snapshot === "object" ? audit.snapshot?.id : audit.snapshot;
  if (!snapshotId) throw new Error("Audit has no snapshot");
  const snapshot = await (payload as any).findByID({ collection: "google-ads-audit-snapshots", id: snapshotId, depth: 0, overrideAccess: true });
  const deck = generateSemanticDeckPayload(audit, snapshot);
  await (payload as any).update({ collection: "google-ads-audits", id: auditId, data: { generatedDeckPayload: deck, deckGeneratedAt: new Date().toISOString(), deckVersion: deck.version }, overrideAccess: true });
  return deck;
}
