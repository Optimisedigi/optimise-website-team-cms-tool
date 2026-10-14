import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { relationshipKey } from "@/lib/relationship-id";
import { VersionedComponent } from "@/lib/decks/templates/google-ads-audit-15-slide/VersionedComponent";
import type { SemanticGoogleAdsAuditPayload } from "@/lib/decks/templates/google-ads-audit-15-slide/payload";

export const dynamic = "force-dynamic";

/** Milestone audit decks live only on the client's presentations until published. */
async function loadMilestoneDeck(payload: any, auditId: string, milestoneId: string): Promise<SemanticGoogleAdsAuditPayload | undefined> {
  const row = await payload.findByID({ collection: "google-ads-milestone-audits", id: milestoneId, depth: 0, overrideAccess: true }).catch(() => null);
  if (!row?.deckSlug || String(relationshipKey(row.audit)) !== String(auditId)) return undefined;
  const clientId = relationshipKey(row.client);
  if (!clientId) return undefined;
  const client = await payload.findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true, select: { presentations: true } }).catch(() => null);
  const presentation = (client?.presentations ?? []).find((item: any) => item.deckSlug === row.deckSlug);
  return presentation?.deckPayload as SemanticGoogleAdsAuditPayload | undefined;
}

export default async function AuditPreviewPage({ params, searchParams }: { params: Promise<{ auditId: string }>; searchParams: Promise<{ slide?: string; milestone?: string }> }) {
  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: await headers() });
  if (!user) notFound();
  const { auditId } = await params;
  const query = await searchParams;
  let deck: SemanticGoogleAdsAuditPayload | undefined;
  if (query.milestone) {
    deck = await loadMilestoneDeck(payload, auditId, query.milestone);
  } else {
    const audit = await payload.findByID({ collection: "google-ads-audits", id: auditId, depth: 0, overrideAccess: true }).catch(() => null);
    deck = (audit as any)?.generatedDeckPayload as SemanticGoogleAdsAuditPayload | undefined;
  }
  if (!deck || deck.version !== 2) notFound();
  // Approval reviewers open the whole milestone deck, exactly as the client will see it.
  if (query.milestone && !query.slide) return <VersionedComponent payload={deck} />;
  const selectedId = query.slide ?? deck.slides[0]?.id;
  const selected = deck.slides.find((slide) => slide.id === selectedId);
  if (!selected) notFound();
  const previewPayload: SemanticGoogleAdsAuditPayload = { ...deck, slides: [{ ...selected, hidden: false, required: true, completeness: selected.completeness === "unavailable" ? "partial" : selected.completeness }] };
  return <VersionedComponent payload={previewPayload} previewSlideId={selectedId} />;
}
