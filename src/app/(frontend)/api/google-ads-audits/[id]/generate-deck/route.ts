import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { generateAuditDeck } from "@/lib/google-ads-audit-snapshots";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const deck = await generateAuditDeck(payload, (await params).id);
    return NextResponse.json({ ok: true, deckVersion: deck.version, slideCount: deck.slides.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Deck generation failed" }, { status: 400 });
  }
}
