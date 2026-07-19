import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { generateAuditDeck, REQUIRED_AUDIT_SLIDE_IDS } from "@/lib/google-ads-audit-snapshots";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.visibility || typeof body.visibility !== "object" || Array.isArray(body.visibility)) return NextResponse.json({ error: "visibility map is required" }, { status: 400 });
  for (const id of REQUIRED_AUDIT_SLIDE_IDS) if (body.visibility[id] === true) return NextResponse.json({ error: `Required slide ${id} cannot be hidden` }, { status: 400 });
  const { id } = await params;
  const audit = await payload.findByID({ collection: "google-ads-audits", id, depth: 0, overrideAccess: true });
  const deck = (audit as any).generatedDeckPayload;
  if (!deck || !Array.isArray(deck.slides)) return NextResponse.json({ error: "Generate the deck before changing slide visibility" }, { status: 400 });
  const knownIds = new Set(deck.slides.map((slide: any) => slide.id));
  if (Object.keys(body.visibility).some((slideId) => !knownIds.has(slideId))) return NextResponse.json({ error: "Unknown slide ID" }, { status: 400 });
  const requiredHidden = deck.slides.find((slide: any) => slide.required && body.visibility[slide.id] === true);
  if (requiredHidden) return NextResponse.json({ error: `Required slide ${requiredHidden.id} cannot be hidden` }, { status: 400 });
  await payload.update({ collection: "google-ads-audits", id, data: { deckSlideVisibility: body.visibility } as any, overrideAccess: true });
  const regenerated = await generateAuditDeck(payload, id);
  return NextResponse.json({ ok: true, visibility: body.visibility, visibleSlides: regenerated.slides.filter((slide: any) => !slide.hidden).length });
}
