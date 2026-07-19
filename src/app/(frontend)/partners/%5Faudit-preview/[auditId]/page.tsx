import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { VersionedComponent } from "@/lib/decks/templates/google-ads-audit-15-slide/VersionedComponent";
import type { SemanticGoogleAdsAuditPayload } from "@/lib/decks/templates/google-ads-audit-15-slide/payload";

export const dynamic = "force-dynamic";

export default async function AuditPreviewPage({ params, searchParams }: { params: Promise<{ auditId: string }>; searchParams: Promise<{ slide?: string }> }) {
  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: await headers() });
  if (!user) notFound();
  const audit = await payload.findByID({ collection: "google-ads-audits", id: (await params).auditId, depth: 0, overrideAccess: true }).catch(() => null);
  const deck = (audit as any)?.generatedDeckPayload as SemanticGoogleAdsAuditPayload | undefined;
  if (!deck || deck.version !== 2) notFound();
  const selectedId = (await searchParams).slide ?? deck.slides[0]?.id;
  const selected = deck.slides.find((slide) => slide.id === selectedId);
  if (!selected) notFound();
  const previewPayload: SemanticGoogleAdsAuditPayload = { ...deck, slides: [{ ...selected, hidden: false, required: true, completeness: selected.completeness === "unavailable" ? "partial" : selected.completeness }] };
  return <VersionedComponent payload={previewPayload} previewSlideId={selectedId} />;
}
