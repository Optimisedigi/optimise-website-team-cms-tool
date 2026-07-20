import type { Payload } from "payload";

export const REQUIRED_AUDIT_SLIDE_IDS = ["cover", "executive-summary", "recommendations", "closing"] as const;

export const AUDIT_SLIDE_CATALOG = [
  ["cover", "Google Ads audit", true], ["executive-summary", "Executive summary", true], ["account-glance", "Account at a glance", false],
  ["conversion-tracking", "Conversion tracking", false], ["audit-score", "Audit score and methodology", false], ["structure", "Campaign and ad-group structure", false],
  ["brand-generic", "Brand versus generic", false], ["campaign-performance", "Campaign and category performance", false], ["impression-share", "Impression-share opportunity", false],
  ["competitors", "Competitor analysis", false], ["search-terms", "Search terms and wasted spend", false], ["negatives", "Negative-keyword coverage", false],
  ["ad-copy", "Ad-copy performance", false], ["landing-pages", "Landing-page performance", false], ["recommendations", "Prioritized recommendations", true],
  ["quantified-opportunity", "Quantified opportunity", false], ["how-we-work", "How we work", false], ["working-together", "Working together", false],
  ["closing", "Next steps", true], ["methodology", "Methodology and data appendix", false],
] as const;

// The immutable snapshot keeps the full evidence (e.g. every classified search
// term — often 100k+ rows). The presentation payload is shipped to the browser
// and stored on the client, so embed only what the slides actually render.
function trimAnalysisForPresentation(analysis: any): any {
  const classified = Array.isArray(analysis.searchTerms?.classified) ? analysis.searchTerms.classified : [];
  const renderedClassified = classified
    .filter((term: any) => term?.category !== "relevant")
    .sort((a: any, b: any) => (Number(b?.spend) || 0) - (Number(a?.spend) || 0))
    .slice(0, 25);
  const pages = Array.isArray(analysis.landingPages?.pages) ? analysis.landingPages.pages.slice(0, 25) : analysis.landingPages?.pages;
  return {
    ...analysis,
    searchTerms: { ...analysis.searchTerms, classified: renderedClassified },
    landingPages: { ...analysis.landingPages, pages },
  };
}

export function generateSemanticDeckPayload(audit: any, snapshot: any): any {
  if (!snapshot?.analysis || snapshot.status !== "completed") throw new Error("A completed stored snapshot is required");
  const analysis = snapshot.analysis as any;
  const presentationAnalysis = trimAnalysisForPresentation(analysis);
  const assessment = (id: string): "opportunity" | "mixed" | "strength" | "not_applicable" => {
    if (id === "conversion-tracking") return analysis.conversionDiagnostics?.primaryActions > 0 ? "strength" : "opportunity";
    if (id === "search-terms") return analysis.searchTerms?.confirmedWasteAmount > 0 ? "opportunity" : "strength";
    if (id === "negatives") return analysis.negatives?.campaignCount + analysis.negatives?.sharedCount > 0 ? "mixed" : "opportunity";
    return "mixed";
  };
  const visibility = audit.deckSlideVisibility ?? {};
  const counts = snapshot.sourceRowCounts ?? {};
  const noDataAssessment = (id: string) => {
    if (id === "impression-share" && Number(counts.campaign_impression_share ?? 0) === 0) return true;
    if (id === "competitors" && Number(counts.paid_serp_competitors ?? 0) === 0) return true;
    if (id === "brand-generic" && Number(counts.search_terms ?? 0) === 0) return true;
    if (id === "search-terms" && Number(counts.search_terms ?? 0) === 0) return true;
    if (id === "landing-pages" && Number(counts.landing_page_views ?? 0) === 0) return true;
    return false;
  };
  const slides = AUDIT_SLIDE_CATALOG.map(([id, title, required]) => {
    const isRequired = required || (id === "quantified-opportunity" && analysis.totals?.cpa != null);
    const slideAssessment = (id === "quantified-opportunity" && analysis.totals?.cpa == null) || noDataAssessment(id) ? "not_applicable" : assessment(id);
    return { id, title, required: isRequired, assessment: slideAssessment, completeness: "complete", hidden: isRequired ? false : Boolean(visibility[id]), evidence: evidenceForSlide(id, presentationAnalysis) };
  });
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
      rubricVersion: analysis.scoring?.rubricVersion ?? snapshot.rubricVersion,
      unknownDataPolicy: analysis.scoring?.unknownDataPolicy,
    },
    analysis: presentationAnalysis,
    scorecards: analysis.scoring?.categories ?? [],
    slides,
  };
}

function evidenceForSlide(id: string, analysis: any): unknown {
  const map: Record<string, unknown> = {
    "account-glance": { totals: analysis.totals, monthlyTrend: analysis.monthlyTrend }, "conversion-tracking": analysis.conversionDiagnostics,
    "audit-score": { scorecard: analysis.scoring, categories: analysis.scoring?.categories ?? [] }, structure: analysis.structure, "brand-generic": analysis.brandGeneric,
    "campaign-performance": analysis.channelPerformance, "impression-share": analysis.impressionShare, competitors: analysis.competitors,
    "search-terms": analysis.searchTerms, negatives: analysis.negatives, "ad-copy": analysis.adCopy,
    "landing-pages": analysis.landingPages, recommendations: analysis.recommendations, "quantified-opportunity": { cpa: analysis.totals?.cpa },
  };
  return map[id] ?? null;
}

export async function generateAuditDeck(payload: Payload, auditId: string): Promise<any> {
  const audit = await (payload as any).findByID({
    collection: "google-ads-audits", id: auditId, depth: 0, overrideAccess: true,
    select: { snapshot: true, client: true, businessName: true, deckSlideVisibility: true, presentationPublished: true },
  });
  const snapshotId = typeof audit.snapshot === "object" ? audit.snapshot?.id : audit.snapshot;
  const clientId = typeof audit.client === "object" ? audit.client?.id : audit.client;
  if (!snapshotId) throw new Error("Audit has no snapshot");
  if (!clientId) throw new Error("Audit is not linked to a client");
  const snapshot = await (payload as any).findByID({ collection: "google-ads-audit-snapshots", id: snapshotId, depth: 0, overrideAccess: true });
  const deck = generateSemanticDeckPayload(audit, snapshot);
  const templateResult = await (payload as any).find({ collection: "deck-templates", where: { templateSlug: { equals: "google-ads-audit-15-slide" } }, limit: 1, depth: 0, overrideAccess: true });
  const template = templateResult.docs?.[0] ?? await (payload as any).create({
    collection: "deck-templates", overrideAccess: true,
    data: { templateSlug: "google-ads-audit-15-slide", name: "Google Ads Audit standardized deck", description: "Generated from an immutable Google Ads audit snapshot", category: "google-ads-audit", isActive: true },
  });
  const client = await (payload as any).findByID({
    collection: "clients", id: clientId, depth: 0, overrideAccess: true,
    select: { slug: true, presentations: true },
  });
  const deckSlug = `google-ads-audit-${audit.id}`;
  const marker = `[google-ads-audit:${audit.id}]`;
  const presentations = Array.isArray(client.presentations) ? [...client.presentations] : [];
  const existingIndex = presentations.findIndex((item: any) => item.deckSlug === deckSlug || String(item.notes ?? "").includes(marker));
  const existing = existingIndex >= 0 ? presentations[existingIndex] : {};
  const presentation = {
    ...existing,
    title: `${audit.businessName} Google Ads Audit`,
    deckSlug,
    deckUrl: `/partners/${client.slug}/${deckSlug}`,
    kind: "deck",
    isPublic: existing.isPublic === true && audit.presentationPublished === true,
    notes: `${marker} Generated from immutable snapshot ${snapshot.id}.`,
    templateSlug: template.id,
    deckPayload: deck,
  };
  if (existingIndex >= 0) presentations[existingIndex] = presentation;
  else presentations.push(presentation);
  await (payload as any).update({ collection: "clients", id: clientId, data: { presentations }, overrideAccess: true });
  const generatedAt = new Date().toISOString();
  await (payload as any).update({ collection: "google-ads-audits", id: auditId, data: { generatedDeckPayload: deck, deckGeneratedAt: generatedAt, deckVersion: deck.version, presentationPublished: presentation.isPublic }, overrideAccess: true });
  return { ...deck, publicPath: presentation.deckUrl };
}

export async function setAuditDeckPublished(payload: Payload, auditId: string, published: boolean): Promise<string> {
  const audit = await (payload as any).findByID({ collection: "google-ads-audits", id: auditId, depth: 0, overrideAccess: true });
  const clientId = typeof audit.client === "object" ? audit.client?.id : audit.client;
  if (!clientId || !audit.generatedDeckPayload) throw new Error("Generate the audit deck before publishing");
  const client = await (payload as any).findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true });
  const deckSlug = `google-ads-audit-${audit.id}`;
  const presentations = (client.presentations ?? []).map((item: any) => item.deckSlug === deckSlug ? { ...item, isPublic: published } : item);
  if (!presentations.some((item: any) => item.deckSlug === deckSlug)) throw new Error("Generated client presentation is missing");
  await (payload as any).update({ collection: "clients", id: clientId, data: { presentations }, overrideAccess: true });
  await (payload as any).update({ collection: "google-ads-audits", id: auditId, data: { presentationPublished: published }, overrideAccess: true });
  return `/partners/${client.slug}/${deckSlug}`;
}
