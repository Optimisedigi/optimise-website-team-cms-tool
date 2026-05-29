import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { buildLedgerSummary } from "@/lib/client-value-ledger";
import { pinFromRequest, verifyClientHubPin } from "@/lib/client-hub-auth";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const payload = await getPayload({ config: await config });
  const auth = await verifyClientHubPin(payload, slug, pinFromRequest(request));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const result = await payload.find({
    collection: "client-value-ledger-items" as any,
    where: { and: [{ client: { equals: auth.clientId } }, { visibility: { equals: "client_visible" } }] },
    sort: "-occurredAt",
    limit: 50,
    depth: 1,
    overrideAccess: true,
  });
  const items = result.docs as Array<Record<string, unknown>>;
  const summary = buildLedgerSummary(
    items.map((item) => ({
      client: auth.clientId,
      occurredAt: String(item.occurredAt || ""),
      category: String(item.category || "other"),
      title: String(item.title || ""),
      summary: String(item.summary || ""),
      impactValue: typeof item.impactValue === "number" ? item.impactValue : null,
      impactUnit: typeof item.impactUnit === "string" ? item.impactUnit : null,
    })),
  );
  return NextResponse.json({ ok: true, items, summary });
}
